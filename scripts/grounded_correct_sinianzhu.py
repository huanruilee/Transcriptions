#!/usr/bin/env python3
"""High-precision, two-pass text correction for 四念住.

Only text is ever changed. Timestamps, ids, rawText and review metadata are
preserved. A proposal is applied only when the proposer and an independent
adjudication pass agree with high confidence; everything else is exported as
human-needed evidence.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import difflib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / "courses/四念住"
EVIDENCE = ROOT / "reviews/evidence/sinianzhu/text-correction"
ENDPOINT = os.environ.get("AGENT_REVIEW_ENDPOINT", "http://127.0.0.1:8001/v1/chat/completions")
MODEL = os.environ.get("AGENT_REVIEW_MODEL", "Qwen3.8-27B")
API_KEY = os.environ.get("ENEURAL_API_KEY", "")
ADJUDICATOR_ENDPOINT = os.environ.get("ADJUDICATOR_ENDPOINT", ENDPOINT)
ADJUDICATOR_MODEL = os.environ.get("ADJUDICATOR_MODEL", MODEL)
ADJUDICATOR_KEY = os.environ.get("ADJUDICATOR_API_KEY", API_KEY if ADJUDICATOR_ENDPOINT == ENDPOINT else "")
EXTERNAL_ENDPOINT = ENDPOINT.startswith("https://agents.eneural.ai")
# ENEURAL is reliable at 32 items/request in the full correction flow. 64 can
# occasionally truncate JSON at the current 2048-token cap; 128 is unsafe, and
# concurrent requests can queue until timeout. Keep safe upper bounds while
# allowing controlled tuning.
BATCH = min(int(os.environ.get("CORRECTION_BATCH", "32" if EXTERNAL_ENDPOINT else "8")), 64 if EXTERNAL_ENDPOINT else 8)
WORKERS = min(int(os.environ.get("CORRECTION_WORKERS", "1")), 2 if EXTERNAL_ENDPOINT else 1)


def is_local_typo_edit(before, after):
    """Reject model output that is really a sentence substitution/hallucination."""
    if not isinstance(before, str) or not isinstance(after, str) or not after.strip():
        return False
    if before == after:
        return False
    # Without audio/source text, automatic correction is limited to replacing
    # existing characters. Insertions/deletions can silently rewrite speech.
    if len(before) != len(after):
        return False
    matcher = difflib.SequenceMatcher(a=before, b=after, autojunk=False)
    opcodes = matcher.get_opcodes()
    changed_before = sum(i2 - i1 for tag, i1, i2, j1, j2 in opcodes if tag != "equal")
    changed_after = sum(j2 - j1 for tag, i1, i2, j1, j2 in opcodes if tag != "equal")
    # A transcription typo may replace/insert a few characters, but a whole
    # sentence replacement indicates an id/ordering hallucination.
    if changed_before > 4 or changed_after > 4:
        return False
    if max(len(before), len(after)) >= 12 and (changed_before / len(before) > 0.35 or changed_after / len(after) > 0.35):
        return False
    return True


def ask(system, payload, endpoint=ENDPOINT, model=MODEL, api_key=API_KEY, max_tokens=4096):
    # The hosted DeepSeek endpoint may spend completion budget on hidden
    # reasoning; cap it for bounded JSON review batches while keeping the local
    # Qwen path at its original budget.
    request_max_tokens = min(max_tokens, 2048) if endpoint.startswith("https://agents.eneural.ai") else max_tokens
    body = {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}], "temperature": 0, "max_tokens": request_max_tokens}
    if endpoint.startswith("http://127.0.0.1") or endpoint.startswith("http://localhost"):
        body["response_format"] = {"type": "json_object"}
        body["chat_template_kwargs"] = {"enable_thinking": False, "reasoning_effort": "low"}
    headers = {"Content-Type": "application/json", "User-Agent": "Transcriptions-grounded-review/1.0"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if endpoint.startswith("https://agents.eneural.ai"):
        with tempfile.TemporaryDirectory(prefix="eneural-request-") as temp_dir:
            body_path = Path(temp_dir) / "body.json"
            config_path = Path(temp_dir) / "curl.conf"
            body_path.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
            def curl_quote(value):
                return value.replace("\\", "\\\\").replace('"', '\\"')
            config_path.write_text(
                f'url = "{curl_quote(endpoint)}"\n'
                'request = POST\n'
                'silent\nshow-error\nfail\nconnect-timeout = 10\nmax-time = 30\n'
                f'header = "Content-Type: application/json"\nheader = "User-Agent: Transcriptions-grounded-review/1.0"\n'
                f'header = "Authorization: Bearer {curl_quote(api_key)}"\n'
                f'data-binary = "@{curl_quote(str(body_path))}"\n', encoding="utf-8")
            completed = subprocess.run(["curl", "--config", str(config_path)], capture_output=True, text=True, check=True, timeout=35)
            content = json.loads(completed.stdout)["choices"][0]["message"].get("content", "")
            match = re.search(r"\{.*\}", content, re.S)
            if not match:
                raise RuntimeError("model returned no JSON")
            return json.loads(match.group(0))
    req = urllib.request.Request(endpoint, data=json.dumps(body, ensure_ascii=False).encode(), headers=headers)
    last_error = None
    for attempt in range(3):
        try:
            request_timeout = 30 if endpoint.startswith("https://agents.eneural.ai") else int(os.environ.get("LOCAL_REVIEW_TIMEOUT", "90"))
            with urllib.request.urlopen(req, timeout=request_timeout) as response:
                content = json.load(response)["choices"][0]["message"].get("content", "")
            break
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:500]
            last_error = RuntimeError(f"HTTP {error.code}: {detail}")
            if attempt == 2:
                raise last_error
            time.sleep(2 ** attempt)
        except Exception as error:
            last_error = error
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    else:
        raise last_error
    match = re.search(r"\{.*\}", content, re.S)
    if not match:
        raise RuntimeError("model returned no JSON")
    return json.loads(match.group(0))


PROPOSER = """You are a high-precision Traditional Chinese Buddhist transcript proofreader.
Review each item using only its text, rawText, heading, and neighboring sentences.
Do not rewrite style or polish oral speech. Correct only a concrete typo, wrong
proper noun, or Buddhist term when context makes the correction highly certain.
If text and rawText are both wrong, you may still correct it when the course
context proves it. Otherwise use human. Keep each reason under 20 Chinese
characters. Return JSON {\"items\":[{\"id\":...,\"action\":\"keep\"|\"correct\"|\"human\",\"text\":...,\"confidence\":0..1,\"reason\":...}]}.
The output count and ids must exactly match the input. For keep/human, text must
equal the input text. Never alter punctuation merely for style."""

ADJUDICATOR = """You are an independent adjudicator for Buddhist transcript corrections.
First independently determine the exact corrected text from the supplied context;
do not anchor on the proposal. Accept only if your independent answer is exactly
the proposed text, the context uniquely supports it, and the change is a typo,
term, or proper-noun correction rather than stylistic rewriting. If a competing
term is plausible (for example 住 versus 慧), use human. Keep each reason under
20 Chinese characters. Return JSON
{\"items\":[{\"id\":...,\"independent_text\":...,\"decision\":\"accept\"|\"reject\"|\"human\",\"confidence\":0..1,\"reason\":...}]} with exactly one result per proposal."""


def items_for(data):
    out = []
    for paragraph in data.get("paragraphs", []):
        sentences = paragraph.get("sentences", [])
        for index, sentence in enumerate(sentences):
            out.append({"id": sentence.get("id"), "text": sentence.get("text", ""), "rawText": sentence.get("rawText", ""), "heading": paragraph.get("heading", ""), "previous": sentences[index - 1].get("text", "") if index else "", "next": sentences[index + 1].get("text", "") if index + 1 < len(sentences) else ""})
    return out


def process(path, apply_changes, max_sentences=None, skip_sentences=0):
    data = json.loads(path.read_text(encoding="utf-8"))
    source = items_for(data)
    if skip_sentences:
        source = source[skip_sentences:]
    if max_sentences:
        source = source[:max_sentences]
    proposal_chunks = [source[offset:offset + BATCH] for offset in range(0, len(source), BATCH)]

    def propose(chunk):
        try:
            result = ask(PROPOSER, chunk, endpoint=ENDPOINT, model=MODEL, api_key=API_KEY)
            got = result.get("items", [])
            if len(got) != len(chunk) or [x.get("id") for x in got] != [x["id"] for x in chunk]:
                raise RuntimeError("contract mismatch")
            return got
        except Exception as error:
            print(f"{path.name} proposer batch skipped: {type(error).__name__}", flush=True)
            return [{"id": item["id"], "action": "human", "text": item["text"], "confidence": 0, "reason": "模型批次格式錯誤"} for item in chunk]

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        proposal_results = list(pool.map(propose, proposal_chunks))
    proposals = [item for result in proposal_results for item in result]
    print(f"{path.name} proposer complete: {len(proposals)}/{len(source)}", flush=True)
    source_by_id = {x["id"]: x for x in source}
    candidates = [
        p for p in proposals
        if p.get("action") == "correct"
        and isinstance(p.get("text"), str)
        and p.get("confidence", 0) >= 0.9
        and is_local_typo_edit(source_by_id[p["id"]]["text"], p["text"])
    ]
    # Do not send the proposed replacement to the adjudicator: showing it would
    # anchor the independent answer and defeat the cross-model check.
    adjudication_items = [source_by_id[c["id"]] for c in candidates]
    decision_chunks = [adjudication_items[offset:offset + BATCH] for offset in range(0, len(adjudication_items), BATCH)]

    def adjudicate(chunk):
        try:
            result = ask(ADJUDICATOR, chunk, endpoint=ADJUDICATOR_ENDPOINT, model=ADJUDICATOR_MODEL, api_key=ADJUDICATOR_KEY)
            got = result.get("items", [])
            if len(got) != len(chunk) or [x.get("id") for x in got] != [x["id"] for x in chunk]:
                raise RuntimeError("contract mismatch")
            return got
        except Exception as error:
            print(f"{path.name} adjudicator batch skipped: {type(error).__name__}", flush=True)
            return [{"id": item["id"], "independent_text": "", "decision": "human", "confidence": 0, "reason": "裁決批次格式錯誤"} for item in chunk]

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        decision_results = list(pool.map(adjudicate, decision_chunks))
    decisions = [item for result in decision_results for item in result]
    print(f"{path.name} adjudicator complete: {len(decisions)}/{len(candidates)}", flush=True)
    proposal_by_id = {p["id"]: p for p in proposals}
    accepted = {
        d["id"] for d in decisions
        if d.get("decision") == "accept"
        and d.get("confidence", 0) >= 0.9
        and d.get("independent_text") == proposal_by_id.get(d["id"], {}).get("text")
    }
    changes = []
    for paragraph in data.get("paragraphs", []):
        for sentence in paragraph.get("sentences", []):
            proposal = proposal_by_id.get(sentence.get("id"))
            if proposal and sentence.get("id") in accepted and is_local_typo_edit(sentence.get("text", ""), proposal["text"]):
                changes.append({"id": sentence["id"], "before": sentence.get("text", ""), "after": proposal["text"], "reason": proposal.get("reason", "")})
                if apply_changes:
                    sentence["text"] = proposal["text"]
    return data, changes, len(proposals), len(candidates), len(accepted)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int, default=5)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--max-sentences", type=int)
    parser.add_argument("--skip-sentences", type=int, default=0)
    args = parser.parse_args()
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    (EVIDENCE / run_id).mkdir(parents=True, exist_ok=True)
    summary = {"runId": run_id, "apply": args.apply, "proposerModel": MODEL, "adjudicatorModel": ADJUDICATOR_MODEL, "sessions": []}
    for number in range(args.start, args.end + 1):
        path = COURSE / "sessions" / f"session_{number:02d}.json"
        data, changes, proposed, candidates, accepted = process(path, args.apply, args.max_sentences, args.skip_sentences)
        if args.apply and changes:
            backup = EVIDENCE / run_id / path.name
            shutil.copy2(path, backup)
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        report = {"sessionId": f"{number:02d}", "proposals": proposed, "candidates": candidates, "accepted": accepted, "changes": changes}
        (EVIDENCE / run_id / f"session_{number:02d}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary["sessions"].append(report)
        print(json.dumps(report, ensure_ascii=False), flush=True)
    (EVIDENCE / run_id / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
