#!/usr/bin/env python3
"""
scripts/sifayin_build_transcript.py

《四法印》逐字稿候選建立（grounded candidate）：

  raw_asr.json（ASR 片段）
    → OpenCC s2twp 繁轉 + 標點正規化
    → 與官方整編稿（courses/四法印/source_text/lecture_NN.txt）做字級對齊，
      逐句提出「最小差異校正候選」：只改短距離的同音／近音名相訛誤，
      絕不用整編稿覆蓋口語內容
    → 依官方提綱（outline.json）切段，段落小標取自官方提綱
    → 輸出 courses/四法印/sessions/session_NN.json（candidate-review-required）
      與 reviews/evidence/sifayin/playlist-NN/{candidate.json, correction_candidates.json}

原則（承 PIPELINE.md / TRANSCRIPT_PROOFREADING_QUALITY_CONTRACT）：
  * 時間碼一律來自 ASR，絕不用底本推算時間。
  * sentence.rawText 保留 ASR（繁轉後）原樣；text 才是校訂結果。
  * reviewNeeded 只標給低信心存疑句，不得全講標紅。
"""

import argparse
import difflib
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

import opencc
from pypinyin import lazy_pinyin

BASE = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE / "courses" / "四法印"
SOURCE_DIR = COURSE_DIR / "source_text"
SESSIONS_DIR = COURSE_DIR / "sessions"
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"

CONVERTER = opencc.OpenCC("s2twp")
COMPARABLE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
JUNK_CHARS = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufffd\u0000-\u001f]")
LATIN_RUN = re.compile(r"[A-Za-z]{3,}")

MAX_AUTO_CHANGE_CHARS = 6
MAX_TERM_FIX_CHARS = 4
MIN_SENTENCE_SIMILARITY = 0.55
MIN_TERM_FREQUENCY = 2

# 正寫法差異（不是 ASR 訛誤，也不該被底本蓋掉）：既不套用也不標存疑
ORTHOGRAPHIC_VARIANTS = {
    frozenset(pair) for pair in [
        ("他", "它"), ("做", "作"), ("佔", "占"), ("裏", "裡"), ("箸", "著"),
        ("着", "著"), ("裏", "里"),
    ]
}


def comparable_with_map(text: str):
    chars = []
    mapping = []
    for index, ch in enumerate(text):
        if COMPARABLE.match(ch):
            chars.append(ch)
            mapping.append(index)
    return "".join(chars), mapping


def normalize_punctuation(text: str) -> str:
    out = JUNK_CHARS.sub("", text)
    out = out.replace(",", "，").replace("?", "？").replace("!", "！")
    out = out.replace(":", "：").replace(";", "；")
    out = re.sub(r"\s+", "", out)
    out = re.sub(r"([，、])。", r"\1", out)
    out = re.sub(r"。{2,}", "。", out)
    return out.strip("，、")


def load_reference(session_id: str) -> str:
    return (SOURCE_DIR / f"lecture_{session_id}.txt").read_text(encoding="utf-8")


def global_char_map(asr_segments, reference):
    """回傳 asr 字元索引 → 參考字元索引 的對照表（只含 equal 區塊）。"""
    asr_stream = "".join(comparable_with_map(seg["text"])[0] for seg in asr_segments)
    ref_stream, _ = comparable_with_map(reference)
    ops = difflib.SequenceMatcher(None, asr_stream, ref_stream, autojunk=False).get_opcodes()
    mapping = {}
    for tag, i1, i2, j1, j2 in ops:
        if tag != "equal":
            continue
        for offset in range(i2 - i1):
            mapping[i1 + offset] = j1 + offset
    return asr_stream, ref_stream, mapping


def sentence_candidates(segments, asr_stream, ref_stream, char_map):
    """每句取其對應的參考區間，在句內做局部對齊，提出短距離校正候選。"""
    results = []
    cursor = 0
    for seg_index, seg in enumerate(segments):
        comp, mapping = comparable_with_map(seg["text"])
        length = len(comp)
        start, end = cursor, cursor + length
        cursor = end
        if length == 0:
            continue
        ref_positions = [char_map[i] for i in range(start, end) if i in char_map]
        if not ref_positions:
            continue
        window_start = max(0, min(ref_positions) - 8)
        window_end = min(len(ref_stream), max(ref_positions) + 9)
        ref_window = ref_stream[window_start:window_end]
        similarity = difflib.SequenceMatcher(None, comp, ref_window, autojunk=False).ratio()
        if similarity < MIN_SENTENCE_SIMILARITY:
            continue
        ops = refined_opcodes(comp, ref_window)
        for tag, i1, i2, j1, j2 in ops:
            if tag == "equal":
                continue
            asr_part = comp[i1:i2]
            ref_part = ref_window[j1:j2]
            change = max(len(asr_part), len(ref_part))
            if change > MAX_AUTO_CHANGE_CHARS:
                continue
            asr_contexts, ref_contexts = context_pairs(comp, ref_window, i1, i2, j1, j2)
            results.append({
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
    return results


def refined_opcodes(left: str, right: str):
    """
    difflib 常把一句之內的多處小差異併成一個大 replace 區塊。
    這裡對 replace 區塊再做一次巢狀對齊，把真正的單字／短詞差異拆出來。
    """
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
    """取差異兩側各一格作為語境（詞頻比對用），左右各一組成對。"""
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
    """同音（聲韻相同、不計聲調）或近音（同聲母且韻母只差一個音素）。"""
    sa, sb = syllables(a), syllables(b)
    if sa == sb:
        return True
    if len(sa) != 1 or len(sb) != 1:
        return False
    return sa[0][0] == sb[0][0] and levenshtein(sa[0], sb[0]) <= 1


def corpus_attested(candidate: dict, corpus: Counter) -> bool:
    """
    詞頻佐證：底本用過這個詞（含左右一格語境）≥MIN_TERM_FREQUENCY 次，
    而 ASR 的那個寫法在 11 份底本從未出現。這條規則防止把正常詞「校正」掉，
    例如 ASR「四諦」不會被底本的「寺諦」蓋掉（寺諦在底本零出現）。
    """
    pairs = [(candidate["asrDelta"], candidate["referenceDelta"])]
    pairs += list(zip(candidate.get("asrContexts", []), candidate.get("refContexts", [])))
    return any(corpus.get(ref, 0) >= MIN_TERM_FREQUENCY and corpus.get(asr, 0) == 0 for asr, ref in pairs)


def classify_fix(candidate: dict, corpus: Counter) -> str:
    """
    校字政策（可稽核、可重現）：

      strict-homophone   ：等長（≤3 字）、每字聲韻完全相同，且有詞頻佐證 → ASR 同音訛誤。
      near-homophone-term：等長（≤4 字）、每字同音或近音（同聲母、韻母差一音素），且有詞頻佐證 → 名相訛誤。
      editorial-divergence：其餘（整編稿的口語刪節、連接詞改寫，或無詞頻佐證）→ 不改講者口語。
    """
    asr_part, ref_part = candidate["asrDelta"], candidate["referenceDelta"]
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
        # 同音但底本沒有詞頻佐證：不自作聰明改，交人工判讀
        return "unattested-homophone"
    if exact and len(asr_part) <= 3:
        return "strict-homophone"
    return "near-homophone-term"


def apply_candidates(segments, candidates, corpus):
    """
    依句子分組，由句尾往句頭套用（避免前面的編輯位移後面的對照位置）。
    名相訛誤＝自動套用並記錄政策；其餘留 unresolved 交 LLM／人工判讀。
    """
    by_sentence = {}
    for candidate in candidates:
        by_sentence.setdefault(candidate["sentenceIndex"], []).append(candidate)

    applied = []
    unresolved = []
    for seg_index, group in sorted(by_sentence.items()):
        seg = segments[seg_index]
        for candidate in sorted(group, key=lambda c: c["compStart"], reverse=True):
            comp, mapping = comparable_with_map(seg["text"])
            c_start, c_end = candidate["compStart"], candidate["compEnd"]
            if comp[c_start:c_end] != candidate["asrDelta"]:
                candidate["note"] = "stale-position"
                unresolved.append(candidate)
                continue
            text_start = mapping[c_start] if c_start < len(mapping) else len(seg["text"])
            text_end = mapping[c_end] if c_end < len(mapping) else len(seg["text"])
            if seg["text"][text_start:text_end] != candidate["asrDelta"]:
                candidate["note"] = "punctuation-gap"
                unresolved.append(candidate)
                continue
            policy = classify_fix(candidate, corpus)
            if policy in ("editorial-divergence", "orthographic-variant"):
                candidate["note"] = policy
                unresolved.append(candidate)
                continue
            if policy == "unattested-homophone":
                candidate["note"] = "unattested-homophone"
                unresolved.append(candidate)
                continue
            if len(candidate["asrDelta"]) > MAX_AUTO_CHANGE_CHARS:
                candidate["note"] = "too-large-edit"
                unresolved.append(candidate)
                continue
            candidate["policy"] = policy
            seg["text"] = seg["text"][:text_start] + candidate["referenceDelta"] + seg["text"][text_end:]
            applied.append(candidate)
    return applied, unresolved



def build_corpus() -> Counter:
    """11 份官方底本的 n-gram 頻率（2〜5 字），作為名相校正的判定依據。"""
    counter = Counter()
    for path in sorted(SOURCE_DIR.glob("lecture_*.txt")):
        stream = "".join(COMPARABLE.findall(path.read_text(encoding="utf-8")))
        for n in (2, 3, 4, 5):
            for i in range(len(stream) - n + 1):
                counter[stream[i:i + n]] += 1
    return counter


def paragraphize(segments, outline_sections):
    boundaries = []
    for section in outline_sections:
        start = section["startSec"]
        lower = boundaries[-1]["sentenceIndex"] if boundaries else 0
        chosen = None
        for i in range(lower, len(segments)):
            midpoint = (segments[i]["start"] + segments[i]["end"]) / 2
            if midpoint >= start:
                chosen = i
                break
        if chosen is None or (boundaries and chosen <= boundaries[-1]["sentenceIndex"]):
            continue
        boundaries.append({"sentenceIndex": chosen, "heading": section["heading"], "startSec": start})

    paragraphs = []
    for pos, boundary in enumerate(boundaries):
        start_idx = boundary["sentenceIndex"]
        end_idx = boundaries[pos + 1]["sentenceIndex"] if pos + 1 < len(boundaries) else len(segments)
        rows = segments[start_idx:end_idx]
        if not rows:
            continue
        paragraphs.append({
            "id": f"p-{pos + 1}",
            "heading": boundary["heading"],
            "start": rows[0]["start"],
            "end": rows[-1]["end"],
            "sentences": rows,
        })
    return paragraphs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", required=True)
    args = parser.parse_args()

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from sifayin_build_catalog import title_for  # 講次標題一律沿用官方「課程：」列

    corpus = build_corpus()

    for session_id in [s.strip() for s in args.sessions.split(",") if s.strip()]:
        folder = EVIDENCE / f"playlist-{session_id}"
        raw = json.loads((folder / "raw_asr.json").read_text(encoding="utf-8"))
        outline = json.loads((folder / "outline.json").read_text(encoding="utf-8"))
        reference = load_reference(session_id)

        segments = []
        droppedFiller = 0
        hallucinationSuspects = 0
        for seg in raw["segments"]:
            normalized = normalize_punctuation(CONVERTER.convert(seg["text"]))
            if not normalized or re.fullmatch(r"[呃嗯啊喔欸，。！？、\s]+", normalized):
                droppedFiller += 1
                continue
            suspect = len(LATIN_RUN.findall(normalized)) >= 2 or len(normalized) < 4 and not COMPARABLE.search(normalized)
            if suspect:
                hallucinationSuspects += 1
            segments.append({
                "id": seg["id"],
                "start": seg["start"],
                "end": seg["end"],
                "text": normalized,
                "rawText": normalized,
                "reviewNeeded": bool(suspect),
                "rawAsrSegmentId": seg["id"],
            })

        asr_stream, ref_stream, char_map = global_char_map(segments, reference)
        candidates = sentence_candidates(segments, asr_stream, ref_stream, char_map)
        applied, unresolved = apply_candidates(segments, candidates, corpus)

        for candidate in unresolved:
            if candidate.get("note") in ("editorial-divergence", "orthographic-variant"):
                continue  # 整編稿的口語刪節／改寫與正寫法差異，不是 ASR 錯誤，不標存疑
            if not candidate["asrDelta"] or not candidate["referenceDelta"]:
                continue
            segments[candidate["sentenceIndex"]]["reviewNeeded"] = True

        paragraphs = paragraphize(segments, outline["sections"])
        sentence_total = sum(len(p["sentences"]) for p in paragraphs)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        flagged = sum(1 for s in segments if s["reviewNeeded"])
        policy_counts = Counter(entry.get("policy", "unclassified") for entry in applied)

        payload = {
            "sessionId": f"session_{session_id}",
            "title": title_for(session_id)[0],
            "mediaType": "video/youtube",
            "youtubeVideoId": outline["youtubeVideoId"],
            "youtubeUrl": f"https://www.youtube.com/watch?v={outline['youtubeVideoId']}",
            "lastUpdated": now,
            "publicationState": "candidate-review-required",
            "audioAvailable": True,
            "paragraphs": paragraphs,
            "_meta": {
                "pipeline": "asr+official-basetext-alignment+outline-sectioning",
                "pipeline_stage": "candidate",
                "candidateReviewRequired": True,
                "noBaseText": False,
                "baseText": f"courses/四法印/source_text/lecture_{session_id}.txt",
                "baseTextKind": "official-edited-transcript",
                "outlineSource": "youtube-description",
                "instructor": "如性法師",
                "lectureTitle": title_for(session_id)[0],
                "total_paragraphs": len(paragraphs),
                "total_sentences": sentence_total,
                "processed_at": now,
                "audioDurationSec": raw["audioDurationSec"],
                "asrModel": raw["model"],
                "asrSegments": raw["segmentCount"],
                "fillerOnlySentencesDropped": droppedFiller,
                "hallucinationSuspects": hallucinationSuspects,
                "correctionsAutoApplied": len(applied),
                "correctionsByPolicy": dict(policy_counts),
                "correctionsPending": flagged,
                "timeAlignment": {
                    "method": "ASR 片段時間碼；段落邊界取自官方提綱時間碼",
                    "source": f"reviews/evidence/sifayin/playlist-{session_id}/raw_asr.json",
                    "sentencesAligned": sentence_total,
                },
            },
            "qualityReview": {
                "humanProofread": False,
                "readerNotice": "本講逐字稿由本地 ASR 轉寫，並與官方整編稿逐句對校名相，尚未經人工逐句聽核。請以音檔為準。",
            },
        }

        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        (SESSIONS_DIR / f"session_{session_id}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (folder / "candidate.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (folder / "correction_candidates.json").write_text(json.dumps({
            "schema": "sifayin-correction-candidates/v2",
            "sessionId": f"session_{session_id}",
            "algorithm": "python-difflib-sequence-matcher/v1 (comparable-unicode char map)",
            "correctionPolicy": {
                "strict-homophone": "等長 ≤3 字且每字聲韻相同（pypinyin 不計聲調）",
                "near-homophone-term": f"等長 ≤{MAX_TERM_FIX_CHARS} 字、每字同音或近音（同聲母且韻母 edit distance ≤1），"
                                       f"且底本詞頻 ≥{MIN_TERM_FREQUENCY}、ASR 寫法在 11 份底本零出現",
                "editorial-divergence": "其餘差異＝整編稿的口語刪節／改寫，不套用、不標存疑",
                "orthographic-variant": "他/它、做/作、佔/占 等正寫法差異：不套用、不標存疑",
                "unattested-homophone": "同音但底本無詞頻佐證：不自動改，標記 reviewNeeded 交人工",
            },
            "maxAutoChangeChars": MAX_AUTO_CHANGE_CHARS,
            "minSentenceSimilarity": MIN_SENTENCE_SIMILARITY,
            "appliedCount": len(applied),
            "appliedByPolicy": dict(policy_counts),
            "unresolvedCount": len(unresolved),
            "applied": applied,
            "unresolved": unresolved,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        ratio = sum(len(s["text"]) for s in segments) / raw["audioDurationSec"]
        print(f"[build] {session_id}: paras={len(paragraphs)} sentences={sentence_total} "
              f"applied={len(applied)}{dict(policy_counts)} unresolved={len(unresolved)} "
              f"flagged={flagged} fillerDropped={droppedFiller} suspect={hallucinationSuspects} ratio={ratio:.3f}",
              flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
