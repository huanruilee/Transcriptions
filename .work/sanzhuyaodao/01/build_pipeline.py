#!/usr/bin/env python3
"""三主要道 第01講 — S3 合併 / S4 校對 / S5 結構 / S6 摘要 pipeline.

S3 merge : target_chars=90 / max_seconds=32 -> seg-NNNN, OpenCC s2twp
S4 correct: local Qwen3.8-27B propose -> independent adjudicate -> accept
            only when both agree; disagreements go to the needs-review queue.
S5 structure: official 7-item outline timestamps -> paragraph boundaries
S6 summary : contentOverview schemaVersion 1 with evidence[].sentenceId
"""
import argparse
import difflib
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

WORK = Path(__file__).resolve().parent
ROOT = WORK.parents[3]
ENDPOINT = "http://127.0.0.1:8001/v1/chat/completions"
MODEL = "Qwen3.8-27B"
TARGET_CHARS = 90
MAX_SECONDS = 32
BATCH = 8

# Official course outline (from the YouTube description, verified by yt-dlp).
OUTLINE = [
    ("介紹課程架構", 0),
    ("為何要調整動機", 8 * 60 + 41),
    ("需要調整何種動機", 18 * 60 + 47),
    ("設定明確可行的目標至關重要", 33 * 60 + 16),
    ("調整動機後應呈現何種狀態", 46 * 60 + 17),
    ("何種人需要調整動機", 51 * 60 + 48),
    ("反思自己的目標是否設定錯誤", 56 * 60 + 17),
]

PROPOSER = """你是佛法人文講堂逐字稿校對員。輸入是 JSON 陣列，每項含 id 與 text（繁體中文 ASR 文字，無標點），並附前後文 prev / next 供判斷語境。

背景：這是如性法師「佛法實修．系列一：三主要道」課程的逐字稿。講者會提到自己先前的課程與論典，例如《入中論》（入中論善顯密意疏）、《釋量論》第二品、四聖諦、四法印、三歸一、宗喀巴《道次第》。

你的任務只有兩件事：
1. 修正明顯的同音錯字、專有名詞、佛學術語（例如「二帝」→「二諦」、「四聖地」→「四聖諦」、「三規一」→「三歸一」、「入行論」→「入中論」、「適量論」→「釋量論」）。
2. 補上標點（，。？！：、）並在語意完整處斷句。

嚴禁：摘要、刪句、漏字、補充原文沒有的內容、改寫語意、把口語改成書面語、加入自己的解釋或判斷。
每個字都必須對應原文：只能改換錯字本身，不可刪字或加字（標點與書名號除外）。
若某處無法確定，text 原樣輸出並在 reason 註明。
每項輸出 {id, text, reason}；數量、id、順序必須與輸入完全相同。只輸出 JSON 陣列。"""

ADJUDICATOR = """你是獨立的佛典逐字稿校對複核員。輸入是 JSON 陣列，每項含 id、original（原始 ASR 文字）、proposed（第一位校對員的建議）、prev、next（前後文）。

請先獨立判斷 original 應該怎麼校，再與 proposed 比對。只有在下列條件全部成立時才 decision="accept"：
1. 你獨立判斷出的實質文字與 proposed 完全一致（僅標點、書名號、空格差異不算）；
2. 該改動是同音錯字／專有名詞／佛學術語的明確更正，不是風格潤稿或標點美化；
3. 原文語境足以唯一支持該更正；
4. proposed 沒有漏字、刪句或加入原文沒有的內容。

若兩者不一致，或有競爭性候選詞（例如「住」與「慧」、「入行論」與「入中論」、「適量論」與「釋量論」拿不准），一律 decision="human"。
嚴禁自行改寫或新增內容。每項輸出 {id, decision, reason}；decision 只能是 accept/reject/human；數量、id、順序必須與輸入完全相同。只輸出 JSON 陣列。"""


def ask(system, payload, max_tokens=4096):
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "chat_template_kwargs": {"enable_thinking": False, "reasoning_effort": "low"},
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json"},
    )
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                content = json.load(response)["choices"][0]["message"].get("content", "")
            match = re.search(r"\[[\s\S]*\]", content)
            if not match:
                raise RuntimeError("model returned no JSON array")
            return json.loads(match.group(0))
        except Exception as error:  # noqa: BLE001 - retry any transport failure
            last = error
            time.sleep(2 ** attempt)
    raise RuntimeError(f"local model call failed: {last}")


def load_segments(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    segments = []
    for segment in data.get("segments", []):
        text = (segment.get("text") or "").strip()
        if not text:
            continue
        segments.append({
            "start": round(float(segment["start"]), 3),
            "end": round(float(segment["end"]), 3),
            "text": text,
        })
    return segments, data


def merge_units(segments, converter):
    units = []
    current = []
    for segment in segments:
        current.append(segment)
        text = "".join(item["text"] for item in current)
        duration = current[-1]["end"] - current[0]["start"]
        if len(text) >= TARGET_CHARS or duration >= MAX_SECONDS:
            units.append(current)
            current = []
    if current:
        units.append(current)
    merged = []
    for index, group in enumerate(units, 1):
        raw = "".join(item["text"] for item in group)
        merged.append({
            "id": f"seg-{index:04d}",
            "start": group[0]["start"],
            "end": group[-1]["end"],
            "rawText": raw,
            "text": converter.convert(raw),
        })
    return merged


# Mirrors the gates in tests/unit/asrIntegrityGate.test.js so a rejected
# correction can never leak into the published transcript.
PROMPT_LEAK_PATTERNS = [
    r"Here is the", r"```json", r"```markdown", r"【輸出】", r"【校勘說明】", r"校對完成",
]
CORRUPTION_BLACKLIST = [
    r"主觀藥", r"廣續如中文", r"廟\s*聖者父子", r"摩尼塔王", r"葡萄切[勒熱了]|普特伽羅",
    r"此宗有何能[政整治]", r"生[意一]諦", r"七狂法", r"(?<!太)陽眼", r"咒詩",
    r"非紋症|肺紋症", r"損壞[羹更]", r"有不[、\s]?進步", r"顛倒式", r"對所限|自己的所限",
    r"應層", r"物[意一]嗎", r"民[語语]何世俗", r"真意[爲為]有自[信性]", r"障[必畢]為體",
    r"來人所[為名]", r"無[信信]而迷亂", r"[虛虚]為真世俗", r"影像自行空", r"無明瞭",
]


def is_typo_edit(before, after):
    """Guard against model rewriting the lecture instead of correcting it."""
    if not isinstance(before, str) or not isinstance(after, str) or not after.strip():
        return False
    if any(bad in after for bad in PROMPT_LEAK_PATTERNS):
        return False
    if any(re.search(pattern, after) for pattern in CORRUPTION_BLACKLIST):
        return False
    if before == after:
        return True
    stripped_before = re.sub(r"[，。？！：、；,.?!;:\s《》〈〉「」『』（）()]", "", before)
    stripped_after = re.sub(r"[，。？！：、；,.?!;:\s《》〈〉「」『』（）()]", "", after)
    if stripped_before == stripped_after:
        return True  # punctuation-only change
    # Every character must still correspond to the source: a correction may
    # swap a wrong character for the right one, but never drop or add a word.
    if len(stripped_before) != len(stripped_after):
        return False
    matcher = difflib.SequenceMatcher(a=stripped_before, b=stripped_after, autojunk=False)
    changed_before = sum(i2 - i1 for tag, i1, i2, _, _ in matcher.get_opcodes() if tag != "equal")
    changed_after = sum(j2 - j1 for tag, _, _, j1, j2 in matcher.get_opcodes() if tag != "equal")
    if changed_before > 4 or changed_after > 4:
        return False
    if len(stripped_before) >= 12 and (changed_before / len(stripped_before) > 0.35):
        return False
    return True


def correct(units):
    """Two-pass grounded correction; only unanimous acceptances are applied."""
    proposals = []
    chunks = [units[offset:offset + BATCH] for offset in range(0, len(units), BATCH)]
    for number, chunk in enumerate(chunks, 1):
        payload = [
            {
                "id": item["id"],
                "text": item["text"],
                "prev": units[index - 1]["text"] if index else "",
                "next": units[index + 1]["text"] if index + 1 < len(units) else "",
            }
            for index, item in enumerate(units)
            if item["id"] in {entry["id"] for entry in chunk}
        ]
        try:
            result = ask(PROPOSER, payload)
            if [entry.get("id") for entry in result] != [item["id"] for item in chunk]:
                raise RuntimeError("proposer contract mismatch")
            proposals.extend(result)
        except Exception as error:  # noqa: BLE001
            print(f"  proposer batch {number} failed: {error}", flush=True)
            proposals.extend([
                {"id": item["id"], "text": item["text"], "reason": f"proposer failed: {error}"}
                for item in chunk
            ])
        print(f"  propose {number}/{len(chunks)}", flush=True)

    by_id = {entry["id"]: entry for entry in proposals}
    adjudicated = []
    achunks = [units[offset:offset + BATCH] for offset in range(0, len(units), BATCH)]
    for number, chunk in enumerate(achunks, 1):
        payload = [
            {
                "id": item["id"],
                "original": item["text"],
                "proposed": (by_id.get(item["id"], {}) or {}).get("text", item["text"]),
                "prev": units[index - 1]["text"] if index else "",
                "next": units[index + 1]["text"] if index + 1 < len(units) else "",
            }
            for index, item in enumerate(units)
            if item["id"] in {entry["id"] for entry in chunk}
        ]
        try:
            result = ask(ADJUDICATOR, payload)
            if [entry.get("id") for entry in result] != [item["id"] for item in chunk]:
                raise RuntimeError("adjudicator contract mismatch")
            adjudicated.extend(result)
        except Exception as error:  # noqa: BLE001
            print(f"  adjudicator batch {number} failed: {error}", flush=True)
            adjudicated.extend([
                {"id": item["id"], "decision": "human", "reason": f"adjudicator failed: {error}"}
                for item in chunk
            ])
        print(f"  adjudicate {number}/{len(achunks)}", flush=True)

    decisions = {entry["id"]: entry for entry in adjudicated}
    stats = {"accepted": 0, "rejected": 0, "human": 0, "unchanged": 0}
    for item in units:
        proposal = by_id.get(item["id"], {}) or {}
        decision = decisions.get(item["id"], {}) or {}
        proposed_text = (proposal.get("text") or "").strip() or item["text"]
        verdict = decision.get("decision", "human")
        if verdict == "accept" and is_typo_edit(item["text"], proposed_text):
            item["text"] = proposed_text
            item["reviewNeeded"] = False
            item["proofreadStatus"] = "accepted"
            stats["accepted"] += 1
            if proposed_text == item.get("rawText"):
                stats["unchanged"] += 1
        elif verdict == "reject":
            item["reviewNeeded"] = True
            item["proofreadStatus"] = "rejected"
            stats["rejected"] += 1
        else:
            item["reviewNeeded"] = True
            item["proofreadStatus"] = "needs-human-review"
            stats["human"] += 1
        item["proposal"] = proposed_text
        item["proposalReason"] = proposal.get("reason", "")
        item["adjudicatorDecision"] = verdict
        item["adjudicatorReason"] = decision.get("reason", "")
    return stats


def structure(units, duration):
    """Cut paragraph boundaries from the official outline timestamps.

    Each unit belongs to exactly one paragraph (assigned by its start time), so
    paragraphs never overlap and timestamps stay monotonic. Paragraph start/end
    mirror the first/last sentence, as required by the ASR integrity gate.
    """
    boundaries = [
        {"index": index, "heading": title, "start": min(second, duration)}
        for index, (title, second) in enumerate(OUTLINE)
    ]
    paragraphs = []
    for index, boundary in enumerate(boundaries):
        end = boundaries[index + 1]["start"] if index + 1 < len(boundaries) else duration
        sentences = [
            unit for unit in units
            if boundary["start"] <= unit["start"] < end
        ]
        if not sentences:
            continue
        paragraphs.append({
            "id": f"para-{index + 1:02d}",
            "heading": boundary["heading"],
            "start": sentences[0]["start"],
            "end": sentences[-1]["end"],
            "sentences": sentences,
        })
    return paragraphs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, default=WORK / "raw_asr_full.json")
    parser.add_argument("--out", type=Path, default=WORK / "session_01.json")
    parser.add_argument("--skip-correct", action="store_true")
    args = parser.parse_args()

    from opencc import OpenCC

    converter = OpenCC("s2twp")
    segments, raw_meta = load_segments(args.raw)
    duration = float(raw_meta.get("duration") or segments[-1]["end"])
    units = merge_units(segments, converter)
    print(f"merged units: {len(units)} (raw segments {len(segments)}, duration {duration:.3f}s)")

    stats = {"accepted": 0, "rejected": 0, "human": 0, "unchanged": 0}
    if not args.skip_correct:
        stats = correct(units)
        print(f"correction stats: {stats}")

    paragraphs = structure(units, duration)
    payload = {
        "sessionId": "01",
        "paragraphs": paragraphs,
        "_correctionStats": stats,
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out} paragraphs={len(paragraphs)}")


if __name__ == "__main__":
    main()
