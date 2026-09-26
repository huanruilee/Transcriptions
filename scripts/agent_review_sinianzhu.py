#!/usr/bin/env python3
"""Resumable, short-thinking Agent uncertainty review for 四念住."""
import argparse
import json
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / "courses/四念住"
EVIDENCE = ROOT / "reviews/evidence/sinianzhu"
ENDPOINT = os.environ.get("AGENT_REVIEW_ENDPOINT", "http://127.0.0.1:8001/v1/chat/completions")
MODEL = os.environ.get("AGENT_REVIEW_MODEL", "Qwen3.8-27B")
BATCH_SIZE = 50
ADJUDICATION_BATCH_SIZE = 40


def call_batch(items):
    system = (
        "你是佛學逐稿 Agent 分類器。比較 text 與 rawText，只判斷每句是否存在具體、"
        "無法唯一判定的疑點。status=reviewed 表示目前可接受；status=uncertain 只在"
        "有具體疑點時使用。只輸出合法 JSON {\\\"statuses\\\":[\\\"reviewed\\\"或"
        "\\\"uncertain\\\", ...]}，數量必須等於輸入句數；不要理由、不要分析、不要改字。"
    )
    user = "請審核以下逐稿句子：" + json.dumps(
        [{"id": s.get("id"), "text": s.get("text", ""), "rawText": s.get("rawText", "")} for s in items],
        ensure_ascii=False,
    )
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0,
        "max_tokens": 2048,
        "chat_template_kwargs": {"enable_thinking": False, "reasoning_effort": "low"},
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=240) as resp:
        body = json.load(resp)
    content = body.get("choices", [{}])[0].get("message", {}).get("content") or ""
    match = re.search(r"\{.*\}", content, re.S)
    if not match:
        raise RuntimeError("model returned no JSON")
    statuses = json.loads(match.group(0)).get("statuses")
    if not isinstance(statuses, list) or len(statuses) != len(items):
        raise RuntimeError("status count mismatch")
    return [x if x in ("reviewed", "uncertain") else "uncertain" for x in statuses]


def call_adjudication_batch(items):
    system = (
        "你是第二輪佛學逐稿裁決 Agent。這些句子已在第一輪被標記為存疑。比較 text 與 rawText；"
        "若句意已可接受、差異只是口語/斷句/格式或不需要音檔即可排除，status=resolved。"
        "只有必須聽音檔、需要原典或仍有兩個以上合理逐字稿，才 status=human_needed。"
        "只輸出合法 JSON {\"decisions\":[\"resolved\"或\"human_needed\", ...]}，數量必須相等；不要理由、不要分析。"
    )
    user = "請裁決以下第一輪存疑句子：" + json.dumps(
        [{"id": s.get("id"), "text": s.get("text", ""), "rawText": s.get("rawText", "")} for s in items],
        ensure_ascii=False,
    )
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0,
        "max_tokens": 2048,
        "chat_template_kwargs": {"enable_thinking": False, "reasoning_effort": "low"},
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(ENDPOINT, data=json.dumps(payload, ensure_ascii=False).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=240) as resp:
        body = json.load(resp)
    content = body.get("choices", [{}])[0].get("message", {}).get("content") or ""
    match = re.search(r"\{.*\}", content, re.S)
    if not match:
        raise RuntimeError("model returned no JSON")
    decisions = json.loads(match.group(0)).get("decisions")
    if not isinstance(decisions, list) or len(decisions) != len(items):
        raise RuntimeError("decision count mismatch")
    return [x if x in ("resolved", "human_needed") else "human_needed" for x in decisions]


def audit_session(path, workers, checkpoint):
    data = json.loads(path.read_text(encoding="utf-8"))
    sentences = [s for p in data.get("paragraphs", []) for s in p.get("sentences", [])]
    batches = [sentences[i : i + BATCH_SIZE] for i in range(0, len(sentences), BATCH_SIZE)]
    results = [None] * len(batches)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(call_batch, batch): i for i, batch in enumerate(batches)}
        for future in as_completed(futures):
            index = futures[future]
            try:
                results[index] = future.result()
            except Exception:
                if len(batches[index]) <= 10:
                    raise
                results[index] = sum(
                    (call_batch(batches[index][j : j + 10]) for j in range(0, len(batches[index]), 10)), []
                )
            print(f"{path.stem}: batch {index + 1}/{len(batches)}", flush=True)
    statuses = sum(results, [])
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    uncertain = 0
    for sentence, status in zip(sentences, statuses):
        sentence["agentReviewStatus"] = status
        sentence["agentReviewConfidence"] = 0.8 if status == "reviewed" else 0.6
        if status == "uncertain":
            uncertain += 1
            sentence["reviewNeeded"] = True
            sentence["uncertainty"] = "【Agent 存疑】Agent 判定此句仍有具體疑點，需進一步判定"
            sentence["agentReviewReason"] = "Agent 判定存在未能唯一解決的疑點"
        else:
            sentence.pop("reviewNeeded", None)
            sentence.pop("uncertainty", None)
            sentence.pop("agentReviewReason", None)
    meta = data.setdefault("_meta", {})
    meta.update(
        {
            "reviewPolicy": "agent-uncertainty-only",
            "agentReviewStatus": "completed",
            "agentReviewVersion": "qwen3.8-27b-text-uncertainty-v1",
            "agentReviewedAt": now,
            "agentReviewedBy": MODEL,
            "agentReviewTotalSentences": len(sentences),
            "agentReviewUncertainSentences": uncertain,
            "processed_at": now,
            "last_updated": now,
        }
    )
    data["lastUpdated"] = now
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result = {
        "sessionId": data.get("sessionId"),
        "totalSentences": len(sentences),
        "agentReviewed": len(sentences) - uncertain,
        "uncertain": uncertain,
        "reviewedAt": now,
    }
    checkpoint["sessions"][data.get("sessionId")] = result
    checkpoint["updatedAt"] = now
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "agent_review_checkpoint.json").write_text(
        json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return result


def adjudicate_session(path, workers, checkpoint):
    data = json.loads(path.read_text(encoding="utf-8"))
    sentences = [s for p in data.get("paragraphs", []) for s in p.get("sentences", [])]
    candidates = [s for s in sentences if s.get("agentReviewStatus") == "uncertain"]
    batches = [candidates[i : i + ADJUDICATION_BATCH_SIZE] for i in range(0, len(candidates), ADJUDICATION_BATCH_SIZE)]
    results = [None] * len(batches)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(call_adjudication_batch, batch): i for i, batch in enumerate(batches)}
        for future in as_completed(futures):
            index = futures[future]
            try:
                results[index] = future.result()
            except Exception:
                if len(batches[index]) <= 10:
                    results[index] = ["human_needed"] * len(batches[index])
                else:
                    try:
                        results[index] = sum((call_adjudication_batch(batches[index][j:j + 10]) for j in range(0, len(batches[index]), 10)), [])
                    except Exception:
                        results[index] = ["human_needed"] * len(batches[index])
                        print(f"{path.stem}: batch {index + 1} fallback=human_needed", flush=True)
            print(f"{path.stem}: adjudication {index + 1}/{len(batches)}", flush=True)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for sentence, decision in zip(candidates, sum(results, [])):
        sentence["agentReviewPasses"] = 2
        sentence["agentAdjudicationStatus"] = decision
        if decision == "resolved":
            sentence["agentReviewStatus"] = "reviewed"
            sentence["agentReviewConfidence"] = 0.9
            sentence.pop("reviewNeeded", None)
            sentence.pop("uncertainty", None)
            sentence.pop("agentReviewReason", None)
            sentence.pop("humanReviewNeeded", None)
        else:
            sentence["agentReviewConfidence"] = 0.7
            sentence["reviewNeeded"] = True
            sentence["humanReviewNeeded"] = True
            sentence["uncertainty"] = "【需人工判定】兩輪 Agent 仍無法唯一排除逐稿疑點"
            sentence["agentReviewReason"] = "兩輪 Agent 仍判定需音檔、原典或人工取捨"
    human_needed = sum(1 for s in sentences if s.get("humanReviewNeeded") is True)
    meta = data.setdefault("_meta", {})
    meta.update({
        "agentReviewVersion": "qwen3.8-27b-text-uncertainty-v1-adjudicated",
        "agentReviewedAt": now,
        "agentReviewTotalSentences": len(sentences),
        "agentReviewUncertainSentences": human_needed,
        "agentReviewHumanNeededSentences": human_needed,
        "agentReviewAdjudicationStatus": "completed",
        "agentReviewAdjudicatedBy": MODEL,
        "processed_at": now,
        "last_updated": now,
    })
    data["lastUpdated"] = now
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result = {"sessionId": data.get("sessionId"), "totalSentences": len(sentences), "agentReviewed": len(sentences) - human_needed, "uncertain": human_needed, "humanNeeded": human_needed, "reviewedAt": now}
    checkpoint["sessions"][data.get("sessionId")] = result
    checkpoint["updatedAt"] = now
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "agent_review_checkpoint.json").write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--adjudicate", action="store_true")
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()
    checkpoint_path = EVIDENCE / "agent_review_checkpoint.json"
    checkpoint = (
        json.loads(checkpoint_path.read_text())
        if checkpoint_path.exists()
        else {"courseId": "si-nian-zhu", "sessions": {}}
    )
    results = []
    for number in range(1, 9):
        session_id = f"session_{number:02d}"
        if args.full:
            audit_session(COURSE / "sessions" / (session_id + ".json"), args.workers, checkpoint)
            results.append(adjudicate_session(COURSE / "sessions" / (session_id + ".json"), args.workers, checkpoint))
            continue
        elif args.adjudicate:
            results.append(adjudicate_session(COURSE / "sessions" / (session_id + ".json"), args.workers, checkpoint))
        elif session_id in checkpoint["sessions"]:
            results.append(checkpoint["sessions"][session_id])
            print(session_id + ": checkpoint", flush=True)
            continue
        results.append(audit_session(COURSE / "sessions" / (session_id + ".json"), args.workers, checkpoint))
    report = {
        "courseId": "si-nian-zhu",
        "reviewPolicy": "agent-uncertainty-only",
        "agent": MODEL,
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "sessions": results,
        "totals": {
            "sentences": sum(x["totalSentences"] for x in results),
            "agentReviewed": sum(x["agentReviewed"] for x in results),
            "uncertain": sum(x["uncertain"] for x in results),
            "humanNeeded": sum(x.get("humanNeeded", x["uncertain"]) for x in results),
        },
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "agent_review_summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
