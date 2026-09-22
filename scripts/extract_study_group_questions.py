#!/usr/bin/env python3
"""Extract evidence-linked discussion questions and teacher teaching spans."""

import argparse
import json
import re
import urllib.request
from pathlib import Path


def request_questions(endpoint, model, sentences):
    transcript = "\n".join(
        f'{item["id"]}|{item["start"]:.3f}|{item["text"]}' for item in sentences
    )
    prompt = """下方是完整佛法大組研討逐字稿，每行為 sentenceId|開始秒數|文字。
請辨識主持人實際念出的主要討論題目，不要把討論中的反問、追問、法師解釋時的設問列為目錄題目。
每一主要題目通常依序包含：主持人念題、學員討論、最後法師開示。請依證據輸出 JSON 陣列，每項欄位：
id（q-01 起）、rawQuestion（逐字稿中實際念出的題目文字）、displayQuestion（只整理標點與明顯錯字，不改題意，以全形問號結尾）、sentenceId、start、endSentenceId（本題最後一句）、teacherTeaching.startSentenceId、teacherTeaching.endSentenceId、teacherSummary.items（1至4點，每點只摘要法師開示）、confidence（high/medium/low）、evidenceNote。
法師開示通常由「法師請說」或等價交棒語開始；若不能可靠判定，confidence 必須是 low，且不要假造範圍或摘要。只輸出 JSON 陣列。

逐字稿：
""" + transcript
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 6000,
        "chat_template_kwargs": {"enable_thinking": False},
    }, ensure_ascii=False).encode()
    request = urllib.request.Request(endpoint, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=600) as response:
        content = json.load(response)["choices"][0]["message"]["content"]
    match = re.search(r"\[[\s\S]*\]", content)
    return json.loads(match.group(0) if match else content)


def validate(questions, sentences):
    by_id = {item["id"]: item for item in sentences}
    valid = []
    errors = []
    previous_start = -1
    for question in questions:
        ids = [
            question.get("sentenceId"),
            question.get("endSentenceId"),
            question.get("teacherTeaching", {}).get("startSentenceId"),
            question.get("teacherTeaching", {}).get("endSentenceId"),
        ]
        if any(item not in by_id for item in ids):
            errors.append({"id": question.get("id"), "reason": "unknown evidence sentence id"})
            continue
        actual_start = by_id[question["sentenceId"]]["start"]
        if actual_start < previous_start:
            errors.append({"id": question.get("id"), "reason": "non-monotonic question order"})
            continue
        question["start"] = actual_start
        question["status"] = "candidate"
        question.setdefault("teacherSummary", {})["linkedToAudio"] = False
        question["teacherSummary"]["status"] = "candidate"
        valid.append(question)
        previous_start = actual_start
    return valid, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--units", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--errors", type=Path, required=True)
    parser.add_argument("--endpoint", default="http://127.0.0.1:8001/v1/chat/completions")
    parser.add_argument("--model", default="Qwen3.8-27B")
    args = parser.parse_args()
    sentences = json.loads(args.units.read_text())["sentences"]
    valid, errors = validate(request_questions(args.endpoint, args.model, sentences), sentences)
    args.output.write_text(json.dumps(valid, ensure_ascii=False, indent=2))
    args.errors.write_text(json.dumps(errors, ensure_ascii=False, indent=2))
    print(json.dumps({"questions": len(valid), "errors": len(errors)}))


if __name__ == "__main__":
    main()
