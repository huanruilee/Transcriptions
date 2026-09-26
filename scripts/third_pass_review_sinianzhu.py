#!/usr/bin/env python3
"""Third-pass, context-grounded review of the remaining 四念住 queue.

This pass changes review state only. It never changes text/rawText/timestamps.
"""
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
BATCH_SIZE = 32


def call_batch(items):
    system = (
        "你是第三輪佛學逐稿審核 Agent。這些句子已經過兩輪審核，現在只可在證據足以唯一排除疑點時"
        "標記 resolved。可用證據只有 text、rawText、同段前後文與 heading；沒有音檔或原典時，不能"
        "靠語感或模型自信猜測。rawText 與 text 完全相同也不代表正確。若仍可能是音近字、專名、佛學"
        "術語或需要聽音檔，必須標記 human_needed。只輸出合法 JSON："
        "{\"decisions\":[{\"status\":\"resolved\"或\"human_needed\",\"reason\":\"...\"}, ...]}。"
        "數量必須等於輸入句數；不要改字、不要分析長文。"
    )
    user = "請逐句做第三輪證據審核：" + json.dumps(items, ensure_ascii=False)
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
    out = []
    for d in decisions:
        if not isinstance(d, dict) or d.get("status") not in ("resolved", "human_needed"):
            out.append({"status": "human_needed", "reason": "invalid_model_decision"})
        else:
            out.append({"status": d["status"], "reason": str(d.get("reason") or "context_review")[:120]})
    return out


def review_session(path, workers, checkpoint):
    data = json.loads(path.read_text(encoding="utf-8"))
    paragraphs = data.get("paragraphs", [])
    candidates = []
    for paragraph in paragraphs:
        sentences = paragraph.get("sentences", [])
        for index, sentence in enumerate(sentences):
            if sentence.get("humanReviewNeeded") is not True:
                continue
            candidates.append({
                "id": sentence.get("id"),
                "text": sentence.get("text", ""),
                "rawText": sentence.get("rawText", ""),
                "heading": paragraph.get("heading", ""),
                "previous": sentences[index - 1].get("text", "") if index else "",
                "next": sentences[index + 1].get("text", "") if index + 1 < len(sentences) else "",
            })
    batches = [candidates[i:i + BATCH_SIZE] for i in range(0, len(candidates), BATCH_SIZE)]
    results = [None] * len(batches)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(call_batch, batch): i for i, batch in enumerate(batches)}
        for future in as_completed(futures):
            index = futures[future]
            try:
                results[index] = future.result()
            except Exception:
                results[index] = [{"status": "human_needed", "reason": "model_or_format_failure"}] * len(batches[index])
                print(f"{path.stem}: batch {index + 1} fallback=human_needed", flush=True)
            print(f"{path.stem}: third-pass {index + 1}/{len(batches)}", flush=True)
    decisions = sum(results, [])
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    by_id = {item["id"]: decision for item, decision in zip(candidates, decisions)}
    resolved = 0
    human = 0
    for paragraph in paragraphs:
        for sentence in paragraph.get("sentences", []):
            decision = by_id.get(sentence.get("id"))
            if not decision:
                continue
            sentence["agentReviewPasses"] = 3
            sentence["agentThirdPassStatus"] = decision["status"]
            sentence["agentThirdPassReason"] = decision["reason"]
            if decision["status"] == "resolved":
                resolved += 1
                sentence["agentReviewStatus"] = "reviewed"
                sentence["agentReviewConfidence"] = 0.95
                sentence.pop("humanReviewNeeded", None)
                sentence.pop("reviewNeeded", None)
                sentence.pop("uncertainty", None)
                sentence.pop("agentReviewReason", None)
            else:
                human += 1
    meta = data.setdefault("_meta", {})
    meta.update({
        "agentThirdPassStatus": "completed",
        "agentThirdPassAt": now,
        "agentThirdPassBy": MODEL,
        "agentThirdPassCandidates": len(candidates),
        "agentThirdPassResolved": resolved,
        "agentThirdPassHumanNeeded": human,
        "agentReviewUncertainSentences": human,
        "agentReviewHumanNeededSentences": human,
        "processed_at": now,
        "last_updated": now,
    })
    data["lastUpdated"] = now
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result = {"sessionId": data.get("sessionId"), "totalSentences": sum(len(p.get("sentences", [])) for p in paragraphs), "thirdPassCandidates": len(candidates), "thirdPassResolved": resolved, "humanNeeded": human, "reviewedAt": now}
    checkpoint["sessions"][data.get("sessionId")] = result
    checkpoint["updatedAt"] = now
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "third_pass_checkpoint.json").write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    checkpoint_path = EVIDENCE / "third_pass_checkpoint.json"
    checkpoint = json.loads(checkpoint_path.read_text()) if checkpoint_path.exists() else {"courseId": "si-nian-zhu", "sessions": {}}
    results = []
    for number in range(1, 9):
        sid = f"session_{number:02d}"
        results.append(review_session(COURSE / "sessions" / f"{sid}.json", args.workers, checkpoint))
    report = {
        "courseId": "si-nian-zhu",
        "reviewPolicy": "evidence-grounded-third-pass-no-text-mutation",
        "agent": MODEL,
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "sessions": results,
        "totals": {
            "sentences": sum(x["totalSentences"] for x in results),
            "thirdPassCandidates": sum(x["thirdPassCandidates"] for x in results),
            "thirdPassResolved": sum(x["thirdPassResolved"] for x in results),
            "humanNeeded": sum(x["humanNeeded"] for x in results),
        },
    }
    (EVIDENCE / "third_pass_summary.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
