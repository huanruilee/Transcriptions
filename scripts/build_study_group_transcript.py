#!/usr/bin/env python3
"""Build reviewable study-group transcript units from chunked Whisper JSON."""

import argparse
import json
import re
import urllib.request
from pathlib import Path

def load_segments(raw_dir: Path, manifest_path: Path, source_duration: float):
    segments = []
    manifest = sorted(json.loads(manifest_path.read_text()), key=lambda item: float(item["offset_seconds"]))
    for index, item in enumerate(manifest):
        offset = float(item["offset_seconds"])
        chunk_end = (
            float(manifest[index + 1]["offset_seconds"])
            if index + 1 < len(manifest)
            else source_duration
        )
        payload = json.loads((raw_dir / item["response_file"]).read_text())
        for segment in payload["segments"]:
            start = max(offset, offset + float(segment["start"]))
            end = min(chunk_end, source_duration, offset + float(segment["end"]))
            if end <= start:
                continue
            segments.append({
                "start": round(start, 3),
                "end": round(end, 3),
                "text": segment["text"].strip(),
            })
    return segments


def merge_units(segments, target_chars=90, max_seconds=32):
    from opencc import OpenCC

    units = []
    current = []
    for segment in segments:
        current.append(segment)
        text = "".join(item["text"] for item in current)
        duration = current[-1]["end"] - current[0]["start"]
        if len(text) >= target_chars or duration >= max_seconds:
            units.append(current)
            current = []
    if current:
        units.append(current)

    converter = OpenCC("s2twp")
    return [{
        "id": f"sent-{index:04d}",
        "start": group[0]["start"],
        "end": group[-1]["end"],
        "rawText": "".join(item["text"] for item in group),
        "text": converter.convert("".join(item["text"] for item in group)),
    } for index, group in enumerate(units, 1)]


def call_qwen(endpoint, model, batch):
    system = (
        "你是佛法研討逐字稿校對員。輸入為 JSON 陣列，每項含 id 與繁體中文 ASR 文字。"
        "只修正明顯的同音錯字、佛學術語與標點，不得摘要、刪句、補充或改變語意。"
        "每項輸出 id、text；數量、id、順序必須完全相同。只輸出 JSON 陣列。"
    )
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps([
                {"id": item["id"], "text": item["text"]} for item in batch
            ], ensure_ascii=False)},
        ],
        "temperature": 0,
        "max_tokens": 3000,
        "chat_template_kwargs": {"enable_thinking": False},
    }, ensure_ascii=False).encode()
    request = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=180) as response:
        content = json.load(response)["choices"][0]["message"]["content"]
    match = re.search(r"\[[\s\S]*\]", content)
    return json.loads(match.group(0) if match else content)


def proofread(units, endpoint, model, batch_size=8):
    accepted = 0
    fallbacks = 0
    for start in range(0, len(units), batch_size):
        batch = units[start:start + batch_size]
        try:
            result = call_qwen(endpoint, model, batch)
            valid = (
                isinstance(result, list)
                and [item.get("id") for item in result] == [item["id"] for item in batch]
                and all(isinstance(item.get("text"), str) and item["text"].strip() for item in result)
            )
        except Exception:
            result, valid = [], False
        if valid:
            for original, revised in zip(batch, result):
                original["text"] = revised["text"].strip()
                original["proofreadStatus"] = "model-reviewed"
                accepted += 1
        else:
            for original in batch:
                original["proofreadStatus"] = "fallback"
                original["reviewNeeded"] = True
                fallbacks += 1
        print(f"PROGRESS {min(start + batch_size, len(units))}/{len(units)} accepted={accepted} fallback={fallbacks}", flush=True)
    return {"accepted": accepted, "fallbacks": fallbacks}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--duration-seconds", type=float, required=True)
    parser.add_argument("--endpoint", default="http://127.0.0.1:8001/v1/chat/completions")
    parser.add_argument("--model", default="Qwen3.8-27B")
    parser.add_argument("--skip-model", action="store_true")
    args = parser.parse_args()

    units = merge_units(load_segments(args.raw_dir, args.manifest, args.duration_seconds))
    metrics = {"unitCount": len(units), "accepted": 0, "fallbacks": len(units)}
    if not args.skip_model:
        metrics = {"unitCount": len(units), **proofread(units, args.endpoint, args.model)}
    args.output.write_text(json.dumps({"metrics": metrics, "sentences": units}, ensure_ascii=False, indent=2))
    print(json.dumps(metrics))


if __name__ == "__main__":
    main()
