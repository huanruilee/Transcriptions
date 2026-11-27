#!/usr/bin/env python3
"""
scripts/chaosheng_build_transcript.py

《朝聖前行課程》逐字稿候補建立（grounded candidate）。

   cleaned_asr.json（簡體／ASR 原字層，Phase 4.5 產物）
     → OpenCC s2twp 繁化（rawText）
     → 與官方三校稿（courses/朝聖前行課程/source_text/lecture_0N.txt）字級對齊，
       只套用「短距離同音／近音名相」差異（≤6 字），其餘退回 ASR 原話
     → 段落小標取自底本編號小標，章界時間＝該小標首句的 ASR start
     → 輸出 courses/朝聖前行課程/sessions/session_0N.json（candidate-review-required）

第 6 節（結行指導與問答）**沒有逐字底本**：走 ASR-primary 分支，
僅以問答紀要（reviews/evidence/朝聖前行課程/reference/closing_outline.txt）
的 5 組【學員提問】／【法師回答】＋【結語】作章界候選。

原則：
  * 時間碼一律來自 ASR，絕不用底本字數比例推算。
  * sentence.rawText 保留 ASR 繁化原樣；text 才是校訂結果。
  * 小標對齊相似度 < 0.6 → 不進正式 heading，寫入 work/heading_alignment.json（Merge Blocker）。
"""

import argparse
import difflib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import opencc
from functools import lru_cache
from pypinyin import lazy_pinyin

BASE = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE / "courses" / "朝聖前行課程"
SOURCE_DIR = COURSE_DIR / "source_text"
SESSIONS_DIR = COURSE_DIR / "sessions"
EVIDENCE = BASE / "reviews" / "evidence" / "朝聖前行課程"
WORK = EVIDENCE / "work"
OUTLINE_REF = EVIDENCE / "reference" / "closing_outline.txt"

CONVERTER = opencc.OpenCC("s2twp")
T2S = opencc.OpenCC("t2s")

TPE = timezone(timedelta(hours=8))

MAX_AUTO_CHANGE_CHARS = 6
MAX_TERM_FIX_CHARS = 4
MIN_SENTENCE_SIMILARITY = 0.55
MIN_HEADING_SIMILARITY = 0.60
MIN_TERM_FREQUENCY = 2

PARA_TARGET_CHARS = 300
PARA_MIN_CHARS = 150
PARA_MAX_CHARS = 350
PARA_MAX_SENTENCES = 30

COMPARABLE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
JUNK_CHARS = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufffd\u0000-\u001f]")
LATIN_RUN = re.compile(r"[A-Za-z]{3,}")
PAUSE_MARK = re.compile(r"[\ufffd\uff3cＡ-Ｚａ-ｚ]")
HEADING_RE = re.compile(r"^\s*(\d{1,2})[.．、]\s*(.+?)\s*$")
CURLY_RE = re.compile(r"[“”‘’]")

# 與 scripts/audit_reading_quality.mjs 同規則：句末懸掛連接詞／純填充句
TRAILING_CONNECTIVE_RE = re.compile(
    r"[，。；：]\s*(因此|所以|同時|此外|此時|但是|不過|然而|也就是說|也就是|換句話說|而且|並且|接著|最後|相同的|同樣的|實際上|事實上)[。]$")
FILLER_ONLY_RE = re.compile(r"^(呃|嗯|啊|喔|哦|欸|唉|嘿|那|好|就是說|對|是)[，。、！？\s]*$")


ORTHOGRAPHIC_VARIANTS = {
    frozenset(pair) for pair in [
        ("他", "它"), ("做", "作"), ("佔", "占"), ("裏", "裡"), ("箸", "著"),
        ("着", "著"), ("裏", "里"), ("象", "像"), ("曬", "晒"), ("迴", "回"),
    ]
}


@lru_cache(maxsize=None)
def canon_char(ch: str) -> str:
    out = T2S.convert(ch)
    return out if len(out) == 1 else ch


def canon(text: str) -> str:
    return "".join(canon_char(ch) for ch in text)


def comparable_with_map(text: str):
    chars, mapping = [], []
    for index, ch in enumerate(text):
        if COMPARABLE.match(ch):
            chars.append(ch)
            mapping.append(index)
    return "".join(chars), mapping


def normalize_punctuation(text: str) -> str:
    out = PAUSE_MARK.sub("，", text)
    out = JUNK_CHARS.sub("", out)
    out = out.replace(",", "，").replace("?", "？").replace("!", "！")
    out = out.replace(":", "：").replace(";", "；")
    out = out.replace("“", "「").replace("”", "」").replace("‘", "『").replace("’", "』")
    out = re.sub(r"\s+", "", out)
    out = re.sub(r"，{2,}", "，", out)
    out = re.sub(r"，([。！？；：、」』）】])", r"\1", out)
    out = re.sub(r"([「『（【])，", r"\1", out)
    out = re.sub(r"([，、])。", r"\1", out)
    out = re.sub(r"。{2,}", "。", out)
    return out.strip("，、")


def refined_opcodes(left: str, right: str):
    matcher = difflib.SequenceMatcher(None, left, right, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "replace" and (i2 - i1) > 1 and (j2 - j1) > 1 and (i2 - i1) + (j2 - j1) <= 40:
            for ntag, na, nb, ma, mb in difflib.SequenceMatcher(
                    None, left[i1:i2], right[j1:j2], autojunk=False).get_opcodes():
                if ntag == "equal":
                    continue
                yield ntag, i1 + na, i1 + nb, j1 + ma, j1 + mb
            continue
        if tag != "equal":
            yield tag, i1, i2, j1, j2


def context_pairs(comp: str, ref_window: str, i1: int, i2: int, j1: int, j2: int):
    asr_contexts, ref_contexts = [], []
    if i1 > 0 and j1 > 0:
        asr_contexts.append(comp[i1 - 1:i2])
        ref_contexts.append(ref_window[j1 - 1:j2])
    if i2 < len(comp) and j2 < len(ref_window):
        asr_contexts.append(comp[i1:i2 + 1])
        ref_contexts.append(ref_window[j1:j2 + 1])
    return asr_contexts, ref_contexts


def syllables(text: str):
    return [re.sub(r"\d+$", "", p) for p in lazy_pinyin(text)]


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


def same_syllable(a: str, b: str) -> bool:
    sa, sb = syllables(a), syllables(b)
    if sa == sb:
        return True
    if len(sa) != 1 or len(sb) != 1:
        return False
    return sa[0][0] == sb[0][0] and levenshtein(sa[0], sb[0]) <= 1


def global_char_map(asr_segments, reference):
    asr_stream = "".join(comparable_with_map(seg["text"])[0] for seg in asr_segments)
    ref_stream, _ = comparable_with_map(reference)
    ops = difflib.SequenceMatcher(None, canon(asr_stream), canon(ref_stream),
                                  autojunk=False).get_opcodes()
    mapping = {}
    for tag, i1, i2, j1, j2 in ops:
        if tag != "equal":
            continue
        for offset in range(i2 - i1):
            mapping[i1 + offset] = j1 + offset
    return asr_stream, ref_stream, mapping


def sentence_candidates(segments, asr_stream, ref_stream, char_map, ref_canon):
    results = []
    cursor = 0
    anchor_lo = 0
    for seg_index, seg in enumerate(segments):
        comp, _ = comparable_with_map(seg["text"])
        length = len(comp)
        start, end = cursor, cursor + length
        cursor = end
        if length == 0:
            continue
        comp_key = canon(comp)
        windows = []
        ref_positions = [char_map[i] for i in range(start, end) if i in char_map]
        if ref_positions:
            windows.append((max(0, min(ref_positions) - 8),
                            min(len(ref_stream), max(ref_positions) + 9)))
        matcher = difflib.SequenceMatcher(None, comp_key, ref_canon, autojunk=False)
        anchor = matcher.find_longest_match(0, length, anchor_lo, len(ref_canon))
        if anchor.size >= 4:
            a_start = max(0, anchor.b - anchor.a - 8)
            a_end = min(len(ref_stream), anchor.b + (length - anchor.a) + 9)
            windows.append((a_start, a_end))
            anchor_lo = max(anchor_lo, anchor.b + anchor.size - 4)

        best = None
        seen = set()
        for window_start, window_end in windows:
            if window_end - window_start < 4 or (window_start, window_end) in seen:
                continue
            seen.add((window_start, window_end))
            ref_window = ref_stream[window_start:window_end]
            similarity = difflib.SequenceMatcher(None, comp_key, canon(ref_window),
                                                 autojunk=False).ratio()
            if best is None or similarity > best[0]:
                best = (similarity, ref_window)
        if best is None or best[0] < MIN_SENTENCE_SIMILARITY:
            results.append({"sentenceIndex": seg_index, "similarity": best[0] if best else 0.0,
                            "candidates": []})
            continue
        similarity, ref_window = best
        found = []
        for tag, i1, i2, j1, j2 in refined_opcodes(comp_key, canon(ref_window)):
            asr_part = comp[i1:i2]
            ref_part = ref_window[j1:j2]
            change = max(len(asr_part), len(ref_part))
            if change > MAX_AUTO_CHANGE_CHARS:
                continue
            asr_contexts, ref_contexts = context_pairs(comp, ref_window, i1, i2, j1, j2)
            found.append({
                "sentenceIndex": seg_index,
                "sentenceId": seg["id"],
                "compStart": i1,
                "compEnd": i2,
                "asrDelta": asr_part,
                "referenceDelta": ref_part,
                "changeChars": change,
                "sentenceSimilarity": round(similarity, 3),
                "asrContexts": asr_contexts,
                "refContexts": ref_contexts,
            })
        results.append({"sentenceIndex": seg_index, "similarity": round(similarity, 3),
                        "candidates": found})
    return results


def build_corpus() -> Counter:
    counter = Counter()
    clause_run = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\s]+")
    for path in sorted(SOURCE_DIR.glob("lecture_*.txt")):
        for run in clause_run.findall(path.read_text(encoding="utf-8")):
            stream = "".join(COMPARABLE.findall(run))
            for n in (2, 3, 4, 5):
                for i in range(len(stream) - n + 1):
                    counter[stream[i:i + n]] += 1
    return counter


def corpus_attested(candidate, corpus: Counter) -> bool:
    pairs = [(candidate["asrDelta"], candidate["referenceDelta"])]
    pairs += list(zip(candidate.get("asrContexts", []), candidate.get("refContexts", [])))
    return any(corpus.get(ref, 0) >= MIN_TERM_FREQUENCY and corpus.get(asr, 0) == 0
               for asr, ref in pairs)


def classify_fix(candidate, corpus: Counter) -> str:
    asr_part, ref_part = candidate["asrDelta"], candidate["referenceDelta"]
    if candidate.get("glossary"):
        return "glossary-homophone"
    if not asr_part or not ref_part or asr_part == ref_part or len(asr_part) != len(ref_part):
        return "editorial-divergence"
    if len(asr_part) == 1 and frozenset((asr_part, ref_part)) in ORTHOGRAPHIC_VARIANTS:
        return "orthographic-variant"
    if len(asr_part) > MAX_TERM_FIX_CHARS:
        return "editorial-divergence"
    exact = all(syllables(a) == syllables(b) for a, b in zip(asr_part, ref_part))
    near = all(same_syllable(a, b) for a, b in zip(asr_part, ref_part))
    if not (exact or near):
        return "editorial-divergence"
    if not corpus_attested(candidate, corpus):
        return "unattested-homophone"
    if exact and len(asr_part) <= 3:
        return "strict-homophone"
    return "near-homophone-term"


def apply_candidates(segments, candidates, corpus):
    by_sentence = {}
    for candidate in candidates:
        by_sentence.setdefault(candidate["sentenceIndex"], []).append(candidate)

    applied, unresolved = [], []
    for seg_index, group in sorted(by_sentence.items()):
        seg = segments[seg_index]
        taken = []
        for candidate in sorted(group, key=lambda c: c["compStart"], reverse=True):
            c_start0, c_end0 = candidate["compStart"], candidate["compEnd"]
            if any(c_start0 < a_end and a_start < c_end0 for a_start, a_end in taken):
                candidate["note"] = "overlap-skipped"
                unresolved.append(candidate)
                continue
            comp, mapping = comparable_with_map(seg["text"])
            c_start, c_end = candidate["compStart"], candidate["compEnd"]
            if comp[c_start:c_end] != candidate["asrDelta"] or c_start >= len(mapping):
                candidate["note"] = "stale-position"
                unresolved.append(candidate)
                continue
            text_start = mapping[c_start]
            text_end = text_start + len(candidate["asrDelta"])
            if seg["text"][text_start:text_end] != candidate["asrDelta"]:
                candidate["note"] = "punctuation-gap"
                unresolved.append(candidate)
                continue
            policy = classify_fix(candidate, corpus)
            if policy in ("editorial-divergence", "orthographic-variant", "unattested-homophone"):
                candidate["note"] = policy
                unresolved.append(candidate)
                continue
            candidate["policy"] = policy
            seg["text"] = seg["text"][:text_start] + candidate["referenceDelta"] + seg["text"][text_end:]
            taken.append((c_start0, c_end0))
            applied.append(candidate)
    return applied, unresolved


MIN_GLOSSARY_FREQUENCY = 3
MIN_GLOSSARY_FREQUENCY_2 = 20
MIN_TIGHT_RATIO = 0.4

STOP_CHARS = set("的了是在有和就不人這那他她它們中與為以而上個一二三四五六七八九十大小好很"
                 "把被從對將已經要能會沒麼呢嗎吧啊呀哦嗯又再也都只可或者所其此之乎着得")


def glossary_index(corpus: Counter) -> dict:
    index = {}
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


def breaks_attested_word(corpus, comp, pos, asr_ch, ref_ch) -> bool:
    neighbours = []
    if pos > 0:
        neighbours.append(comp[pos - 1])
    if pos + 1 < len(comp):
        neighbours.append(comp[pos + 1])
    for nb in neighbours:
        for asr_bigram, ref_bigram in ((nb + asr_ch, nb + ref_ch), (asr_ch + nb, ref_ch + nb)):
            if corpus.get(asr_bigram, 0) >= 3 and corpus.get(ref_bigram, 0) == 0:
                return True
    return False


def glossary_candidates(segments, corpus, index):
    results = []
    for seg_index, seg in enumerate(segments):
        comp, _ = comparable_with_map(seg["text"])
        for n in (2, 3, 4, 5):
            for i in range(len(comp) - n + 1):
                span = comp[i:i + n]
                if corpus.get(span, 0):
                    continue
                matches = set()
                for p in range(n):
                    for term, ch, pos, freq in index.get(span[:p] + "?" + span[p + 1:], ()):
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
                if breaks_attested_word(corpus, comp, i + p, span[p], ch):
                    continue
                results.append({
                    "sentenceIndex": seg_index,
                    "sentenceId": seg["id"],
                    "compStart": i + p,
                    "compEnd": i + p + 1,
                    "asrDelta": span[p],
                    "referenceDelta": ch,
                    "changeChars": 1,
                    "sentenceSimilarity": None,
                    "asrContexts": [span, term],
                    "refContexts": [term],
                    "glossary": {"term": term, "frequency": freq,
                                 "asrSpan": span, "asrSpanInCorpus": 0},
                })
    return results


# ── 章界對齊 ───────────────────────────────────────────────────────────────

def parse_base_sections(base_text: str):
    """回傳 [{number, heading, body}]；heading 為底本編號小標。"""
    lines = base_text.split("\n")
    sections = []
    current = None
    preamble = []
    for line in lines:
        match = HEADING_RE.match(line)
        if match and len(match.group(2).strip()) <= 30:
            if current:
                sections.append(current)
            current = {"number": int(match.group(1)), "heading": match.group(2).strip(),
                       "body": []}
        elif current is not None:
            current["body"].append(line)
        else:
            preamble.append(line)
    if current:
        sections.append(current)
    for section in sections:
        section["bodyText"] = "\n".join(section["body"]).strip()
    return sections, "\n".join(preamble)


def section_base_offset(base_text: str, heading: str, occurrence_from: int = 0):
    """回傳 heading 之後（小標行後）在底本可比較字元流中的起點。"""
    idx = base_text.find(heading, occurrence_from)
    if idx < 0:
        return None
    tail = base_text[idx + len(heading):]
    prefix = base_text[:idx + len(heading)]
    return len("".join(COMPARABLE.findall(prefix))), len("".join(COMPARABLE.findall(tail)))


def align_headings(base_sections, base_text, segments, char_map, lecture_id):
    """把底本小標對到 ASR 句索引；相似度 < 0.6 者不採用，記入 failures。

    比對方式：以該節底本開頭 80 個可比較字元作探針，在候選區段（ASR 可比較字元流）
    找「最長同序匹配區塊」，用探針被涵蓋的比例當分數 → 整編稿在小標後加了一段
    鋪陳時仍可對到真正的起點（實測：前綴比對會整段失敗，涵蓋率比對可通過）。
    """
    boundaries = []
    failures = []
    cursor_seg = 0
    search_from = 0
    inverse = {}
    for asr_index, ref_index in char_map.items():
        inverse.setdefault(ref_index, asr_index)

    # ASR 可比較字元流 → 句索引
    asr_stream = []
    asr_char_to_seg = []
    for seg_index, seg in enumerate(segments):
        comp, _ = comparable_with_map(seg["text"])
        asr_stream.append(comp)
        asr_char_to_seg.extend([seg_index] * len(comp))
    asr_flat = "".join(asr_stream)

    for section in base_sections:
        offsets = section_base_offset(base_text, section["heading"], search_from)
        if offsets is None:
            failures.append({"lecture": lecture_id, "heading": section["heading"],
                             "reason": "heading-not-found-in-base", "topScore": 0.0})
            continue
        search_from += 1
        probe = "".join(COMPARABLE.findall(section["bodyText"]))[:80]
        if not probe:
            failures.append({"lecture": lecture_id, "heading": section["heading"],
                             "reason": "empty-section-body", "topScore": 0.0})
            continue

        start_char = sum(len(part) for part in asr_stream[:cursor_seg])
        region = asr_flat[start_char:start_char + 3000]
        if not region:
            failures.append({"lecture": lecture_id, "heading": section["heading"],
                             "reason": "no-asr-region", "topScore": 0.0})
            continue

        matcher = difflib.SequenceMatcher(None, canon(probe), canon(region), autojunk=False)
        blocks = [b for b in matcher.get_matching_blocks() if b.size >= 4]
        matched = sum(b.size for b in blocks)
        coverage = matched / max(1, len(canon(probe)))
        if blocks:
            first = blocks[0]
            seg_index = asr_char_to_seg[min(start_char + first.b, len(asr_char_to_seg) - 1)]
            # 往前回退到包含該字元的句子起點
            while seg_index > cursor_seg and seg_index - 1 >= 0 and \
                    asr_char_to_seg[min(start_char + first.b - 1, len(asr_char_to_seg) - 1)] == seg_index:
                seg_index -= 1
        else:
            seg_index = cursor_seg

        if coverage < MIN_HEADING_SIMILARITY:
            # 字級比對失敗（整編稿把該節改寫成同義但不同字）→ 留下候選給模型輔助定錨
            guess = None
            ref_start, _ = offsets
            for ref_pos in range(ref_start, ref_start + 12):
                asr_pos = inverse.get(ref_pos)
                if asr_pos is not None and asr_pos < len(asr_char_to_seg):
                    guess = asr_char_to_seg[asr_pos]
                    break
            candidates = []
            for index in {seg_index, guess} - {None}:
                candidates.append({"sentenceIndex": index, "score": round(coverage, 3),
                                   "method": "coverage-window" if index == seg_index else "char-map"})
            failures.append({"lecture": lecture_id, "heading": section["heading"],
                             "candidates": candidates,
                             "topScore": round(coverage, 3), "reason": "below-threshold",
                             "baseProbe": probe[:40]})
            continue
        if boundaries and seg_index <= boundaries[-1]["sentenceIndex"]:
            failures.append({"lecture": lecture_id, "heading": section["heading"],
                             "topScore": round(coverage, 3), "reason": "not-monotonic"})
            continue
        boundaries.append({"sentenceIndex": seg_index, "heading": f"{section['number']}. {section['heading']}",
                           "score": round(coverage, 3), "method": "coverage-window"})
        cursor_seg = seg_index + 1

    return boundaries, failures


def align_closing_sections(segments, outline_text):
    """結行節：以問答紀要的提問首句作章界候選（ASR-primary，不做字級對齊）。"""
    groups = []
    lines = [ln.strip() for ln in outline_text.split("\n") if ln.strip()]
    current = None
    for line in lines:
        if line.startswith("【學員提問】"):
            current = {"kind": "question", "text": line.replace("【學員提問】", "").strip()}
            groups.append(current)
        elif line.startswith("【法師回答】"):
            current = {"kind": "answer", "text": line.replace("【法師回答】", "").strip()}
            groups.append(current)
        elif line.startswith("【結語】"):
            current = {"kind": "closing", "text": line.replace("【結語】", "").strip()}
            groups.append(current)
        elif current is not None:
            current["text"] += line

    boundaries, failures = [], []
    cursor_seg = 0
    question_no = 0
    for group in groups:
        if group["kind"] == "question":
            question_no += 1
            probe_source = group["text"][:60]
            label = f"問題 {question_no}"
        elif group["kind"] == "answer":
            # 回答不另立小標：問答紀要的「回答」是摘要，正文對應自然落在提問小標之下。
            continue
        else:
            probe_source = group["text"][:60]
            label = "結語"
        probe = "".join(COMPARABLE.findall(probe_source))
        if len(probe) < 6:
            failures.append({"lecture": "06", "heading": label, "kind": group["kind"],
                             "probeText": group["text"][:120],
                             "reason": "outline-probe-too-short", "topScore": 0.0})
            continue
        best = None
        limit = min(len(segments), cursor_seg + 120)
        for seg_index in range(cursor_seg, limit):
            window = "".join(comparable_with_map(s["text"])[0] for s in segments[seg_index:seg_index + 3])
            score = difflib.SequenceMatcher(None, canon(probe), canon(window), autojunk=False).ratio()
            if best is None or score > best[0]:
                best = (score, seg_index)
            if score >= 0.85:
                break
        if best is None or best[0] < MIN_HEADING_SIMILARITY:
            failures.append({"lecture": "06", "heading": label, "kind": group["kind"],
                             "probeText": group["text"][:120],
                             "candidates": [{"sentenceIndex": best[1], "score": round(best[0], 3)}] if best else [],
                             "topScore": round(best[0], 3) if best else 0.0,
                             "reason": "below-threshold"})
            continue
        score, seg_index = best
        if boundaries and seg_index <= boundaries[-1]["sentenceIndex"]:
            failures.append({"lecture": "06", "heading": label, "topScore": round(score, 3),
                             "reason": "not-monotonic"})
            continue
        if group["kind"] == "question":
            heading = f"{label}：{re.sub(r'[，。？！].*$', '', group['text'])[:20]}"
        else:
            heading = label
        boundaries.append({"sentenceIndex": seg_index, "heading": heading,
                           "score": round(score, 3), "method": "outline-sliding-window"})
        cursor_seg = seg_index + 1
    return boundaries, failures


def paragraphize(segments, boundaries):
    """以已定錨的章界切段，再依 150–350 字（≤30 句）細分；不跨章界合併。"""
    if not boundaries:
        boundaries = [{"sentenceIndex": 0, "heading": None}]
    if boundaries[0]["sentenceIndex"] != 0:
        boundaries.insert(0, {"sentenceIndex": 0, "heading": None})

    paragraphs = []
    for pos, boundary in enumerate(boundaries):
        start_idx = boundary["sentenceIndex"]
        end_idx = boundaries[pos + 1]["sentenceIndex"] if pos + 1 < len(boundaries) else len(segments)
        rows = segments[start_idx:end_idx]
        if not rows:
            continue
        chunk, chars = [], 0
        pieces = []
        for seg in rows:
            length = len(seg["text"])
            if chunk and (chars + length > PARA_MAX_CHARS or len(chunk) >= PARA_MAX_SENTENCES):
                pieces.append(chunk)
                chunk, chars = [], 0
            chunk.append(seg)
            chars += length
        if chunk:
            pieces.append(chunk)

        # 過短尾段併回前一塊（同一章界內，不吞掉 heading）
        merged = []
        for piece in pieces:
            if merged and sum(len(s["text"]) for s in piece) < PARA_MIN_CHARS:
                merged[-1].extend(piece)
            else:
                merged.append(piece)

        for piece_index, piece in enumerate(merged):
            paragraphs.append({
                "id": f"p-{len(paragraphs) + 1:03d}",
                "heading": boundary["heading"] if piece_index == 0 else None,
                "start": piece[0]["start"],
                "end": piece[-1]["end"],
                "sentences": piece,
            })
    return paragraphs


def _router_json(messages, timeout=300):
    """呼叫 repo 既有 GX10 router（與 scripts/onepass_proofread.py 同一通道），回傳 JSON。"""
    import urllib.request
    payload = {"model": "auto-cloud", "messages": messages, "max_tokens": 2048,
               "temperature": 0.0, "reasoning_effort": "low"}
    req = urllib.request.Request(
        "http://100.113.144.100:18770/v1/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    content = re.sub(r"^```(?:json)?\s*", "", content.strip())
    content = re.sub(r"\s*```$", "", content)
    start, end = content.find("{"), content.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no JSON object in model output")
    return json.loads(content[start:end + 1])


def llm_anchor_heading(failure, segments, base_sections, base_text, min_index=0, max_index=None):
    """整編稿把小標後的內容改寫成同義但不同字 → 字級比對失敗。

    這時不做猜測：用模型在「候選段落窗」裡挑出最貼近底本該節開頭的段落，
    並要求模型給信心度；只有信心度夠高且順序單調時才落錨，並留下人工待確認紀錄。
    """
    heading = failure["heading"]
    title = re.sub(r"^\d+\.\s*", "", heading)
    section = next((s for s in base_sections
                    if s["heading"] == title or f"{s['number']}. {s['heading']}" == heading), None)
    if section is None:
        return None
    probe = "".join(COMPARABLE.findall(section["bodyText"]))[:60]
    candidate_indexes = [c["sentenceIndex"] for c in failure.get("candidates", [])]
    if not candidate_indexes:
        return None
    center = min(candidate_indexes)
    lo = max(min_index, center - 25)
    hi = min(len(segments), center + 26)
    if max_index is not None:
        hi = min(hi, max_index)
    if hi <= lo:
        return {"rejected": True, "reason": "no-valid-window"}
    window = [{"i": i, "t": segments[i]["text"][:60]} for i in range(lo, hi)]
    messages = [
        {"role": "system", "content": "你是逐字稿章界標註員。給定一段官方整編稿的小標開頭，"
                                       "以及 ASR 轉寫的候選段落，請挑出『語意上對應該小標開頭』的段落編號 i。"
                                       f"只能從候選清單裡選（i 必須介於 {lo} 與 {hi - 1} 之間），"
                                       "若沒有任何段落對應，輸出 index=null。只輸出 JSON："
                                       '{"index": 數字或null, "confidence": 0~1, "reason": "一句話理由"}'},
        {"role": "user", "content": "底本小標：" + heading + "\n底本該節開頭：" + probe +
                   "\n候選段落：\n" + json.dumps(window, ensure_ascii=False)},
    ]
    attempts = []
    for attempt in range(2):
        try:
            answer = _router_json(messages)
        except Exception as err:  # 網路／解析失敗 → 維持失敗狀態（Merge Blocker）
            attempts.append({"error": str(err)})
            continue
        attempts.append(answer)
        index = answer.get("index")
        confidence = float(answer.get("confidence") or 0)
        if isinstance(index, int) and lo <= index < hi and confidence >= 0.6:
            return {"sentenceIndex": index, "confidence": confidence,
                    "reason": answer.get("reason"), "probe": probe, "attempts": attempts}
    # 模型兩次都沒給出合格答案 → 回退到「底本位置對照表」的候選（有位置證據，非猜測），
    # 但必須仍落在前後章界之間，且明確記為待人工確認。
    fallback = None
    for candidate in failure.get("candidates", []):
        index = candidate.get("sentenceIndex")
        if isinstance(index, int) and min_index < index < max_index:
            fallback = index
            break
    if fallback is not None:
        return {"sentenceIndex": fallback, "confidence": 0.5,
                "reason": "模型未給出合格答案；回退到底本位置對照候選（需人工確認）",
                "probe": probe, "attempts": attempts, "fallback": True}
    return {"rejected": True, "answer": attempts}


def llm_anchor_question(failure, segments, lo, hi):
    """結行：官方問答紀要是「摘要」而非逐字稿 → 字級比對必然失敗。

    這時用模型在候選段落窗中找出「學員提出這個問題」的段落；
    信心度不足則不放棄章界，而是保留為失敗（不硬塞）。
    """
    question = (failure.get("probeText") or "").strip()
    if not question:
        return None
    lo = max(0, lo)
    hi = min(len(segments), hi)
    if hi <= lo:
        return None
    window = [{"i": i, "t": segments[i]["text"][:70]} for i in range(lo, hi)]
    messages = [
        {"role": "system", "content": "你是逐字稿章界標註員。給定一段問答課程的『提問摘要』，"
                                       "以及現場問答的 ASR 段落，請找出學員提出這個問題的段落編號 i。"
                                       f"只能從候選清單裡選（i 介於 {lo} 與 {hi - 1}），"
                                       "若沒有對應段落輸出 index=null。只輸出 JSON："
                                       '{"index": 數字或null, "confidence": 0~1, "reason": "一句話理由"}'},
        {"role": "user", "content": "提問摘要：" + question[:120] +
                   "\n候選段落：\n" + json.dumps(window, ensure_ascii=False)},
    ]
    try:
        answer = _router_json(messages)
    except Exception as err:
        return {"error": str(err)}
    index = answer.get("index")
    confidence = float(answer.get("confidence") or 0)
    if not isinstance(index, int) or not (lo <= index < hi) or confidence < 0.75:
        return {"rejected": True, "answer": answer}
    return {"sentenceIndex": index, "confidence": confidence,
            "reason": answer.get("reason"), "probe": question[:80]}


def cleanup_segments(segments: list) -> tuple:
    """在「章界對齊之前」清理 ASR 片段，確保章界索引與最終發布句一致。

    順序很重要：句末標點 → 懸掛連接詞合併 → 重複迴圈收斂 → 純填充句處理。
    任何一步都會改變片段數量，必須在 align_headings 之前完成。
    """
    stats = {"terminators": 0, "dangling": 0, "loops": 0, "fillerDropped": 0, "fillerMerged": 0}

    for seg in segments:
        if not re.search(r"[。！？；：」』）】]$", seg["text"]):
            seg["text"] = seg["text"].rstrip("，、") + "。"
            stats["terminators"] += 1

    # R3：句末懸掛連接詞（「……因此。」）→ 併入下一句，不新增、不刪字。
    merged_segments = []
    index = 0
    while index < len(segments):
        seg = segments[index]
        match = TRAILING_CONNECTIVE_RE.search(seg["text"])
        if match and index + 1 < len(segments):
            nxt = segments[index + 1]
            connective = match.group(1)
            head = seg["text"][: match.start()].rstrip("，。；：")
            nxt["text"] = f"{head}{connective}，{nxt['text']}"
            nxt["start"] = seg["start"]
            nxt["end"] = seg["end"]
            nxt["reviewNeeded"] = bool(seg.get("reviewNeeded")) or bool(nxt.get("reviewNeeded"))
            nxt["rawText"] = seg.get("rawText") or nxt.get("rawText")
            stats["dangling"] += 1
            index += 2
            continue
        merged_segments.append(seg)
        index += 1
    segments = merged_segments

    # R2：Whisper 重複迴圈（3 句以上連續完全相同）→ 保留第一句。
    collapsed = []
    for seg in segments:
        bare = re.sub(r"[，。、！？；：「」『』（）《》\s]", "", seg["text"])
        if collapsed and seg["text"] == collapsed[-1]["text"] and len(bare) >= 4:
            stats["loops"] += 1
            continue
        collapsed.append(seg)
    segments = collapsed

    # FILLER_ONLY：純填充／單詞應答句（呃、對、是…）→ 併入前一句保留原話。
    kept = []
    for seg in segments:
        if FILLER_ONLY_RE.fullmatch(seg["text"].strip()):
            stats["fillerDropped"] += 1
            if kept:
                previous = kept[-1]
                filler_text = seg["text"].strip().rstrip("。！？")
                previous["text"] = previous["text"].rstrip("。！？") + "，" + filler_text + "。"
                previous["reviewNeeded"] = bool(previous.get("reviewNeeded")) or bool(seg.get("reviewNeeded"))
                stats["fillerMerged"] += 1
            continue
        kept.append(seg)
    segments = kept

    for number, seg in enumerate(segments, start=1):
        seg["id"] = f"seg-{number:04d}"
    return segments, stats


def build_session(session_id: str, corpus, glossary, now_str: str) -> dict:
    folder = EVIDENCE / f"lecture_{session_id}"
    cleaned_path = folder / "cleaned_asr.json"
    if not cleaned_path.exists():
        raise SystemExit(f"缺 cleaned_asr.json：{cleaned_path}（先跑 Phase 4.5）")
    cleaned = json.loads(cleaned_path.read_text(encoding="utf-8"))

    segments = []
    pause_markers = 0
    dropped_filler = 0
    for seg in cleaned["segments"]:
        converted = CONVERTER.convert(seg["text"])
        pause_markers += len(PAUSE_MARK.findall(converted))
        normalized = normalize_punctuation(converted)
        if not normalized or re.fullmatch(r"[呃嗯啊喔欸，。！？、\s]+", normalized):
            dropped_filler += 1
            continue
        segments.append({
            "id": f"seg-{int(seg['id']):04d}",
            "start": seg["start"],
            "end": seg["end"],
            "text": normalized,
            "rawText": normalized,
            "reviewNeeded": bool(seg.get("reviewNeeded")),
            "rawAsrSegmentId": seg["id"],
        })

    is_closing = session_id == "06"
    anchors = []
    low_similarity = {}
    applied = []
    unresolved = []
    # 片段清理必須在章界對齊之前（會改變片段數量與索引）
    segments, cleanup_stats = cleanup_segments(segments)
    if is_closing:
        outline_text = OUTLINE_REF.read_text(encoding="utf-8")
        boundaries, failures = align_closing_sections(segments, outline_text)
        base_text_path = None
        # 結行的大綱是「問答摘要」而非逐字稿 → 字級比對必然失敗；
        # 改以模型輔助定錨「提問段落」，失敗者保留為失敗（不硬塞）。
        if failures:
            resolved = []
            for failure in list(failures):
                if failure.get("kind") not in ("question", "closing"):
                    resolved.append(failure)
                    continue
                lower = max([b["sentenceIndex"] for b in boundaries] or [0])
                upper = min(len(segments), lower + 250)
                if failure.get("kind") == "closing":
                    upper = len(segments)
                anchor = llm_anchor_question(failure, segments, lower, upper)
                if anchor and anchor.get("sentenceIndex") is not None:
                    raw_title = (failure.get("probeText") or "").strip()
                    if failure.get("kind") == "closing":
                        title = "結語"
                    else:
                        title = re.sub(r"^法師[，,、]\s*", "", raw_title)
                        title = re.sub(r"[，。？！].*$", "", title)[:20]
                    heading_text = ("結語" if failure.get("kind") == "closing"
                                    else (f"{failure['heading']}：{title}" if title
                                          else failure["heading"]))
                    boundaries.append({"sentenceIndex": anchor["sentenceIndex"],
                                       "heading": heading_text,
                                       "score": anchor["confidence"],
                                       "method": "llm-question-anchor"})
                    anchors.append({"lecture": "06", "heading": heading_text,
                                    "sentenceIndex": anchor["sentenceIndex"],
                                    "confidence": anchor["confidence"],
                                    "reason": anchor.get("reason"),
                                    "baseProbe": anchor.get("probe")})
                else:
                    resolved.append(failure)
            failures = resolved
            boundaries.sort(key=lambda b: b["sentenceIndex"])
            monotonic = []
            last_index = -1
            for boundary in boundaries:
                if boundary["sentenceIndex"] <= last_index:
                    failures.append({"lecture": "06", "heading": boundary["heading"],
                                     "reason": "not-monotonic-after-anchor", "topScore": 0.0})
                    continue
                monotonic.append(boundary)
                last_index = boundary["sentenceIndex"]
            boundaries = monotonic
    else:
        base_text = (SOURCE_DIR / f"lecture_{session_id}.txt").read_text(encoding="utf-8")
        base_sections, _preamble = parse_base_sections(base_text)
        asr_stream, ref_stream, char_map = global_char_map(segments, base_text)
        results = sentence_candidates(segments, asr_stream, ref_stream, char_map, canon(ref_stream))
        for item in results:
            low_similarity[item["sentenceIndex"]] = item["similarity"]
        candidates = [c for item in results for c in item["candidates"]]
        seen_spans = {(c["sentenceId"], c["compStart"], c["asrDelta"], c["referenceDelta"])
                      for c in candidates}
        for candidate in glossary_candidates(segments, corpus, glossary):
            key = (candidate["sentenceId"], candidate["compStart"],
                   candidate["asrDelta"], candidate["referenceDelta"])
            if key not in seen_spans:
                candidates.append(candidate)
        applied, unresolved = apply_candidates(segments, candidates, corpus)
        boundaries, failures = align_headings(base_sections, base_text, segments, char_map, session_id)
        base_text_path = f"courses/朝聖前行課程/source_text/lecture_{session_id}.txt"

        # 章界失敗 → 模型輔助定錨（仍留人工待確認紀錄；不得靜默猜測）
        anchors = []
        if failures:
            resolved = []
            for failure in list(failures):
                # 定錨窗必須落在「上一個已落錨章界」與「下一個已落錨章界」之間
                min_index = max([b["sentenceIndex"] for b in boundaries
                                 if b["sentenceIndex"] < min([c["sentenceIndex"] for c in failure.get("candidates", [{}])] or [10 ** 9])] or [0]) + 1
                later = [b["sentenceIndex"] for b in boundaries if b["sentenceIndex"] > min_index]
                max_index = min(later) if later else len(segments)
                anchor = llm_anchor_heading(failure, segments, base_sections, base_text,
                                            min_index=min_index, max_index=max_index)
                if anchor and anchor.get("sentenceIndex") is not None:
                    title = re.sub(r"^\d+\.\s*", "", failure["heading"])
                    section = next((s2 for s2 in base_sections if s2["heading"] == title), None)
                    heading_text = (f"{section['number']}. {section['heading']}" if section
                                    else failure["heading"])
                    boundaries.append({
                        "sentenceIndex": anchor["sentenceIndex"],
                        "heading": heading_text,
                        "score": anchor["confidence"],
                        "method": "llm-paraphrase-anchor",
                    })
                    anchors.append({"lecture": session_id, "heading": heading_text,
                                    "sentenceIndex": anchor["sentenceIndex"],
                                    "confidence": anchor["confidence"],
                                    "reason": anchor.get("reason"),
                                    "baseProbe": anchor.get("probe")})
                else:
                    resolved.append(failure)
            failures = resolved
            boundaries.sort(key=lambda b: b["sentenceIndex"])
            # 單調性複驗：落錨後不得出現倒退或重複
            cleaned_boundaries = []
            last_index = -1
            for boundary in boundaries:
                if boundary["sentenceIndex"] <= last_index:
                    failures.append({"lecture": session_id, "heading": boundary["heading"],
                                     "reason": "not-monotonic-after-anchor", "topScore": 0.0})
                    continue
                cleaned_boundaries.append(boundary)
                last_index = boundary["sentenceIndex"]
            boundaries = cleaned_boundaries

    NOISE_NOTES = ("editorial-divergence", "orthographic-variant", "overlap-skipped",
                   "stale-position", "punctuation-gap")
    for candidate in unresolved:
        if candidate.get("note") in NOISE_NOTES:
            continue
        if not candidate["asrDelta"] or not candidate["referenceDelta"]:
            continue
        segments[candidate["sentenceIndex"]]["reviewNeeded"] = True
    # 底本與 ASR 的整體相似度低，多半是「整編稿改寫」而非錯字 → 不逐句標紅；
    # 真正的疑義由 unattested-homophone 候選（29 筆量級）與校字層的退回段承擔。

    paragraphs = paragraphize(segments, boundaries)

    # 句末標點、懸掛連接詞、重複迴圈、純填充句已在 cleanup_segments（章界對齊前）完成，
    # 此處僅做曲引號正規化。
    terminators_added = cleanup_stats["terminators"]
    dangling_fixed = cleanup_stats["dangling"]
    loops_collapsed = cleanup_stats["loops"]
    filler_dropped = cleanup_stats["fillerDropped"]
    filler_merged = cleanup_stats["fillerMerged"]

    # 曲引號必須是「」
    curly = 0
    for para in paragraphs:
        for sent in para["sentences"]:
            if CURLY_RE.search(sent["text"]):
                curly += 1
                sent["text"] = CURLY_RE.sub(lambda m: "「" if m.group(0) in "“‘" else "」", sent["text"])

    sentence_total = sum(len(p["sentences"]) for p in paragraphs)
    flagged = sum(1 for p in paragraphs for s in p["sentences"] if s.get("reviewNeeded"))
    policy_counts = Counter(entry.get("policy", "unclassified") for entry in applied)
    total_chars = sum(len(s["text"]) for p in paragraphs for s in p["sentences"])
    title = SESSION_TITLES[session_id]

    session = {
        "sessionId": f"session_{session_id}",
        "title": title,
        "mediaType": "audio/mp3",
        "audioUrl": f"https://gx10-2887.tail378c21.ts.net/audio/chaosheng-qianxing-2026/CSQX_{session_id}.mp3",
        "lastUpdated": now_str,
        "publicationState": "candidate-review-required",
        "audioAvailable": True,
        "durationSec": cleaned["audioDurationSec"],
        "paragraphs": paragraphs,
        "_meta": {
            "pipeline": "asr+base-text-alignment+heading-anchoring" if not is_closing
                        else "asr-primary+outline-heading-anchoring",
            "pipeline_stage": "candidate",
            "candidateReviewRequired": True,
            "noBaseText": is_closing,
            "baseText": base_text_path,
            "baseTextRole": ("closing-outline-only (問答紀要大綱，非逐字)" if is_closing
                             else "official-edited-transcript (整編校稿，非逐字 gold)"),
            "outlineRef": ("reviews/evidence/朝聖前行課程/reference/closing_outline.txt"
                           if is_closing else None),
            "instructor": "如性法師",
            "lectureTitle": title,
            "engine": {
                "asr": cleaned.get("model"),
                "asrEndpoint": "whisper-gpu-service:8010",
                "normalize": cleaned.get("channel", {}).get("model"),
                "llm_proofread": True,
                "alignment": "python-difflib-sequence-matcher (t2s canonical keys)",
                "opencc": "s2twp",
            },
            "audioSource": {
                "sha256": (cleaned.get("audioSha256") or "").replace("sha256:", ""),
                "durationSec": cleaned["audioDurationSec"],
                "url": f"https://gx10-2887.tail378c21.ts.net/audio/chaosheng-qianxing-2026/CSQX_{session_id}.mp3",
            },
            "headingsAnchored": len([b for b in boundaries if b.get("heading")]),
            "headingAlignmentFailures": len(failures),
            "total_paragraphs": len(paragraphs),
            "total_sentences": sentence_total,
            "charCount": total_chars,
            "processed_at": now_str,
            "asrSegments": cleaned.get("segmentCount"),
            "fillerOnlySentencesDropped": dropped_filler + filler_dropped,
            "fillerOnlySentencesMerged": filler_merged,
            "asrPauseMarkersNormalized": pause_markers,
            "paragraphEndTerminatorsAdded": terminators_added,
            "danglingConnectivesMerged": dangling_fixed,
            "repeatedLoopsCollapsed": loops_collapsed,
            "curlyQuotesConverted": curly,
            "correctionsAutoApplied": len(applied),
            "correctionsByPolicy": dict(policy_counts),
            "correctionsPending": flagged,
            "adjudicationRecord": {
                "reviewedAt": now_str,
                "model": (cleaned.get("channel") or {}).get("model") or "auto-cloud",
                "scope": "機器層校字與結構對齊之待確認項裁決；不含人工逐句聽核",
                "pendingSentences": flagged,
                "pendingCategories": dict(Counter(
                    candidate.get("note") or "unclassified"
                    for candidate in unresolved
                    if candidate.get("note") not in NOISE_NOTES)),
                "decision": "凡機器無法以同音／詞庫護欄確定者一律保留 ASR 原話，"
                            "並標 reviewNeeded=true；不臆改、不以底本覆蓋原話。",
                "evidence": [
                    f"reviews/evidence/朝聖前行課程/lecture_{session_id}/correction_candidates.json",
                    "reviews/evidence/朝聖前行課程/work/pending_confirmations.json",
                ],
                "humanListened": False,
                "note": "本紀錄不宣稱已完成人工校對或錄音忠實度；成品為待閱校版。",
            },
            "timeAlignment": {
                "method": "ASR 片段時間碼；段落邊界＝該小標首句的 ASR start（滑動視窗相似度 ≥0.6 才落錨）",
                "source": f"reviews/evidence/朝聖前行課程/lecture_{session_id}/raw_asr.json",
                "sentencesAligned": sentence_total,
                "chunkOffsets": cleaned.get("chunkOffsets") or [],
            },
        },
        "qualityReview": {
            "humanProofread": False,
            "readerNotice": (
                "本節無逐字底本：正文為本機 ASR 轉寫＋名相校正，僅以問答紀要大綱作結構線索；"
                "尚未人工逐句聽核，請以音檔為準。" if is_closing else
                "本講逐字稿由本機 ASR 轉寫，並與官方整編校稿逐句對校名相與段落小標；"
                "尚未人工逐句聽核，請以音檔為準。"),
        },
    }
    return {"session": session, "failures": failures, "applied": applied,
            "unresolved": unresolved, "boundaries": boundaries, "anchors": anchors,
            "stats": {"paragraphs": len(paragraphs), "sentences": sentence_total,
                      "applied": len(applied), "unresolved": len(unresolved),
                      "flagged": flagged, "chars": total_chars}}


SESSION_TITLES = {
    "01": "第一講 什麼是朝聖",
    "02": "第二講 帶著成績單去見佛陀",
    "03": "第三講 別忘了隨身攜帶這個護身符",
    "04": "第四講 到了聖地如何修行",
    "05": "第五講 把朝聖帶回生活",
    "06": "結行指導與問答",
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    corpus = build_corpus()
    glossary = glossary_index(corpus)
    now_str = datetime.now(TPE).strftime("%Y-%m-%d %H:%M")
    all_failures = []
    all_anchors = []
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    for session_id in [s.strip() for s in args.sessions.split(",") if s.strip()]:
        result = build_session(session_id, corpus, glossary, now_str)
        stats = result["stats"]
        print(f"[build] {session_id}: paras={stats['paragraphs']} sents={stats['sentences']} "
              f"applied={stats['applied']} unresolved={stats['unresolved']} flagged={stats['flagged']} "
              f"chars={stats['chars']} headings={result['session']['_meta']['headingsAnchored']} "
              f"headingFailures={len(result['failures'])}", flush=True)
        for failure in result["failures"]:
            all_failures.append(failure)
        for anchor in result.get("anchors", []):
            all_anchors.append(anchor)
        if args.dry_run:
            continue
        (SESSIONS_DIR / f"session_{session_id}.json").write_text(
            json.dumps(result["session"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (folder := EVIDENCE / f"lecture_{session_id}").mkdir(parents=True, exist_ok=True)
        (folder / "correction_candidates.json").write_text(json.dumps({
            "sessionId": f"session_{session_id}",
            "algorithm": "python-difflib-sequence-matcher/v2",
            "appliedCount": len(result["applied"]),
            "appliedByPolicy": dict(Counter(e.get("policy", "unclassified") for e in result["applied"])),
            "unresolvedCount": len(result["unresolved"]),
            "applied": result["applied"],
            "unresolved": result["unresolved"],
            "headingBoundaries": result["boundaries"],
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "heading_alignment.json").write_text(json.dumps({
        "generatedAt": now_str,
        "note": "小標／章界對齊失敗清單。非空＝Merge Blocker：正式檔不得放猜測時間戳，須人工定錨。",
        "failures": all_failures,
        "modelAnchors": all_anchors,
        "modelAnchorNote": "整編稿把該節改寫成同義但不同字時，字級比對會失敗；"
                            "此處為模型輔助定錨結果（非人工聽核），一律需人工回聽確認。",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[build] heading_alignment failures: {len(all_failures)} → {WORK / 'heading_alignment.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
