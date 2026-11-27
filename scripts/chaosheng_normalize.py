#!/usr/bin/env python3
"""
scripts/chaosheng_normalize.py

《朝聖前行課程》ASR 校字（語言層，先於繁化與底本對齊）。

  lecture_0N/raw_asr.json  →  lecture_0N/cleaned_asr.json

硬性契約（違反即整批退回，不靜默）：
  * 段 id 1:1：cleaned 的 id 集合與順序必須與 raw 完全相同（不得增、刪、併段）；
  * 原話護欄：逐段 len(cleaned)/len(raw) 落在 0.85–1.15，整講 0.95–1.05；
  * 只允許：錯字／同音誤字（每字須同音或近音，且替換長度相等或差 1）、標點；
    不得刪重複詞、不得刪自我修正、不得改寫；
  * 越界或無法驗證的段落一律保留原文並標 reviewNeeded，不套用模型輸出；
  * 每筆實際套用的修改寫入 ledger（work/normalize_ledger_lecture_0N.json）。

通道：repo 既有的 GX10 router（scripts/onepass_proofread.py 預設同一支
`/v1/chat/completions`，model `auto-cloud`）。MiniMax Token Plan 額度已耗盡
（HTTP 500「已達到 Token Plan 用量上限」），故改用同一 repo 已在用的 router；
只送文字，不送音訊。
"""

import argparse
import difflib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from pypinyin import lazy_pinyin

BASE = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE / "courses" / "朝聖前行課程"
EVIDENCE = BASE / "reviews" / "evidence" / "朝聖前行課程"
WORK = EVIDENCE / "work"
LEDGER_DIR = WORK / "normalize"

ROUTER_URL = "http://100.113.144.100:18770/v1/chat/completions"
MODEL = "auto-cloud"
BATCH_SIZE = 25
MIN_SEG_RATIO = 0.85
MAX_SEG_RATIO = 1.15
MIN_TOTAL_RATIO = 0.95
MAX_TOTAL_RATIO = 1.05
MAX_CHANGED_CHARS = 4

SYSTEM_PROMPT = """你是佛教講記逐字稿的校字員。輸入是一段 Whisper ASR 的中文片段，每筆有 id 與 text。

你只能做三件事：
1. 修正明顯的錯字與同音／近音誤字（例：「佛經理提到」→「佛經裡提到」、「生煉木心」→「生戀慕心」、「意念不忘」→「憶念不忘」、「開經濟」→「開經偈」、「般涅槃」寫錯字）。
2. 把標點補正為全形中文標點（，。？：；、！），讓句子可讀。
3. 修正明顯的同音虛詞（的／得、在／再）等單字錯誤。

嚴格禁止：
- 改寫句子、精簡、摘要、合併句子或拆段。
- 刪除講者的重複詞、口頭語、自我修正（例如「就是說，就是說」必須保留）。
- 增加或刪除任何 id；id 必須與輸入完全相同且順序一致。
- 把口語改成書面語。

輸出必須只有 JSON 陣列，不得有任何說明文字或 Markdown 圍欄。格式：
[{"id": 1, "text": "校訂後全文"}, {"id": 2, "text": "..."}]"""

PUNCT_FULL = {
    ",": "，", ".": "。", "?": "？", "!": "！", ":": "：", ";": "；",
    "(": "（", ")": "）",
}
JUNK_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufffd\u0000-\u001f]")
HAN_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
SENT_END = "。！？；：」』）"

LEXICON = set()


def load_lexicon() -> set:
    """本課程確定名相（learned_corrections.domain_lexicon ∪ grounding.high_frequency_doctrinal_terms）。"""
    terms = set()
    corrections = COURSE_DIR / "learned_corrections.json"
    if corrections.exists():
        data = json.loads(corrections.read_text(encoding="utf-8"))
        terms.update(data.get("domain_lexicon", {}).keys())
    grounding = COURSE_DIR / "grounding.json"
    if grounding.exists():
        data = json.loads(grounding.read_text(encoding="utf-8"))
        terms.update(t["term"] for t in data.get("high_frequency_doctrinal_terms", []) if t.get("term"))
    return {t for t in terms if len(t) >= 2}


def deterministic_punctuation(text: str) -> str:
    out = JUNK_RE.sub("", text)
    out = out.replace("＼", "，")
    for half, full in PUNCT_FULL.items():
        out = out.replace(half, full)
    out = re.sub(r"[ \t]+", "", out)
    out = re.sub(r"，{2,}", "，", out)
    out = re.sub(r"，([。！？；：、」』）])", r"\1", out)
    out = re.sub(r"([「『（])，", r"\1", out)
    out = re.sub(r"。{2,}", "。", out)
    return out.strip("，、")


def syllables(text: str):
    return [re.sub(r"\d+$", "", p) for p in lazy_pinyin(text)]


def same_sound(a: str, b: str) -> bool:
    sa, sb = syllables(a), syllables(b)
    if not sa or not sb:
        return False
    if sa == sb:
        return True
    if len(sa) == 1 and len(sb) == 1:
        return sa[0][:1] == sb[0][:1] and abs(len(sa[0]) - len(sb[0])) <= 1
    return False


def han_only(text: str) -> str:
    return "".join(HAN_RE.findall(text))


def change_is_plausible(before: str, after: str, lexicon=None):
    """逐段檢查模型提案；不合理的差異只回退該處，不整段丟棄。

    回傳 (ok, reason, changed, filtered_text)：
      ok=False 表示有部分差異被回退（filtered_text 只保留可接受的修改）。
    只准同音／近音的等長替換（或差 1 字的替換），或改成本課程詞庫（lexicon）裡的
    確定名相（例：蘭比尼→藍毗尼，b/p 不同音但詞庫唯一）。
    """
    a, b = han_only(before), han_only(after)
    if a == b:
        return True, "punctuation-only", 0, after

    # 逐字元保留原字串的索引，才能把回退套回含標點的原文
    positions = [i for i, ch in enumerate(before) if HAN_RE.match(ch)]
    ops = difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
    changed = 0
    rejected = []
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            continue
        left, right = a[i1:i2], b[j1:j2]
        plausible = False
        if tag == "replace":
            if abs(len(left) - len(right)) > 1:
                plausible = False
            elif len(left) == len(right):
                plausible = all(same_sound(x, y) for x, y in zip(left, right))
                if not plausible and lexicon:
                    plausible = right in lexicon and left not in lexicon
            else:
                plausible = same_sound(left, right)
        if plausible:
            changed += max(len(left), len(right))
        else:
            rejected.append((i1, i2, j1, j2, left, right))

    if changed > MAX_CHANGED_CHARS:
        return False, f"changed-chars>{MAX_CHANGED_CHARS}", changed, before

    if not rejected:
        return True, "homophone-fix" if changed else "punctuation-only", changed, after

    # 只保留可接受的差異：把被拒的 opcode 改回原字
    text = after
    for i1, i2, j1, j2, left, right in sorted(rejected, key=lambda r: r[2], reverse=True):
        if j1 >= len(positions) or j2 > len(positions):
            return False, f"unmappable: {left}->{right}", changed, before
        start = positions[j1]
        end = positions[j2 - 1] + 1
        text = text[:start] + left + text[end:]
    return False, f"partial-revert: {','.join(f'{l}->{r}' for _, _, _, _, l, r in rejected)}", changed, text


def call_router(messages, timeout=600) -> tuple:
    payload = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": 16384,
        "temperature": 0.0,
        "reasoning_effort": "low",
    }
    req = urllib.request.Request(
        ROUTER_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    content = (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    return content, {"model": body.get("model"), "elapsed": round(time.time() - started, 1),
                     "usage": body.get("usage")}


def parse_batch(content: str):
    text = content.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end < 0:
        raise ValueError("no JSON array in model output")
    return json.loads(text[start:end + 1])


def normalize_session(session_id: str, limit_batches: int = 0, dry_run: bool = False) -> dict:
    folder = EVIDENCE / f"lecture_{session_id}"
    raw = json.loads((folder / "raw_asr.json").read_text(encoding="utf-8"))
    segments = raw["segments"]

    base_texts = {}
    for seg in segments:
        base_texts[seg["id"]] = deterministic_punctuation(seg["text"])

    ledger = []
    review_needed = set()
    batches = [segments[i:i + BATCH_SIZE] for i in range(0, len(segments), BATCH_SIZE)]
    if limit_batches:
        batches = batches[:limit_batches]

    stats = {"batches": 0, "batchesRejected": 0, "applied": 0, "noop": 0,
             "rejectedSegments": 0, "routerModels": []}
    cleaned_texts = dict(base_texts)

    for batch_index, batch in enumerate(batches):
        payload = [{"id": s["id"], "text": base_texts[s["id"]]} for s in batch]
        user = "以下為本次輸入資料（JSON）：\n" + json.dumps(payload, ensure_ascii=False)
        try:
            content, meta = call_router([
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
            ])
            stats["routerModels"].append(meta.get("model"))
            proposal = parse_batch(content)
        except (urllib.error.URLError, ValueError, json.JSONDecodeError) as err:
            print(f"[norm] {session_id} batch {batch_index}: 呼叫／解析失敗 → 保留原文：{err}", flush=True)
            stats["batchesRejected"] += 1
            for seg in batch:
                review_needed.add(seg["id"])
            continue

        stats["batches"] += 1
        ids_in = [s["id"] for s in batch]
        ids_out = [p.get("id") for p in proposal if isinstance(p, dict)]
        # 模型偶爾漏一兩筆（實測 40 筆回 39 筆）。漏筆不該讓整批白跑：
        # 只接受「輸入 id 的子集、無未知 id、無重複」，漏掉的段落保留原文並標 reviewNeeded。
        if len(set(ids_out)) != len(ids_out) or any(i not in ids_in for i in ids_out):
            print(f"[norm] {session_id} batch {batch_index}: id 不合契約（in {len(ids_in)} / out {len(ids_out)}）→ 整批退回",
                  flush=True)
            stats["batchesRejected"] += 1
            for seg in batch:
                review_needed.add(seg["id"])
            continue
        missing = [i for i in ids_in if i not in set(ids_out)]
        if missing:
            print(f"[norm] {session_id} batch {batch_index}: 模型漏 {len(missing)} 筆（{missing[:5]}）→ 該批保留原文",
                  flush=True)
            stats["droppedIds"] = stats.get("droppedIds", 0) + len(missing)
            for seg_id in missing:
                review_needed.add(seg_id)
        by_id = {p["id"]: p for p in proposal if isinstance(p, dict)}
        batch = [seg for seg in batch if seg["id"] in by_id]

        for seg in batch:
            prop = by_id[seg["id"]]
            before = base_texts[seg["id"]]
            after = deterministic_punctuation(str(prop.get("text") or ""))
            if not after:
                review_needed.add(seg["id"])
                stats["rejectedSegments"] += 1
                continue
            if after == before:
                stats["noop"] += 1
                continue
            ratio = len(after) / max(1, len(before))
            short_ok = len(before) < 30 and abs(len(after) - len(before)) <= 2
            if not (MIN_SEG_RATIO <= ratio <= MAX_SEG_RATIO) and not short_ok:
                review_needed.add(seg["id"])
                stats["rejectedSegments"] += 1
                ledger.append({"id": seg["id"], "stage": "length-guard", "before": before,
                               "proposed": after, "applied": False, "ratio": round(ratio, 3)})
                continue
            ok, reason, changed, filtered = change_is_plausible(before, after, LEXICON)
            if not ok:
                review_needed.add(seg["id"])
                stats["rejectedSegments"] += 1
                if filtered and filtered != before:
                    cleaned_texts[seg["id"]] = filtered
                    stats["partialApplied"] = stats.get("partialApplied", 0) + 1
                    ledger.append({"id": seg["id"], "stage": "character-guard-partial",
                                   "before": before, "proposed": after, "after": filtered,
                                   "applied": True, "reason": reason})
                else:
                    ledger.append({"id": seg["id"], "stage": "character-guard", "before": before,
                                   "proposed": after, "applied": False, "reason": reason})
                continue
            cleaned_texts[seg["id"]] = after
            stats["applied"] += 1
            ledger.append({"id": seg["id"], "stage": "applied", "before": before, "after": after,
                           "reason": reason, "changedChars": changed,
                           "start": seg["start"], "end": seg["end"]})
        print(f"[norm] {session_id} batch {batch_index + 1}/{len(batches)} "
              f"applied={stats['applied']} rejected={stats['rejectedSegments']}", flush=True)

    total_raw = sum(len(s["text"]) for s in segments)
    total_clean = sum(len(cleaned_texts[s["id"]]) for s in segments)
    total_ratio = total_clean / max(1, total_raw)
    if not (MIN_TOTAL_RATIO <= total_ratio <= MAX_TOTAL_RATIO):
        raise SystemExit(f"[norm] {session_id} 整講長度比 {total_ratio:.3f} 越界 "
                         f"({MIN_TOTAL_RATIO}–{MAX_TOTAL_RATIO})，不輸出 cleaned_asr.json")

    out_segments = []
    for seg in segments:
        text = cleaned_texts[seg["id"]]
        out_segments.append({
            "id": seg["id"],
            "start": seg["start"],
            "end": seg["end"],
            "text": text,
            "rawText": seg["text"],
            "reviewNeeded": seg["id"] in review_needed,
        })

    artifact = {
        "schema": "chaosheng-cleaned-asr/v1",
        "sessionId": session_id,
        "source": f"reviews/evidence/朝聖前行課程/lecture_{session_id}/raw_asr.json",
        "audioSha256": raw.get("audioSha256"),
        "audioDurationSec": raw.get("audioDurationSec"),
        "model": raw.get("model"),
        "normalizedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "channel": {"router": ROUTER_URL, "model": MODEL,
                    "note": "MiniMax Token Plan 額度耗盡，改用 repo 既有 GX10 router 通道"},
        "guards": {"segRatio": [MIN_SEG_RATIO, MAX_SEG_RATIO], "totalRatio": [MIN_TOTAL_RATIO, MAX_TOTAL_RATIO],
                   "maxChangedChars": MAX_CHANGED_CHARS, "idContract": "1:1 exact"},
        "stats": stats,
        "totalRatio": round(total_ratio, 4),
        "charCount": total_clean,
        "segmentCount": len(out_segments),
        "segments": out_segments,
    }

    if dry_run:
        return artifact

    LEDGER_DIR.mkdir(parents=True, exist_ok=True)
    (LEDGER_DIR / f"normalize_ledger_lecture_{session_id}.json").write_text(
        json.dumps({"sessionId": session_id, "entries": ledger}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    (folder / "cleaned_asr.json").write_text(
        json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[norm] {session_id}: ratio={total_ratio:.3f} applied={stats['applied']} "
          f"noop={stats['noop']} rejectedSegs={stats['rejectedSegments']} "
          f"batchesRejected={stats['batchesRejected']} reviewNeeded={len(review_needed)}", flush=True)
    return artifact


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", required=True)
    parser.add_argument("--limit-batches", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    global LEXICON
    LEXICON = load_lexicon()
    print(f"[norm] lexicon terms: {len(LEXICON)}", flush=True)
    for session_id in [s.strip() for s in args.sessions.split(",") if s.strip()]:
        normalize_session(session_id, limit_batches=args.limit_batches, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
