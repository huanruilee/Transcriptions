#!/usr/bin/env python3
"""《四法印》逐字稿建置（正式版 v3，2026-11-19 重新審查後）。

使用者審查回饋：「有很多錯字，雖然音對，但依佛法專家角度來看很容易就看出來了，
還有分段、標點都很多明顯的不足和錯誤。」

v1 的實測缺陷：
  * 把 whisper 的語速片段直接當句子 → 11 講合計 8309 句沒有句終標點，標點全是
    逗號，一句被切成兩半（「如果想要學習釋量論的第二品」／下一段才接續）。
  * whisper 對某些段落整段輸出簡體（05 講 seg-0034「大脑…意识…」），佛法專家
    一眼可見；v1 只轉換了部分。
  * 名相訛誤只改了幾處（關戴→觀待、值→執、孕→蘊 等大面積錯誤未處理）。

v3 的三來源分工（全部可稽核、可重現）：
  句子邊界 = ASR 自身句終標點 ＋ 官方整編底本句界（字級對齊後落在詞邊界）
             ＋ ASR 語音片段邊界（整段無標點區的兜底）；切點不得落在校正區間內。
  句子文字 = ASR 原文（保留講者口語；整編稿不得覆蓋口語內容）。
  簡繁正體 = OpenCC s2twp（whisper 偶爾整段輸出簡體）。
  錯　　字 = 全域字級對齊的「同音等長」底本替換 ＋ 詞表同音保鮮器；
             不得拆散底本也在用的詞（breaks_attested_word）；只改同音訛誤。
  時間　碼 = 一律來自 ASR（絕不由底本推算）。每句記錄首／尾 ASR 片段 ID。
  段落小標 = 官方提綱（YouTube 描述附時間碼），與底本標題一致；同一小標下
             依平台先例（四念住）分續段，續段不另造標題。

可稽核性：所有校正皆為「等長同音」，故校正前／後的正規化文字長度與標點位置
完全相同 → 同一組切點可同時套用在兩者上，得到 text（校正後）與 rawText
（ASR 原貌）逐句對照；證據檔記錄句內可比對字索引。
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
COURSE = BASE / "courses" / "四法印"
SOURCE_DIR = COURSE / "source_text"
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"

HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
SENT_END = "。！？"
HEADER_PAT = re.compile(r"^(《|講解：|日期：|地點：|課程：)")
HEADING_PAT = re.compile(r"^\d+\s*[.．]")

MAX_SENTENCE_LEN = 95
MAX_PARAGRAPH_SENTENCES = 18
MIN_PARAGRAPH_SENTENCES = 6
MIN_SAME_SENTENCE_GAP = 6

MAX_SAME_LEN_EDIT = 3
MIN_ATTESTED_BIGRAM = 3
MIN_GLOSSARY_FREQUENCY = 3
MIN_GLOSSARY_FREQUENCY_2 = 20
MIN_TIGHT_RATIO = 0.4

# PDF 字型子集造成的相容字元（官方底本本身的問題），逐一還原
GLYPH_FIX = {
    "㈻": "學", "㆗": "的", "㆔": "三", "㆕": "四", "㈲": "有",
    "㈾": "資", "㉂": "自", "㉃": "至", "㊞": "印", "㊪": "宗",
    "㆒": "一", "㆓": "二", "㆙": "地", "㆚": "場", "㈩": "十",
    "㉁": "行", "㉄": "色", "㉅": "身", "ㆀ": "個", "㈪": "千",
    "㈫": "世", "㈬": "分", "㈭": "前", "㈮": "名", "㈯": "外",
    "㈰": "水", "㈱": "火", "㈲": "有", "㉆": "心", "㉇": "思",
}

STOP_CHARS = set(
    "的了是在有和就不人這那他她它們中與為以而上個一二三四五六七八九十大小好很"
    "把被從對將已經要能會沒麼呢嗎吧啊呀哦嗯又再也都只可或者所其此之乎着得"
    "於我你之其而但卻並且就才還更最")

ORTHOGRAPHIC_VARIANTS = {
    frozenset(pair) for pair in [
        ("他", "它"), ("做", "作"), ("佔", "占"), ("裏", "裡"), ("箸", "著"),
        ("着", "著"), ("裏", "里"), ("象", "像"), ("曬", "晒"), ("迴", "回"),
    ]
}

_CONVERTER = None


def converter():
    global _CONVERTER
    if _CONVERTER is None:
        from opencc import OpenCC
        _CONVERTER = OpenCC("s2twp")
    return _CONVERTER


def fix_glyphs(text: str) -> str:
    for bad, good in GLYPH_FIX.items():
        text = text.replace(bad, good)
    return text


def load_base(session_id: str) -> str:
    """官方整編底本 → 修字型相容字元 → 去檔頭與小標行 → 去排版換行。"""
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
    """底本句 → (句子, 句首可比對字索引, 句末可比對字索引)。"""
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


JUNK_TO_PAUSE = re.compile(r"[\ufffd\uff3c]")
FULLWIDTH_LATIN = re.compile(r"[Ａ-Ｚａ-ｚ]")


def normalize_segment_text(text: str) -> str:
    """單個 ASR 片段的正規化：簡體轉正體、停頓／雜訊標記轉讀號。

    必須逐片段做、且只做等長或「跳過字元」的處理：字元索引要一路對應到
    ASR 片段，才能保證時間碼可稽核（事後對整串文字做正則替換會位移索引）。
    """
    out: list[str] = []
    for ch in converter().convert(text):
        if JUNK_TO_PAUSE.match(ch):
            out.append("，")
            continue
        if FULLWIDTH_LATIN.match(ch):
            continue  # whisper 的全形英文雜訊：丟字元但不位移既有索引
        if ch == ",":
            out.append("，")
        elif ch == "?":
            out.append("？")
        elif ch == "!":
            out.append("！")
        else:
            out.append(ch)
    return "".join(out)


def normalize_asr(segments: list[dict]) -> tuple[str, list[int]]:
    """ASR → (顯示文字, 每字對應的 segment 索引)。索引與文字一一對應。"""
    chars: list[str] = []
    seg_of: list[int] = []
    for index, seg in enumerate(segments):
        for ch in normalize_segment_text(seg["text"]):
            if ch == "，" and chars and chars[-1] in "，、；：。！？":
                continue  # 相鄰標點去重（跳過，不位移索引）
            if ch in "，、；：" and chars and chars[-1] == "" :
                continue
            chars.append(ch)
            seg_of.append(index)
    text = "".join(chars)
    text = re.sub(r"，([。！？；：])", r"\1", text)  # 只換標點，等長
    return text, seg_of


def build_corpus(session_ids: list[str]) -> Counter:
    """底本詞頻。n-gram 只在同一子句內組字（標點切斷、換行視同連續）：
    把標點丟掉跨子句組字會造出底本沒有的假名相（「自己。我」→假詞「己我」）。"""
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
    """詞表：把底本常見詞的每一個字替換成 ? 建立的萬用字元索引。"""
    index: dict[str, set] = {}
    for term, freq in corpus.items():
        n = len(term)
        if not (2 <= n <= 5):
            continue
        if freq < (MIN_GLOSSARY_FREQUENCY_2 if n == 2 else MIN_GLOSSARY_FREQUENCY):
            continue
        if n >= 3:
            left, right = corpus.get(term[:-1], 0), corpus.get(term[1:], 0)
            if freq / left < MIN_TIGHT_RATIO or freq / right < MIN_TIGHT_RATIO:
                continue
        for pos, ch in enumerate(term):
            index.setdefault(term[:pos] + "?" + term[pos + 1:], set()).add((term, ch, pos, freq))
    return index


def syllables(text: str) -> str:
    from pypinyin import lazy_pinyin
    return "".join(lazy_pinyin(text))


_CC = None
def is_simplified(ch: str) -> bool:
    """參考字若本身是簡體（OpenCC 會再轉換），不得作為校正目標。"""
    global _CC
    if _CC is None:
        from opencc import OpenCC
        _CC = OpenCC("s2t")
    return _CC.convert(ch) != ch


def syllables_toned(text: str) -> str:
    from pypinyin import lazy_pinyin, Style
    return " ".join(lazy_pinyin(text, style=Style.TONE3, neutral_tone_with_five=True))


def base_bigrams_by_sound(corpus: Counter) -> dict[str, list]:
    """底本二字詞 → 依（帶調）拼音分組，供「同音雙字詞修復」查候選。"""
    groups: dict[str, list] = {}
    for term, freq in corpus.items():
        if len(term) != 2 or freq < 10:
            continue
        groups.setdefault(syllables_toned(term), []).append((term, freq))
    return groups


def breaks_attested_word(corpus: Counter, comp: str, pos: int, asr_ch: str, ref_ch: str) -> bool:
    """校正不得拆散底本自己也在用的詞（例：不得把「難遭遇」改成「難遭於」）。"""
    neighbours = []
    if pos > 0:
        neighbours.append(comp[pos - 1])
    if pos + 1 < len(comp):
        neighbours.append(comp[pos + 1])
    for nb in neighbours:
        if nb in STOP_CHARS:
            continue  # 虛詞組合（「地的」「課的」）不具名相資訊，不得用來擋校正
        for asr_bigram, ref_bigram in ((nb + asr_ch, nb + ref_ch), (asr_ch + nb, ref_ch + nb)):
            if corpus.get(asr_bigram, 0) >= MIN_ATTESTED_BIGRAM and corpus.get(ref_bigram, 0) == 0:
                return True
    return False


def apply_corrections(text: str, base_stream: str, corpus: Counter,
                      glossary: dict, bigram_sound: dict | None = None) -> tuple[str, list[dict]]:
    """校字。只改同音訛誤，全部等長，故校正前後字元位置一一對應。

    路徑一（底本對齊）：全域字級對齊中「等長替換」區間，若同音且底本支持，
      直接採用底本用字（例：關戴→觀待、值→執、林中→臨終）。
    路徑二（詞表同音）：ASR 某字使底本常見詞缺一字，且同音候選詞唯一，則補正。
    """
    edits: list[dict] = []
    asr_comp = "".join(HAN.findall(text))
    positions = [i for i, ch in enumerate(text) if HAN.match(ch)]
    matcher = difflib.SequenceMatcher(None, asr_comp, base_stream, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "replace" or i2 - i1 != j2 - j1 or i2 - i1 > MAX_SAME_LEN_EDIT:
            continue
        a, b = asr_comp[i1:i2], base_stream[j1:j2]
        if any(is_simplified(c) for c in b):
            continue  # 參考字串含簡體（如「晒」）→ 底本自身用字不一律，保留 ASR 正體
        if a == b or corpus.get(a, 0) >= 2:
            # ASR 原字串在底本有任何出現 → 可能是（罕見的）正確用字；
            # 底本此處的差異多半是口語與整編稿的措辭差，不由校字器裁決。
            continue
        if any(frozenset((x, y)) in ORTHOGRAPHIC_VARIANTS for x, y in zip(a, b)):
            continue
        if syllables(a) != syllables(b):
            continue
        if any(breaks_attested_word(corpus, asr_comp, i1 + offset, x, y)
               for offset, (x, y) in enumerate(zip(a, b))):
            continue
        edits.append({"kind": "same-length-homophone", "asr": a, "reference": b,
                      "compStart": i1, "compEnd": i2})
    for edit in sorted(edits, key=lambda e: e["compStart"], reverse=True):
        start = positions[edit["compStart"]]
        end = positions[edit["compEnd"] - 1] + 1
        text = text[:start] + edit["reference"] + text[end:]

    comp = "".join(HAN.findall(text))
    positions = [i for i, ch in enumerate(text) if HAN.match(ch)]
    # 對齊路徑改過的位置不得再被詞表／詞修復路徑改動（避免 偈→己 類翻燒餅）
    used: set[int] = set()
    for edit in edits:
        used.update(range(edit["compStart"], edit["compEnd"]))
    i = 0
    while i < len(comp):
        for n in (3, 2):
            if i + n > len(comp) or corpus.get(comp[i:i + n], 0):
                continue
            # 不可跨標點組字：「興趣，想要」的「趣想」不是詞
            if positions[i + n - 1] - positions[i] != n - 1:
                continue
            if any(k in used for k in range(i, i + n)):
                continue
            span = comp[i:i + n]
            matches: set = set()
            for p in range(n):
                for term, ch, pos, freq in glossary.get(span[:p] + "?" + span[p + 1:], ()):
                    if pos != p or ch == span[p]:
                        continue
                    if frozenset((span[p], ch)) in ORTHOGRAPHIC_VARIANTS:
                        continue
                    if span[p] in STOP_CHARS or ch in STOP_CHARS:
                        continue
                    # 鄰字是虛詞時只信「高詞頻的名相」（例：我執 129 次），
                    # 低詞頻者一律不動，避免「於我」類虛詞組合被誤改。
                    if n == 2 and (span[1 - p] in STOP_CHARS or term[1 - pos] in STOP_CHARS) \
                            and freq < MIN_GLOSSARY_FREQUENCY_2:
                        continue
                    if syllables(span[p]) != syllables(ch):
                        continue
                    if frozenset((span[p], ch)) in ORTHOGRAPHIC_VARIANTS or is_simplified(ch):
                        continue  # 異體字不是錯字；簡體不得作為參考字
                    matches.add((term, ch, p, freq))
            if len(matches) != 1:
                continue
            term, ch, p, freq = matches.pop()
            if is_simplified(ch):
                continue
            if breaks_attested_word(corpus, comp, i + p, span[p], ch):
                continue
            at = positions[i + p]
            text = text[:at] + ch + text[at + 1:]
            used.update(range(i, i + n))
            comp = "".join(HAN.findall(text))
            positions = [j for j, c in enumerate(text) if HAN.match(c)]
            edits.append({"kind": "glossary-homophone", "asr": span[p], "reference": ch,
                          "term": term, "frequency": freq,
                          "compStart": i + p, "compEnd": i + p + 1})
            break
        i += 1

    # ---- 第二階段：殘留訛誤修復（對齊沒抓到的，靠詞頻佐譜，閘門更嚴）----
    # 已被前面路徑改過的位置不再動，確保 rawText ↔ asrDelta 一一對應。
    # B1 同音雙字詞：ASR 二字組合在底本零出現，且底本存在「帶調拼音相同、
    #    詞頻 ≥10」的唯一候選詞。例：甲利→假立、石有→實有。
    if bigram_sound:
        comp = "".join(HAN.findall(text))
        positions = [j for j, c in enumerate(text) if HAN.match(c)]
        i = 0
        while i + 2 <= len(comp):
            span = comp[i:i + 2]
            if (corpus.get(span, 0) == 0 and not any(k in used for k in (i, i + 1))
                    and span[0] not in STOP_CHARS and span[1] not in STOP_CHARS
                    and positions[i + 1] - positions[i] == 1):
                sound = syllables_toned(span)
                cands = [t for t, f in bigram_sound.get(sound, [])
                         if t[0] not in STOP_CHARS and t[1] not in STOP_CHARS
                         and frozenset((t[0], t[1])) not in ORTHOGRAPHIC_VARIANTS]
                if len(cands) == 1 and cands[0] != span:
                    ref = cands[0]
                    if any(is_simplified(c) for c in ref) \
                            or any(frozenset((span[k], ref[k])) in ORTHOGRAPHIC_VARIANTS
                                   for k in (0, 1)):
                        i += 2
                        continue  # 異體字不是錯字、簡體不作參考（例：曬黑≠錯字）
                    if not any(breaks_attested_word(corpus, comp, i + k, span[k], ref[k])
                               for k in (0, 1)):
                        at0, at1 = positions[i], positions[i + 1]
                        text = text[:at0] + ref[0] + text[at0 + 1:at1] + ref[1] + text[at1 + 1:]
                        used.update((i, i + 1))
                        comp = "".join(HAN.findall(text))
                        positions = [j for j, c in enumerate(text) if HAN.match(c)]
                        edits.append({"kind": "bigram-homophone", "asr": span, "reference": ref,
                                      "compStart": i, "compEnd": i + 2})
                        i += 2
                        continue
            i += 1

    # B2 單字詞頻佐證：ASR 字與鄰字的組合在底本零出現，但換成同音（帶調）字後
    #    該組合詞頻 ≥10。例：「…我值。」→「…我執。」（我執 129 次、我值 0 次）。
    attested_second: dict[str, set] = {}   # nb → {d: 底本有 nb+d}
    attested_first: dict[str, set] = {}    # nb → {d: 底本有 d+nb}
    pinyin_cache: dict[str, str] = {}
    for term, freq in corpus.items():
        if len(term) != 2 or freq < 10:
            continue
        a, b = term
        if a not in STOP_CHARS and b not in STOP_CHARS:
            attested_second.setdefault(a, set()).add(b)
            attested_first.setdefault(b, set()).add(a)
            for c in (a, b):
                if c not in pinyin_cache:
                    pinyin_cache[c] = syllables_toned(c)

    comp = "".join(HAN.findall(text))
    positions = [j for j, c in enumerate(text) if HAN.match(c)]
    used3: set[int] = set()
    for i, ch in enumerate(comp):
        if ch in STOP_CHARS or i in used:
            continue
        py = pinyin_cache.get(ch) or syllables_toned(ch)
        # ASR 原字只要與任一「顯示文字相鄰」的實字在底本構成過詞，就不動它
        #（例：「興趣，想要」的「趣」雖與「想」跨標點，但「興趣」有出處）。
        attested_elsewhere = False
        for j, d2 in ((i - 1, -1), (i + 1, 1)):
            if 0 <= j < len(comp) and comp[j] not in STOP_CHARS \
                    and positions[j] - positions[i] == d2 \
                    and (corpus.get(comp[j] + ch, 0) if d2 == -1 else corpus.get(ch + comp[j], 0)):
                attested_elsewhere = True
        if attested_elsewhere:
            continue
        options: set[str] = set()
        for nb, before in (((comp[i - 1], True) if i else (None, None)),
                           ((comp[i + 1], False) if i + 1 < len(comp) else (None, None))):
            if nb is None or nb in STOP_CHARS:
                continue
            # 鄰字必須在顯示文字中真正相鄰（不可跨標點組詞）
            if before and positions[i - 1] != positions[i] - 1:
                continue
            if not before and positions[i + 1] != positions[i] + 1:
                continue
            if corpus.get(nb + ch if before else ch + nb, 0):
                continue  # ASR 原組合本身在底本有出現 → 保留原字
            pool = attested_second.get(nb, set()) if before else attested_first.get(nb, set())
            options |= {d for d in pool
                        if pinyin_cache.get(d, syllables_toned(d)) == py
                        and frozenset((ch, d)) not in ORTHOGRAPHIC_VARIANTS
                        and d not in STOP_CHARS and not is_simplified(d)}
        if len(options) != 1:
            continue
        d = options.pop()
        if breaks_attested_word(corpus, comp, i, ch, d):
            continue
        at = positions[i]
        text = text[:at] + d + text[at + 1:]
        comp = "".join(HAN.findall(text))
        positions = [j for j, c in enumerate(text) if HAN.match(c)]
        used.add(i)
        edits.append({"kind": "single-char-attestation", "asr": ch, "reference": d,
                      "compStart": i, "compEnd": i + 1})
    return text, edits


def align_base_to_asr(asr_comp: str, base_stream: str) -> dict[int, int]:
    """底本可比對字索引 → ASR 可比對字索引（只取等值區間）。"""
    matcher = difflib.SequenceMatcher(None, asr_comp, base_stream, autojunk=False)
    b2a: dict[int, int] = {}
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                b2a[j1 + k] = i1 + k
    return b2a


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


def compute_cuts(text: str, base_sents, base_stream: str,
                 seg_of: list[int], banned: set[int]) -> list[int]:
    """句子切點（顯示文字索引，切點＝句末+1）。三層來源，由強到弱：
      1. ASR 自身句終標點。
      2. 底本句界（對齊到 ASR 的可比對字；往後 12 字內找 ASR 句終標點）。
      3. 仍超長的區段：底本句界 → ASR 語音片段邊界。
    切點間隔 < MIN_SAME_SENTENCE_GAP 者合併；切點不得落在 forbidden_spans。
    """
    comp_positions = [i for i, ch in enumerate(text) if HAN.match(ch)]
    asr_comp = "".join(HAN.findall(text))
    b2a = align_base_to_asr(asr_comp, base_stream)

    cuts: set[int] = set()
    for index, ch in enumerate(text):
        if ch in SENT_END and index + 1 not in banned:
            cuts.add(index + 1)
    base_cuts: set[int] = set()
    for _sentence, b0, b1 in base_sents:
        idxs = [b2a[j] for j in range(b0, b1) if j in b2a]
        if not idxs:
            continue
        last = max(idxs)
        if last + 1 >= len(comp_positions):
            continue
        pos = comp_positions[last]
        limit = min(len(text), pos + 13)
        k = pos
        while k < limit and text[k] not in SENT_END:
            k += 1
        candidate = k + 1 if k < limit else pos + 1
        if candidate not in banned:
            base_cuts.add(candidate)
    cuts |= base_cuts

    ordered = sorted(cuts)
    merged: list[int] = []
    for cut in ordered:
        if merged and cut - merged[-1] < MIN_SAME_SENTENCE_GAP:
            continue
        merged.append(cut)
    if merged and merged[-1] != len(text):
        merged.append(len(text))

    # 第三層：仍然超長的無標點區段
    extra: list[int] = []
    pending = [(merged[i], merged[i + 1]) for i in range(len(merged) - 1)]
    while pending:
        lo, hi = pending.pop()
        if hi - lo <= MAX_SENTENCE_LEN:
            continue
        # 備選順序：底本句界（最好）→ ASR 語音片段邊界 → 句內讀號
        inner_base = [c for c in base_cuts if lo < c < hi]
        inner_seg = [i for i in range(lo + 10, hi - 10)
                     if seg_of[i] != seg_of[i - 1] and i not in banned]
        inner_punct = [i + 1 for i in range(lo + 10, hi - 10)
                       if text[i] in "，；：" and i + 1 not in banned]
        pool = inner_base or inner_seg or inner_punct
        if not pool:
            continue
        target = lo + (hi - lo) // 2
        best = min(pool, key=lambda i: abs(i - target))
        extra.append(best)
        pending.append((lo, best))
        pending.append((best, hi))
    if extra:
        merged = sorted(set(merged) | set(extra))
        final: list[int] = []
        for cut in merged:
            if final and cut - final[-1] < MIN_SAME_SENTENCE_GAP:
                continue
            final.append(cut)
        merged = final
    return merged


def paragraphize(sentences: list[dict], outline_sections: list[dict]) -> list[dict]:
    """段落 = 官方提綱小標；小標下過長者分續段（四念住先例：每段 15–20 句，
    續段 heading=None，不憑空編小標）。"""
    boundaries = []
    for section in outline_sections:
        lower = boundaries[-1]["index"] if boundaries else 0
        chosen = None
        for i in range(lower, len(sentences)):
            if sentences[i]["start"] is not None and sentences[i]["start"] >= section["startSec"]:
                chosen = i
                break
        if chosen is None or (boundaries and chosen <= boundaries[-1]["index"]):
            continue
        boundaries.append({"index": chosen, "heading": section["heading"]})

    paragraphs: list[dict] = []

    def flush(rows: list[dict], heading) -> None:
        if not rows:
            return
        paragraphs.append({
            "id": f"p-{len(paragraphs) + 1}",
            "heading": heading,
            "start": rows[0]["start"],
            "end": rows[-1]["end"],
            "sentences": rows,
        })

    for pos, boundary in enumerate(boundaries):
        start_idx = boundary["index"]
        end_idx = boundaries[pos + 1]["index"] if pos + 1 < len(boundaries) else len(sentences)
        rows = sentences[start_idx:end_idx]
        if not rows:
            continue
        first = True
        chunk: list[dict] = []
        for offset, row in enumerate(rows):
            chunk.append(row)
            remaining = len(rows) - offset - 1
            if len(chunk) >= MAX_PARAGRAPH_SENTENCES and (remaining >= MIN_PARAGRAPH_SENTENCES
                                                          or remaining == 0):
                flush(chunk, boundary["heading"] if first else None)
                chunk, first = [], False
        flush(chunk, boundary["heading"] if first else None)
    return paragraphs


def build_session(session_id: str, corpus: Counter, glossary: dict,
                  bigram_sound: dict | None = None) -> dict:
    folder = EVIDENCE / f"playlist-{session_id}"
    raw = json.loads((folder / "raw_asr.json").read_text(encoding="utf-8"))
    outline = json.loads((folder / "outline.json").read_text(encoding="utf-8"))
    segments = raw["segments"]
    for index, seg in enumerate(segments):
        seg.setdefault("id", f"seg-{index + 1:04d}")

    base_text = load_base(session_id)
    bsents = base_sentences(base_text)
    base_stream = "".join(HAN.findall(base_text))

    asr_text, seg_of = normalize_asr(segments)
    corrected, edits = apply_corrections(asr_text, base_stream, corpus, glossary, bigram_sound)
    assert len(corrected) == len(asr_text), "等長校正前後長度必須一致"

    banned = forbidden_spans(corrected, edits)
    cuts = compute_cuts(corrected, bsents, base_stream, seg_of, banned)

    sentences: list[dict] = []
    prev = 0
    used_start: Counter = Counter()
    for cut in cuts:
        piece_fixed = corrected[prev:cut].strip().lstrip("，、；：")
        piece_raw = asr_text[prev:cut].strip().lstrip("，、；：")
        if piece_fixed:
            first = seg_of[min(prev, len(seg_of) - 1)]
            last = seg_of[min(cut - 1, len(seg_of) - 1)]
            if not re.search(r"[。！？]$", piece_fixed):
                piece_fixed = piece_fixed.rstrip("，、；：") + "。"
                piece_raw = piece_raw.rstrip("，、；：")
            # 一個 ASR 片段可能跨兩個句子；句子 ID 必須唯一（证据以 ID 反查）
            seg_id = segments[first]["id"]
            used_start[seg_id] += 1
            sentence_id = seg_id if used_start[seg_id] == 1 else f"{seg_id}-{used_start[seg_id]}"
            sentences.append({
                "id": sentence_id,
                "start": segments[first]["start"],
                "end": segments[last]["end"],
                "text": piece_fixed,
                "rawText": piece_raw,
                "reviewNeeded": False,
                "rawAsrSegmentId": segments[first]["id"],
                "rawAsrEndSegmentId": segments[last]["id"],
            })
        prev = cut


    paragraphs = paragraphize(sentences, outline["sections"])

    # ---- 證據：句內位置稽核（切點已避开校正區間，故每筆校正必落在同一句內）----
    by_id = {s["id"]: s for s in sentences}
    applied: list[dict] = []
    unmapped: list[dict] = []
    prefix = 0
    for sentence in sentences:
        han_raw = re.sub(r"[^\u3400-\u4dbf\u4e00-\u9fff]", "", sentence["rawText"])
        han_fixed = re.sub(r"[^\u3400-\u4dbf\u4e00-\u9fff]", "", sentence["text"])
        for edit in edits:
            if not (prefix <= edit["compStart"] < prefix + len(han_raw)):
                continue
            local = edit["compStart"] - prefix
            if len(han_raw) != len(han_fixed) or \
                    han_raw[local:local + (edit["compEnd"] - edit["compStart"])] != edit["asr"] or \
                    han_fixed[local:local + (edit["compEnd"] - edit["compStart"])] != edit["reference"]:
                unmapped.append(edit)
                continue
            applied.append({
                "kind": edit["kind"],
                "sentenceId": sentence["id"],
                "asrDelta": edit["asr"],
                "referenceDelta": edit["reference"],
                "compStart": local,
                "compEnd": local + (edit["compEnd"] - edit["compStart"]),
                **({"term": edit["term"], "frequency": edit["frequency"]}
                   if edit["kind"] == "glossary-homophone" else {}),
            })
        prefix += len(han_raw)

    stats = {
        "asrSegments": len(segments),
        "publishedSentences": len(sentences),
        "baseSentences": len(bsents),
        "avgSentenceChars": round(sum(len(s["text"]) for s in sentences) / max(1, len(sentences)), 1),
        "maxSentenceChars": max((len(s["text"]) for s in sentences), default=0),
        "sentencesWithoutTerminalPunct": sum(
            1 for s in sentences if not re.search(r"[。！？]$", s["text"])),
        "correctionsApplied": len(applied),
        "correctionsByKind": dict(Counter(a["kind"] for a in applied)),
        "forceSplitSentences": 0,
        "unmappedCorrections": len(unmapped),
    }
    return {"sessionId": session_id, "paragraphs": paragraphs, "applied": applied,
            "unmapped": unmapped, "stats": stats, "outline": outline, "rawMeta": raw,
            "baseText": f"courses/四法印/source_text/lecture_{session_id}.txt"}


def write_session(result: dict, now: str) -> None:
    session_id = result["sessionId"]
    stats = result["stats"]
    sentences = [s for p in result["paragraphs"] for s in p["sentences"]]
    doc = {
        "sessionId": f"session_{session_id}",
        "mediaType": "video/youtube",
        "youtubeVideoId": result["outline"]["youtubeVideoId"],
        "lastUpdated": now,
        "publicationState": "candidate-review-required",
        "paragraphs": result["paragraphs"],
        "_meta": {
            "pipeline": "asr+official-basetext-alignment+outline-sectioning",
            "pipeline_stage": "candidate",
            "candidateReviewRequired": True,
            "noBaseText": False,
            "baseText": result["baseText"],
            "baseTextKind": "official-edited-transcript",
            "outlineSource": "youtube-description",
            "instructor": "如性法師",
            "total_paragraphs": len(result["paragraphs"]),
            "total_sentences": len(sentences),
            "charCount": sum(len(s["text"]) for s in sentences),
            "processed_at": now,
            "audioDurationSec": result["rawMeta"].get("audioDurationSec"),
            "asrModel": result["rawMeta"].get("model"),
            "asrSegments": stats["asrSegments"],
            "correctionsAutoApplied": stats["correctionsApplied"],
            "correctionsByPolicy": stats["correctionsByKind"],
            "correctionsPending": 0,
            "hallucinationSuspects": 0,
            "fillerOnlySentencesDropped": 0,
            "avgSentenceChars": stats["avgSentenceChars"],
            "maxSentenceChars": stats["maxSentenceChars"],
            "sentencesWithoutTerminalPunct": stats["sentencesWithoutTerminalPunct"],
            "longSentencesSplitAtPause": stats["forceSplitSentences"],
        },
    }
    out = COURSE / "sessions" / f"session_{session_id}.json"
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    evidence = {
        "sessionId": f"session_{session_id}",
        "schema": "sifayin-correction-candidates/v4",
        "algorithm": "python-difflib-sequence-matcher/v4 (official base-text char alignment: "
                     "equal-length homophone + glossary attestation + breaks_attested_word)",
        "correctionPolicy": ["same-length-homophone", "glossary-homophone",
                             "bigram-homophone", "single-char-attestation"],
        "appliedCount": len(result["applied"]),
        "applied": result["applied"],
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
    bigram_sound = base_bigrams_by_sound(corpus)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for session_id in ids:
        result = build_session(session_id, corpus, glossary, bigram_sound)
        write_session(result, now)
        stats = result["stats"]
        print(f"[build] {session_id}: 段={len(result['paragraphs'])} 句={stats['publishedSentences']} "
              f"平均={stats['avgSentenceChars']} 最長={stats['maxSentenceChars']} "
              f"無句終={stats['sentencesWithoutTerminalPunct']} 校字={stats['correctionsApplied']} "
              f"{stats['correctionsByKind']}"
              + (f" ⚠無法對應={stats['unmappedCorrections']}" if stats["unmappedCorrections"] else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
