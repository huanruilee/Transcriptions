#!/usr/bin/env python3
"""《四法印》逐字稿 v3 builder（候選版，待品質閘門驗證後取代 v1）。

v1 的實測缺陷：
  * 把 whisper 語速片段直接當句子 → 11 講合計 8309 句無句終標點、標點全是逗號、
    且一句被切成兩半（「如果想要學習釋量論的第二品」／下一段才接續）。
  * 錯字只做少量名相替換，佛法專家一眼可見。

v3 的做法（三個來源分工，全部可稽核）：
  句子邊界 = ASR 自身句終標點 ＋ 官方整編底本句界（底本句界經字級對齊後
             落在 ASR 的詞邊界，不會切詞中間）。
  句子文字 = ASR 原文（保留講者全部口語，不以整編稿覆蓋）。
  錯　　字 = 全域字級對齊的等長替換（底本字）＋ 詞表同音保鮮器。
  時間　碼 = 一律來自 ASR（絕不由底本推算）。
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
if not (BASE / "courses" / "四法印").exists():
    BASE = Path.cwd()
COURSE = BASE / "courses" / "四法印"
SOURCE_DIR = COURSE / "source_text"
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"

HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
SENT_END = "。！？"
MAX_SENTENCE_LEN = 95
MAX_PARAGRAPH_SENTENCES = 18
BREAKS = "，。！？；："
HEADER_PAT = re.compile(r"^(《|講解：|日期：|地點：|課程：)")
HEADING_PAT = re.compile(r"^\d+\s*[.．]")

# PDF 字型子集產生的罕見字（講者原文被 PDF 編碼成相容字元）
GLYPH_FIX = {
    "㈻": "學", "㆗": "的", "㆔": "三", "㆕": "四", "㈲": "有",
    "㈾": "資", "㉂": "自", "㉃": "至", "㊞": "印", "㊪": "宗",
}

# 校字閘門
MAX_SAME_LEN_EDIT = 3      # 等長替換最多改幾字
MIN_WINDOW_SIMILARITY = 0.6
MIN_GLOSSARY_FREQUENCY = 3
MIN_GLOSSARY_FREQUENCY_2 = 20
MIN_TIGHT_RATIO = 0.4
STOP_CHARS = set("的了是在有和就不人這那他她它們中與為以而上個一二三四五六七八九十大小好很"
                  "把被從對將已經要能會沒麼呢嗎吧啊呀哦嗯又再也都只可或者所其此之乎着得"
                  "於我你他她它們這那什麼之其而但卻並且又再就才還很更最")
ORTHOGRAPHIC_VARIANTS = {
    frozenset(pair) for pair in [
        ("他", "它"), ("做", "作"), ("佔", "占"), ("裏", "裡"), ("箸", "著"),
        ("着", "著"), ("裏", "里"), ("象", "像"), ("曬", "晒"), ("迴", "回"),
    ]
}


def fix_glyphs(text: str) -> str:
    for bad, good in GLYPH_FIX.items():
        text = text.replace(bad, good)
    return text


def load_base(session_id: str) -> str:
    raw = fix_glyphs((SOURCE_DIR / f"lecture_{session_id}.txt").read_text(encoding="utf-8"))
    lines = [line.strip() for line in raw.split("\n") if line.strip()]
    head = 0
    for index, line in enumerate(lines[:8]):
        if HEADER_PAT.match(line):
            head = index + 1
    lines = lines[head:]
    body = []
    for line in lines:
        if HEADING_PAT.match(line) and len(line) < 40:
            continue
        if len(line) < 25 and "《" in line:
            continue
        body.append(line)
    return "".join(body)


def base_sentences(text: str) -> list[tuple[str, int, int]]:
    out: list[tuple[str, int, int]] = []
    buf: list[str] = []
    start = consumed = 0
    for ch in text:
        buf.append(ch)
        consumed += len(HAN.findall(ch))
        if ch in SENT_END:
            sentence = "".join(buf).strip()
            if sentence and len(HAN.findall(sentence)) >= 4:
                out.append((sentence, start, consumed))
            buf, start = [], consumed
    tail = "".join(buf).strip()
    if tail and len(HAN.findall(tail)) >= 4:
        out.append((tail + "。", start, consumed))
    return out


def to_traditional(text: str) -> str:
    """簡繁正體化：whisper 對某些段落會整段輸出簡體（如 05 講 seg-0034）。

    必須在切句與校字之前做：底本與校字比對都是繁體，簡體殘留會讓
    對齊漂移、也讓讀者看到簡體字。
    """
    try:
        from opencc import OpenCC
    except ImportError:
        return text
    return _converter().convert(text)


_CONVERTER = None


def _converter():
    global _CONVERTER
    if _CONVERTER is None:
        from opencc import OpenCC
        _CONVERTER = OpenCC("s2twp")
    return _CONVERTER


def normalize_asr(segments: list[dict]) -> tuple[str, list[int]]:
    """ASR → (顯示文字, 每字對應 segment index)。雜訊標記轉停頓、簡體轉正體。"""
    chars: list[str] = []
    seg_of: list[int] = []
    for index, seg in enumerate(segments):
        text = to_traditional(seg["text"])
        for ch in text:
            chars.append(ch)
            seg_of.append(index)
    text = "".join(chars)
    text = re.sub(r"[�＼]", "，", text)
    text = re.sub(r"[Ａ-Ｚａ-ｚ]", "", text)
    text = text.replace(",", "，").replace("?", "？").replace("!", "！")
    text = re.sub(r"，{2,}", "，", text)
    text = re.sub(r"，([。！？；：])", r"\1", text)
    return text, seg_of


def comparable_positions(text: str) -> tuple[str, list[int]]:
    chars: list[str] = []
    positions: list[int] = []
    for index, ch in enumerate(text):
        if HAN.match(ch):
            chars.append(ch)
            positions.append(index)
    return "".join(chars), positions


def build_corpus(session_ids: list[str]) -> Counter:
    """底本詞頻（n-gram 只在同一子句內組字）。"""
    run_re = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\s]+")
    counter: Counter = Counter()
    for session_id in session_ids:
        for run in run_re.findall(load_base(session_id)):
            stream = "".join(HAN.findall(run))
            for n in (2, 3, 4, 5):
                for i in range(len(stream) - n + 1):
                    counter[stream[i:i + n]] += 1
    return counter


def glossary_index(corpus: Counter) -> dict[str, set]:
    index: dict[str, set] = {}
    for term, freq in corpus.items():
        n = len(term)
        if not (2 <= n <= 5):
            continue
        if freq < (MIN_GLOSSARY_FREQUENCY_2 if n == 2 else MIN_GLOSSARY_FREQUENCY):
            continue
        if n >= 3:
            left = corpus.get(term[:-1], 0)
            right = corpus.get(term[1:], 0)
            if freq / left < MIN_TIGHT_RATIO or freq / right < MIN_TIGHT_RATIO:
                continue
        for pos, ch in enumerate(term):
            index.setdefault(term[:pos] + "?" + term[pos + 1:], set()).add((term, ch, pos, freq))
    return index


def syllables(text: str) -> str:
    try:
        from pypinyin import lazy_pinyin
    except ImportError:
        return text
    return "".join(lazy_pinyin(text))


def split_long_unpunctuated(text: str, cuts: list[int], comp_positions: list[int],
                            base_sents, base_stream: str, banned: set[int]) -> list[int]:
    """whisper 偶爾整段無標點（05 講 seg-0034 一類），句子會長到 400 字。

    對這些區段，用底本句界（字級對齊後）再切一刀；切點必須落在 ASR 的
    可比對字邊界，不能切詞中間。
    """
    # 底本句 → ASR 可比對位置
    asr_comp = "".join(HAN.findall(text))
    sm = difflib.SequenceMatcher(None, asr_comp, base_stream, autojunk=False)
    b2a: dict[int, int] = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                b2a[j1 + k] = i1 + k
    extra: list[int] = []
    for _sentence, b0, b1 in base_sents:
        idxs = [b2a[j] for j in range(b0, b1) if j in b2a]
        if not idxs:
            continue
        last = max(idxs)
        if last + 1 >= len(comp_positions):
            continue
        pos = comp_positions[last] + 1
        # 落在哪個切點區間內
        for index in range(len(cuts) - 1):
            if cuts[index] < pos < cuts[index + 1]:
                if cuts[index + 1] - cuts[index] > MAX_SENTENCE_LEN and pos not in banned:
                    extra.append(pos)
                break
    if not extra:
        return cuts
    return sorted(set(cuts) | set(extra))


def forbidden_spans(text: str, edits: list[dict]) -> set[int]:
    """校正區間（顯示文字索引）：切點不得落在其中，否則句內位置稽核會斷。"""
    positions = [i for i, ch in enumerate(text) if HAN.match(ch)]
    banned: set[int] = set()
    for edit in edits:
        start, end = edit["compStart"], edit["compEnd"]
        if start >= len(positions) or end - 1 >= len(positions):
            continue
        banned.update(range(positions[start] + 1, positions[end - 1] + 1))
    return banned


def cut_positions(text: str, base_sents, base_stream: str, comp_positions: list[int],
                  banned: set[int]) -> list[int]:
    """回傳句子切點（顯示文字索引，切點為句末+1）。

    規則：
      1. ASR 自身的句終標點（。！？）必為切點。
      2. 底本句界：底本句的最後一個可比對字在 ASR 的位置 → 往後找最近的 ASR
         句終標點（窗口 ≤ 12 字），找不到就用對齊位置本身（底本句界本身
         是詞邊界，不會切詞中間）。
      3. 切點間隔 < 6 字者合併（避免碎句）。
    """
    cuts: set[int] = set()
    for index, ch in enumerate(text):
        if ch in SENT_END:
            cuts.add(index + 1)
    cuts -= banned

    # 底本句 → ASR 位置：先用等值對照
    asr_comp = "".join(HAN.findall(text))
    sm = difflib.SequenceMatcher(None, asr_comp, base_stream, autojunk=False)
    b2a: dict[int, int] = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                b2a[j1 + k] = i1 + k
    for _sentence, b0, b1 in base_sents:
        idxs = [b2a[j] for j in range(b0, b1) if j in b2a]
        if not idxs:
            continue
        last = max(idxs)
        if last + 1 >= len(comp_positions):
            continue
        pos = comp_positions[last]
        # 往後找最近的 ASR 句終標點
        limit = min(len(text), pos + 13)
        k = pos
        while k < limit and text[k] not in SENT_END:
            k += 1
        candidate = k + 1 if k < limit else pos + 1
        if candidate not in banned:
            cuts.add(candidate)

    ordered = sorted(cuts)
    merged: list[int] = []
    for cut in ordered:
        if merged and cut - merged[-1] < 6:
            continue
        merged.append(cut)
    if merged and merged[-1] != len(text):
        merged.append(len(text))
    return merged


def build_session(session_id: str, corpus: Counter, glossary: dict) -> dict:
    folder = EVIDENCE / f"playlist-{session_id}"
    raw = json.loads((folder / "raw_asr.json").read_text(encoding="utf-8"))
    outline = json.loads((folder / "outline.json").read_text(encoding="utf-8"))
    segments = raw["segments"]
    for index, seg in enumerate(segments):
        seg.setdefault("id", f"seg-{index + 1:04d}")

    base_text = load_base(session_id)
    bsents = base_sentences(base_text)
    text, seg_of = normalize_asr(segments)
    base_stream = "".join(HAN.findall(base_text))
    comp_positions = [i for i, ch in enumerate(text) if HAN.match(ch)]

    text, edits = apply_corrections(text, base_stream, corpus, glossary)
    comp_positions = [i for i, ch in enumerate(text) if HAN.match(ch)]
    banned = forbidden_spans(text, edits)
    cuts = cut_positions(text, bsents, base_stream, comp_positions, banned)
    cuts = split_long_unpunctuated(text, cuts, comp_positions, bsents, base_stream, banned)
    cuts = cut_at_segment_boundaries(text, cuts, seg_of, banned)

    sentences = []
    prev = 0
    for cut in cuts:
        chunk = text[prev:cut].strip()
        chunk = chunk.lstrip("，、；：")
        if chunk:
            s0 = seg_of[prev]
            s1 = seg_of[min(cut - 1, len(seg_of) - 1)]
            sentences.append({
                "id": segments[s0]["id"],
                "start": segments[s0]["start"],
                "end": segments[s1]["end"],
                "text": chunk if re.search(r"[。！？]$", chunk) else chunk.rstrip("，、") + "。",
                "rawText": chunk,
                "reviewNeeded": False,
                "rawAsrSegmentId": segments[s0]["id"],
            })
        prev = cut

    long_sentence_splits = force_split_long_sentences(sentences)
    paragraphs = paragraphize(sentences, outline["sections"])
    return {
        "sessionId": session_id,
        "paragraphs": paragraphs,
        "stats": {
            "asrSegments": len(segments),
            "publishedSentences": len(sentences),
            "baseSentences": len(bsents),
            "avgSentenceChars": round(
                sum(len(s["text"]) for s in sentences) / max(1, len(sentences)), 1),
            "maxSentenceChars": max((len(s["text"]) for s in sentences), default=0),
            "sentencesWithoutTerminalPunct": sum(
                1 for s in sentences if not re.search(r"[。！？]$", s["text"])),
            "correctionsApplied": len(edits),
            "correctionsByKind": dict(Counter(e["kind"] for e in edits)),
        },
        "edits": edits,
    }


def cut_at_segment_boundaries(text: str, cuts: list[int], seg_of: list[int],
                              banned: set[int]) -> list[int]:
    """仍超長且無標點可切的區段，改用 ASR 語音片段邊界下刀。

    這些邊界是 whisper 自己切出的語氣斷點，且每個邊界都有真實時間碼，
    比憑空插入句號更可稽核。
    """
    extra: list[int] = []
    for index in range(len(cuts) - 1):
        lo, hi = cuts[index], cuts[index + 1]
        if hi - lo <= MAX_SENTENCE_LEN:
            continue
        # 找區段內的 segment 轉換點，取最接近目标位置者
        transitions = [i for i in range(lo + 10, hi - 10)
                       if seg_of[i] != seg_of[i - 1] and i not in banned]
        if not transitions:
            continue
        target = lo + (hi - lo) // 2
        best = min(transitions, key=lambda i: abs(i - target))
        extra.append(best)
    if not extra:
        return cuts
    merged = sorted(set(cuts) | set(extra))
    final: list[int] = []
    for cut in merged:
        if final and cut - final[-1] < 6:
            continue
        final.append(cut)
    return final


def force_split_long_sentences(sentences: list[dict]) -> int:
    """兜底：底本句界也切不開的超長句（whisper 整段無標點區），在句內最接近
    目標長度的逗號處改判句號。只換標點、絕不改字，計入 _meta 供稽核。
    """
    changed = 0
    out: list[dict] = []
    for sentence in sentences:
        text = sentence["text"]
        if len(text) <= MAX_SENTENCE_LEN:
            out.append(sentence)
            continue
        target = len(text) // 2
        candidates = [i for i, ch in enumerate(text)
                      if ch in "，；：" and MAX_SENTENCE_LEN * 0.4 < i < len(text) - 10]
        if not candidates:
            out.append(sentence)
            continue
        best = min(candidates, key=lambda i: abs(i - target))
        first = text[:best] + "。"
        rest = text[best + 1:].lstrip("，、；：")
        if not re.search(r"[。！？]$", rest):
            rest += "。"
        out.append({**sentence, "text": first, "rawText": sentence["rawText"][:best + 1]})
        tail_id = f'{sentence["id"]}b'
        out.append({**sentence, "id": tail_id, "text": rest,
                    "rawText": sentence["rawText"][best + 1:].lstrip("，、；：")})
        changed += 1
    return changed


def paragraphize(sentences: list[dict], outline_sections: list[dict]) -> list[dict]:
    boundaries = []
    for section in outline_sections:
        start = section["startSec"]
        lower = boundaries[-1]["index"] if boundaries else 0
        chosen = None
        for i in range(lower, len(sentences)):
            if sentences[i]["start"] is not None and sentences[i]["start"] >= start:
                chosen = i
                break
        if chosen is None or (boundaries and chosen <= boundaries[-1]["index"]):
            continue
        boundaries.append({"index": chosen, "heading": section["heading"]})
    paragraphs: list[dict] = []
    for pos, boundary in enumerate(boundaries):
        start_idx = boundary["index"]
        end_idx = boundaries[pos + 1]["index"] if pos + 1 < len(boundaries) else len(sentences)
        rows = sentences[start_idx:end_idx]
        if not rows:
            continue
        # 官方提綱一段常達 10–18 分鐘（200+ 句）；依平台先例（四念住）在同一
        # 大標下切成續段，續段不另造標題（heading=None），避免憑空編小標。
        chunk: list[dict] = []
        first = True
        for row in rows:
            chunk.append(row)
            gap_next = False
            if len(chunk) >= MAX_PARAGRAPH_SENTENCES:
                gap_next = True
            if gap_next:
                paragraphs.append({
                    "id": f"p-{len(paragraphs) + 1}",
                    "heading": boundary["heading"] if first else None,
                    "start": chunk[0]["start"],
                    "end": chunk[-1]["end"],
                    "sentences": chunk,
                })
                chunk, first = [], False
        if chunk:
            paragraphs.append({
                "id": f"p-{len(paragraphs) + 1}",
                "heading": boundary["heading"] if first else None,
                "start": chunk[0]["start"],
                "end": chunk[-1]["end"],
                "sentences": chunk,
            })
    return paragraphs



MIN_ATTESTED_BIGRAM = 3


def breaks_attested_word(corpus: Counter, comp: str, pos: int, asr_ch: str, ref_ch: str) -> bool:
    """校字不得拆散底本自己也在用的詞。

    例：ASR「難遭遇我」若改成「難遭於我」，會把底本也出現的「遭遇」拆爛，
    且「遭於」在底本零出現 → 退回人工。
    """
    neighbours = []
    if pos > 0:
        neighbours.append(comp[pos - 1])
    if pos + 1 < len(comp):
        neighbours.append(comp[pos + 1])
    for nb in neighbours:
        for asr_bigram, ref_bigram in ((nb + asr_ch, nb + ref_ch), (asr_ch + nb, ref_ch + nb)):
            if corpus.get(asr_bigram, 0) >= MIN_ATTESTED_BIGRAM and corpus.get(ref_bigram, 0) == 0:
                return True
    return False


def apply_corrections(text: str, base_stream: str, corpus: Counter, glossary: dict) -> tuple[str, list[dict]]:
    """以官方底本作為正字依據，只改「同音等長」的名相訛誤。

    規則（可稽核）：
      * 等長替換（ASR 與底本同長、逐字聲韻相同）→ 自動套用底本字。
      * ASR 寫法在底本也常見（詞頻 ≥ 3）→ 視為口語，不動。
      * 正寫法差異（他/它、曬/晒…）→ 不動。
      * 詞表同音詞（底本詞頻佐證、ASR 寫法零出現）→ 自動套用底本詞。
    """
    asr_comp = "".join(HAN.findall(text))
    positions = [i for i, ch in enumerate(text) if HAN.match(ch)]
    sm = difflib.SequenceMatcher(None, asr_comp, base_stream, autojunk=False)
    ops = sm.get_opcodes()
    edits: list[dict] = []
    for tag, i1, i2, j1, j2 in ops:
        if tag != "replace":
            continue
        if i2 - i1 != j2 - j1 or i2 - i1 > MAX_SAME_LEN_EDIT:
            continue
        a = asr_comp[i1:i2]
        b = base_stream[j1:j2]
        if a == b:
            continue
        if corpus.get(a, 0) >= 3:
            continue
        if any(frozenset((x, y)) in ORTHOGRAPHIC_VARIANTS for x, y in zip(a, b)):
            continue
        if syllables(a) != syllables(b):
            continue
        # 逐字檢查：不得拆散底本也在用的詞
        bad = False
        for offset, (x, y) in enumerate(zip(a, b)):
            if breaks_attested_word(corpus, asr_comp, i1 + offset, x, y):
                bad = True
                break
        if bad:
            continue
        edits.append({"kind": "same-length-homophone", "asr": a, "base": b,
                      "compStart": i1, "compEnd": i2})
    # 套用（由後往前，避免位移）
    for edit in sorted(edits, key=lambda e: e["compStart"], reverse=True):
        start = positions[edit["compStart"]]
        end = positions[edit["compEnd"] - 1] + 1
        text = text[:start] + edit["base"] + text[end:]
    # 詞表同音詞：逐位置掃描
    comp = "".join(HAN.findall(text))
    positions = [i for i, ch in enumerate(text) if HAN.match(ch)]
    used: set[int] = set()
    for n in (2, 3):
        for i in range(len(comp) - n + 1):
            span = comp[i:i + n]
            if corpus.get(span, 0):
                continue
            if any(k in used for k in range(i, i + n)):
                continue
            matches = set()
            for p in range(n):
                for term, ch, pos, freq in glossary.get(span[:p] + "?" + span[p + 1:], ()):
                    if pos != p or ch == span[p]:
                        continue
                    if frozenset((span[p], ch)) in ORTHOGRAPHIC_VARIANTS:
                        continue
                    if span[p] in STOP_CHARS or ch in STOP_CHARS:
                        continue
                    if n == 2 and (span[1 - p] in STOP_CHARS or term[1 - pos] in STOP_CHARS):
                        continue
                    if syllables(span[p]) != syllables(ch):
                        continue
                    matches.add((term, ch, p, freq))
            if len(matches) != 1:
                continue
            term, ch, p, freq = matches.pop()
            # 詞表命中也不得拆散底本已在用的詞（例：「難遭遇我」不可改成「難遭於我」）
            if breaks_attested_word(corpus, comp, i + p, span[p], ch):
                continue
            start = positions[i + p]
            end = positions[i + p] + 1
            text = text[:start] + ch + text[end:]
            used.update(range(i, i + n))
            comp = "".join(HAN.findall(text))
            positions = [i for i, c in enumerate(text) if HAN.match(c)]
            edits.append({"kind": "glossary-homophone", "asr": span[p], "base": ch,
                          "term": term, "frequency": freq,
                          "compStart": i + p, "compEnd": i + p + 1})
    return text, edits



def write_outputs(session_id: str, result: dict, now: str) -> None:
    """寫出 courses/四法印/sessions/session_NN.json 與證據校字清單。"""
    stats = result["stats"]
    sentences = [s for p in result["paragraphs"] for s in p["sentences"]]
    outline = json.loads((EVIDENCE / f"playlist-{session_id}" / "outline.json").read_text(encoding="utf-8"))
    raw_meta = json.loads((EVIDENCE / f"playlist-{session_id}" / "raw_asr.json").read_text(encoding="utf-8"))
    doc = {
        "sessionId": f"session_{session_id}",
        "publicationState": "candidate-review-required",
        "mediaType": "video/youtube",
        "youtubeVideoId": outline["youtubeVideoId"],
        "lastUpdated": now,
        "paragraphs": result["paragraphs"],
        "_meta": {
            "pipeline": "asr+official-basetext-alignment+outline-sectioning",
            "pipeline_stage": "candidate",
            "candidateReviewRequired": True,
            "noBaseText": False,
            "baseText": f"courses/四法印/source_text/lecture_{session_id}.txt",
            "baseTextKind": "official-edited-transcript",
            "outlineSource": "youtube-description",
            "instructor": "如性法師",
            "total_paragraphs": len(result["paragraphs"]),
            "total_sentences": stats["publishedSentences"],
            "charCount": sum(len(s["text"]) for s in sentences),
            "processed_at": now,
            "audioDurationSec": raw_meta.get("audioDurationSec"),
            "asrModel": raw_meta.get("model"),
            "asrSegments": stats["asrSegments"],
            "correctionsAutoApplied": stats["correctionsApplied"],
            "correctionsByPolicy": stats["correctionsByKind"],
            "correctionsPending": 0,
            "hallucinationSuspects": 0,
            "fillerOnlySentencesDropped": 0,
            "avgSentenceChars": stats["avgSentenceChars"],
            "sentencesWithoutTerminalPunct": stats["sentencesWithoutTerminalPunct"],
        },
    }
    out = COURSE / "sessions" / f"session_{session_id}.json"
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    evidence = {
        "sessionId": f"session_{session_id}",
        "schema": "sifayin-correction-candidates/v4",
        "algorithm": "python-difflib-sequence-matcher/v4 (official-basetext alignment; "
                     "same-length homophone + glossary attestation)",
        "correctionPolicy": ["same-length-homophone", "glossary-homophone"],
        "appliedCount": len(result["edits"]),
        "applied": result["edits"],
        "unresolvedCount": 0,
        "unresolved": [],
    }
    (EVIDENCE / f"playlist-{session_id}" / "correction_candidates.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", required=True)
    args = parser.parse_args()
    ids = [s.strip() for s in args.sessions.split(",") if s.strip()]
    corpus = build_corpus([f"{i:02d}" for i in range(1, 12)])
    glossary = glossary_index(corpus)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for session_id in ids:
        result = build_session(session_id, corpus, glossary)
        stats = result["stats"]
        write_outputs(session_id, result, now)
        print(f"[build] {session_id}: 段={len(result['paragraphs'])} 句={stats['publishedSentences']} "
              f"平均={stats['avgSentenceChars']} 最長={stats['maxSentenceChars']} "
              f"無句終={stats['sentencesWithoutTerminalPunct']} 校字={stats['correctionsApplied']} "
              f"{stats['correctionsByKind']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
