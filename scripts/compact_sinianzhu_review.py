#!/usr/bin/env python3
"""Compact sentence-level review triage.

Each model reviews a batch but returns only uncertain sentence IDs. This keeps
large transcript batches within the completion budget. A sentence is cleared
only when both models cover the batch successfully and neither lists its ID as
uncertain; failed or malformed batches remain fully pending.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
import os
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / "courses/四念住"
EVIDENCE = ROOT / "reviews/evidence/sinianzhu/review-triage-compact"
CORRECTION_PATH = Path(__file__).with_name("grounded_correct_sinianzhu.py")
SPEC = importlib.util.spec_from_file_location("grounded_correct_sinianzhu", CORRECTION_PATH)
correction = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(correction)

SYSTEM = """You are a conservative Buddhist transcript quality gatekeeper. Review every supplied sentence for semantic, doctrinal, homophone, proper-noun, quotation, or missing-word uncertainty. Return ONLY JSON of this exact form: {\"reviewed_count\": N, \"uncertain_ids\": [\"seg-id\", ...]}. N must equal the number of supplied items. List every sentence that needs audio/source or human confirmation. Do not list clear sentences. Do not rewrite text and do not omit review coverage."""


def source_ids(items):
    ids = [item.get("id") for item in items]
    if any(not isinstance(sid, str) or not sid.strip() for sid in ids) or len(set(ids)) != len(ids):
        raise ValueError("source IDs must be unique non-empty strings")
    return set(ids)


def positive_batch(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("batch must be positive")
    return number


def validate(result, chunk):
    ids = source_ids(chunk)
    if not isinstance(result, dict):
        raise ValueError("response must be an object")
    uncertain = result.get("uncertain_ids")
    if type(result.get("reviewed_count")) is not int or result["reviewed_count"] != len(chunk) or not isinstance(uncertain, list):
        raise ValueError("coverage mismatch")
    if any(not isinstance(item_id, str) or item_id not in ids for item_id in uncertain):
        raise ValueError("unknown uncertain id")
    if len(set(uncertain)) != len(uncertain):
        raise ValueError("duplicate uncertain id")
    return set(uncertain)


def gate(chunk, endpoint, model, key):
    payload = [{k: item.get(k, "") for k in ("id", "text", "rawText", "heading")} for item in chunk]
    result = correction.ask(SYSTEM, payload, endpoint=endpoint, model=model, api_key=key, max_tokens=4096)
    return validate(result, chunk)


def process(path, batch_size, apply_changes):
    if type(batch_size) is not int or batch_size <= 0:
        raise ValueError("batch size must be a positive integer")
    data = json.loads(path.read_text(encoding="utf-8"))
    source = correction.items_for(data)
    source_ids(source)
    if not source:
        raise ValueError("no sentences to review")
    chunks = [source[i:i + batch_size] for i in range(0, len(source), batch_size)]
    records = []
    def run(chunk):
        try:
            local = gate(chunk, correction.ADJUDICATOR_ENDPOINT, correction.ADJUDICATOR_MODEL, correction.ADJUDICATOR_KEY)
        except Exception as error:
            return chunk, None, f"local:{type(error).__name__}"
        try:
            external = gate(chunk, correction.ENDPOINT, correction.MODEL, correction.API_KEY)
        except Exception as error:
            return chunk, None, f"external:{type(error).__name__}"
        return chunk, local | external, None
    workers = int(os.environ.get("COMPACT_REVIEW_WORKERS", "2"))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for chunk, uncertain, error in pool.map(run, chunks):
            records.append({"ids": [item["id"] for item in chunk], "uncertain": sorted(uncertain) if uncertain is not None else None, "error": error})
    uncertain_ids = {item_id for record in records if record["uncertain"] is not None for item_id in record["uncertain"]}
    failed_ids = {item_id for record in records if record["error"] for item_id in record["ids"]}
    pending_ids = uncertain_ids | failed_ids
    changes = []
    for paragraph in data.get("paragraphs", []):
        for sentence in paragraph.get("sentences", []):
            sid = sentence.get("id")
            after = sid in pending_ids
            before = sentence.get("reviewNeeded")
            sentence["reviewNeeded"] = after
            if after:
                sentence["uncertainty"] = "雙模型標記需人工確認" if sid in uncertain_ids else "模型批次失敗，保守保留"
            else:
                sentence.pop("uncertainty", None)
            if before != after:
                changes.append({"id": sid, "before": before, "after": after})
    clear = sum(not (s.get("reviewNeeded") is True) for p in data.get("paragraphs", []) for s in p.get("sentences", []))
    pending = sum(s.get("reviewNeeded") is True for p in data.get("paragraphs", []) for s in p.get("sentences", []))
    data.setdefault("_meta", {})["reviewTriage"] = {"protocol": "compact-uncertain-ids", "proposerModel": correction.ADJUDICATOR_MODEL, "adjudicatorModel": correction.MODEL, "batchSize": batch_size, "clearSentences": clear, "pendingSentences": pending, "failedBatches": sum(bool(r["error"]) for r in records)}
    data["_meta"]["candidateReviewRequired"] = pending > 0
    return data, records, clear, pending, changes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int, default=8)
    parser.add_argument("--batch", type=positive_batch, default=64)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = EVIDENCE / run_id
    out.mkdir(parents=True, exist_ok=True)
    summary = {"runId": run_id, "apply": args.apply, "protocol": "compact-uncertain-ids", "sessions": []}
    for number in range(args.start, args.end + 1):
        path = COURSE / "sessions" / f"session_{number:02d}.json"
        data, records, clear, pending, changes = process(path, args.batch, args.apply)
        if args.apply:
            shutil.copy2(path, out / f"{path.stem}.before{path.suffix}")
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        report = {"sessionId": f"{number:02d}", "clear": clear, "pending": pending, "changedFlags": len(changes), "batches": records}
        (out / f"session_{number:02d}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary["sessions"].append(report)
        print(json.dumps({k: report[k] for k in ("sessionId", "clear", "pending", "changedFlags")}, ensure_ascii=False), flush=True)
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
