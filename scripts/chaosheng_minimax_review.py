#!/usr/bin/env python3
"""MiniMax 第三輪審稿：以 router auto-cloud（實測回 MiniMax-M3.1-Flash）複核已發布逐字稿。

只做「發現與建議」，不直接改檔。產出：
  reviews/evidence/朝聖前行課程/work/minimax_review/session_0N_blocks.json  原始逐 block 回應
  reviews/evidence/朝聖前行課程/work/minimax_review/findings.json          彙整後的發現
  reviews/evidence/朝聖前行課程/work/minimax_review/REVIEW.md              人可讀報告

用法：
  python scripts/chaosheng_minimax_review.py --sessions 01,02,03,04,05,06
  python scripts/chaosheng_minimax_review.py --aggregate
"""
import argparse
import concurrent.futures
import json
import re
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
COURSE = REPO / "courses" / "朝聖前行課程"
EVIDENCE = REPO / "reviews" / "evidence" / "朝聖前行課程"
WORK = EVIDENCE / "work" / "minimax_review"
ROUTER_URL = "http://100.113.144.100:18770/v1/chat/completions"
MODEL = "auto-cloud"          # router → MiniMax-M3.1-Flash（實測 auto-cloud / auto-heavy 皆回此模型）
BLOCK_SIZE = 45
MAX_WORKERS = 3
_print_lock = threading.Lock()

SYSTEM_PROMPT = """你是一位嚴謹的華語佛教課程逐字稿審稿人，專精藏傳佛教與唯識學的法相用語。

你的任務是「只找出句子裡的字詞錯誤」，不是改寫、潤稿或重新分段。審稿對象是已發布的「待閱校版」逐字稿節錄。

請檢查下列類型：
1. 法相用字錯誤：專有名詞、法門名、經論名、人名地名、數字量詞被誤寫或同音替代
   （例：分別智／分別知、般泥洹、菩提迦耶、攝類學、近取因、俱生緣、請佛住世、欺誑三寶、拘尸那羅、藍毗尼、鹿野苑、祇樹給孤獨園……）。
2. 同音或近音錯字：ASR 造成的字形錯誤。
3. 句內明顯殘缺或語意不通（缺關鍵成分、黏成一句難以理解）。
4. 句內明顯重複或無意義填充（「嗯」「那個」「就是說」等）。
5. 句末標點缺失或誤用、數字被誤改。
6. 句內疑似幻覺片段（與上下文毫無關聯的插入語）。

嚴格規則（務必遵守）：
- 只提出「句內局部替換或刪除」；禁止整句重寫、禁止改動句界、禁止跨句合併或拆分。
  句界是 ASR 切分結果，「本句接續下一句」屬正常，不得據此提出問題。
- find 必須是該句中連續出現的一段文字（至少 2 個字，且在句中只出現一次）；
  replace 是把 find 換掉之後的片段；整段要刪掉時 replace 填空字串。
- 口語互動、問答、玩笑、口頭語、重複語氣詞都是講者原話，不得標為錯誤或幻覺。
- 只在有實據時才提出；把握不足就不要列出。
- 不要調整語氣、用詞風格、段落長短。
- 偈頌與經文引用若無法判斷，不要動它。
- 若某句完全正確，不要列。

輸出格式：只回傳 JSON 陣列，不要任何解釋文字。
每一筆物件：
{"idx": <行號>, "type": "term|sound|broken|repeat|punct|hallucination", "current": "<原句全文>", "find": "<要替換或刪除的片段>", "replace": "<建議片段；刪除則為空字串>", "confidence": <0~1 數字>, "reason": "<簡短理由>"}
若該區塊沒有問題，回傳空陣列 []。"""

USER_TMPL = """以下是一段逐字稿節錄，每行格式為「行號｜句子」。
請依規則找出問題句，並只回傳 JSON 陣列。

{block}"""


def call_router(messages, timeout=900, retries=3):
    payload = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": 8192,
        "temperature": 0.0,
    }
    last = None
    content = ""
    for attempt in range(retries):
        try:
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
            if content.strip():
                return content, {
                    "model": body.get("model"),
                    "elapsed": round(time.time() - started, 1),
                    "usage": body.get("usage"),
                }
            last = RuntimeError("empty content")
        except Exception as exc:  # noqa: BLE001
            last = exc
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"router failed after {retries} tries: {last}")


def parse_findings(content):
    text = content.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end < 0:
        return []
    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def load_sentences(session_id):
    data = json.loads((COURSE / "sessions" / f"session_{session_id}.json").read_text(encoding="utf-8"))
    out = []
    for para in data["paragraphs"]:
        for sent in para["sentences"]:
            out.append({
                "idx": len(out) + 1,
                "id": sent.get("id"),
                "start": sent.get("start"),
                "end": sent.get("end"),
                "text": sent.get("text", ""),
                "reviewNeeded": bool(sent.get("reviewNeeded")),
            })
    return out


def review_block(session_id, block_idx, sentences):
    body = "\n".join(f"{s['idx']}｜{s['text']}" for s in sentences)
    started = time.time()
    try:
        content, meta = call_router([
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_TMPL.format(block=body)},
        ])
        findings = parse_findings(content)
        status = "ok"
        err = None
    except Exception as exc:  # noqa: BLE001
        findings, meta, status, err = [], {}, "failed", str(exc)[:200]
    with _print_lock:
        print(f"[{session_id}] block {block_idx:02d} ({len(sentences)}句) "
              f"{status} findings={len(findings)} {round(time.time() - started, 1)}s"
              + (f" err={err}" if err else ""), flush=True)
    return {
        "session": session_id,
        "blockIndex": block_idx,
        "blockRange": [sentences[0]["idx"], sentences[-1]["idx"]],
        "status": status,
        "error": err,
        "meta": meta,
        "findings": findings,
        "raw": content if status == "ok" else "",
    }


def run(sessions):
    WORK.mkdir(parents=True, exist_ok=True)
    jobs = []
    for sid in sessions:
        sentences = load_sentences(sid)
        for bi, i in enumerate(range(0, len(sentences), BLOCK_SIZE)):
            jobs.append((sid, bi, sentences[i:i + BLOCK_SIZE]))

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(review_block, *job): job for job in jobs}
        for fut in concurrent.futures.as_completed(futures):
            sid, bi, _ = futures[fut]
            res = fut.result()
            results.setdefault(sid, {})[bi] = res

    for sid in sessions:
        blocks = [results[sid][bi] for bi in sorted(results[sid])]
        path = WORK / f"session_{sid}_blocks.json"
        path.write_text(json.dumps(blocks, ensure_ascii=False, indent=2), encoding="utf-8")
        total = sum(len(b["findings"]) for b in blocks)
        failed = sum(1 for b in blocks if b["status"] != "ok")
        print(f"session {sid}: blocks={len(blocks)} findings={total} failed={failed}", flush=True)


# ---------------------------------------------------------------- aggregation

TYPE_LABEL = {
    "term": "法相／專名用字",
    "sound": "同音近音錯字",
    "broken": "語意殘缺或斷裂",
    "repeat": "重複或無意義填充句",
    "punct": "標點或數字",
    "hallucination": "疑似幻覺句",
    "omission": "疑似漏句",
}


def load_base_text(session_id):
    p = COURSE / "source_text" / f"lecture_{session_id}.txt"
    if not p.exists():
        return ""
    return p.read_text(encoding="utf-8")


def load_v3_texts(session_id):
    """full large-v3 對該講所有待確認句的複辨結果（若有）。"""
    d = EVIDENCE / "work" / "v3_by_session" / f"session_{session_id}.json"
    if d.exists():
        return json.loads(d.read_text(encoding="utf-8"))
    return {}


def normalize(s):
    return re.sub(r"\s+", "", s or "")


def aggregate():
    """彙整各 block 的發現，逐筆對回正式 session 文字（find 必須在句中唯一出現）。"""
    findings = []
    rejected = []
    for path in sorted(WORK.glob("session_*_blocks.json")):
        sid = path.name.split("_")[1]
        blocks = json.loads(path.read_text(encoding="utf-8"))
        sentences = load_sentences(sid)
        by_idx = {s["idx"]: s for s in sentences}
        base_norm = normalize(load_base_text(sid))
        for block in blocks:
            for f in block.get("findings", []):
                idx = f.get("idx")
                cur = (f.get("current") or "").strip()
                find = (f.get("find") or "").strip()
                repl = f.get("replace")
                repl = repl if isinstance(repl, str) else ""
                reason = f.get("reason") or ""
                sent = by_idx.get(idx)
                rec = {
                    "session": sid,
                    "idx": idx,
                    "sentenceId": (sent or {}).get("id"),
                    "start": (sent or {}).get("start"),
                    "end": (sent or {}).get("end"),
                    "type": f.get("type"),
                    "typeLabel": TYPE_LABEL.get(f.get("type"), f.get("type")),
                    "current": cur,
                    "find": find,
                    "replace": repl,
                    "confidence": f.get("confidence"),
                    "reason": reason,
                    "blockRange": block.get("blockRange"),
                }
                if not sent:
                    rec["reject"] = "idx 不存在"
                    rejected.append(rec)
                    continue
                if cur and normalize(cur) != normalize(sent["text"]):
                    rec["reject"] = "current 與正式稿不符"
                    rejected.append(rec)
                    continue
                if len(find) < 2 or sent["text"].count(find) != 1:
                    rec["reject"] = "find 非句內唯一片段"
                    rejected.append(rec)
                    continue
                if not repl and repl != "":
                    rec["reject"] = "replace 型別錯誤"
                    rejected.append(rec)
                    continue
                if find == repl:
                    rec["reject"] = "無變更"
                    rejected.append(rec)
                    continue
                rec["baseTextSupport"] = bool(normalize(repl) and normalize(repl) in base_norm)
                rec["suggestedSentence"] = sent["text"].replace(find, repl, 1)
                findings.append(rec)

    out = WORK / "findings.json"
    out.write_text(json.dumps(findings, ensure_ascii=False, indent=2), encoding="utf-8")
    (WORK / "rejected.json").write_text(json.dumps(rejected, ensure_ascii=False, indent=2), encoding="utf-8")

    by_type = {}
    for f in findings:
        by_type[f["typeLabel"]] = by_type.get(f["typeLabel"], 0) + 1
    print(f"findings={len(findings)} rejected={len(rejected)}")
    for k, v in sorted(by_type.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}")
    print(f"底本文字支持: {sum(1 for f in findings if f['baseTextSupport'])}")
    return findings


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", default="01,02,03,04,05,06")
    ap.add_argument("--aggregate", action="store_true")
    args = ap.parse_args()
    if args.aggregate:
        aggregate()
    else:
        run([s for s in args.sessions.split(",") if s])
