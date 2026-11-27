#!/usr/bin/env python3
"""Deterministic sentence re-granularity pass for study-group session JSON.

Problem this fixes
------------------
ASR delivers one fragment per breath group (10-20 chars), so a session can end up
with ~2,000 fragments whose median length is ~13 chars. Such a session cannot pass
``scripts/check_session.mjs --strict`` (noEndPunctPct / shortFragmentPct) and reads
as choppy teletype text instead of sentences.

What the pass does
------------------
1. Groups consecutive paragraphs that share a speaker (and carry neither a heading
   nor a teacherSummary) while the group stays under ``--para-max`` characters.
   Paragraph ids are renumbered ``p_0001..`` in document order.
2. Inside each group, accumulates fragments into one sentence until the accumulated
   text ends with a strong (``。？！…」』）``) or soft (``：；``) terminator and reaches
   ``--min-chars`` / ``--soft-min`` characters. The run-head fragment keeps its
   ``id`` and ``rawText`` (so ASR provenance stays addressable); the merged text is
   the plain concatenation of the member texts.
3. Carries a group-final dangling run into the next group when the speaker is the
   same (ASR split a sentence across a paragraph break), otherwise closes it by
   replacing a trailing ``，``/``、`` with ``。`` (or appending ``。``).
4. Remaps every external sentence reference (``discussionQuestions[].sentenceId``,
   ``contentOverview.*.evidence[].sentenceId``) to the run-head id that now holds
   that fragment, then re-hydrates evidence quotes and the sourceDigest through
   ``scripts/content_overview_pipeline.mjs`` (single source of truth for both).

Guarantees (verified, not assumed)
----------------------------------
* The non-punctuation character stream of the whole session is unchanged.
* No sentence id disappears without its references being remapped; the run-head id
  always survives, so ``rawText`` immutability per id holds.
* Only paragraph/sentence boundaries and terminal punctuation change; no wording,
  no filler removal, no reordering.

Usage
-----
  python3 scripts/merge_session_sentences.py --file <session.json>            # dry run
  python3 scripts/merge_session_sentences.py --file <session.json> --apply \
      --ledger reviews/evidence/.../merge_ledger.json
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

STRONG_END = "。？！…」』）"
SOFT_END = "：；"
END_RE = re.compile(r"[。？！…」』）\"'：；]$")
TRAILING_COMMA_RE = re.compile(r"[，、]$")
REPO_ROOT = Path(__file__).resolve().parent.parent


def para_chars(paragraph: dict) -> int:
    return sum(len(str(s.get("text") or "")) for s in paragraph.get("sentences") or [])


def group_chars(group: list[dict]) -> int:
    return sum(para_chars(p) for p in group)


def group_paragraphs(paragraphs: list[dict], para_max: int) -> list[list[dict]]:
    groups: list[list[dict]] = []
    current: list[dict] = [paragraphs[0]]
    for paragraph in paragraphs[1:]:
        same_speaker = paragraph.get("speaker") == current[0].get("speaker")
        absorbable = (
            same_speaker
            and not paragraph.get("heading")
            and "teacherSummary" not in paragraph
            and "teacherSummary" not in current[0]
            and group_chars(current) + para_chars(paragraph) <= para_max
        )
        if absorbable:
            current.append(paragraph)
        else:
            groups.append(current)
            current = [paragraph]
    groups.append(current)
    return groups


def build_runs(sentences: list[dict], min_chars: int, soft_min: int) -> list[list[dict]]:
    runs: list[list[dict]] = []
    current: list[dict] = []
    for sentence in sentences:
        current.append(sentence)
        text = "".join(str(s.get("text") or "") for s in current).strip()
        if not text:
            continue
        if text[-1] in STRONG_END and len(text) >= min_chars:
            runs.append(current)
            current = []
        elif text[-1] in SOFT_END and len(text) >= soft_min:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    return runs


def close_dangling(text: str) -> str:
    """Close a turn-final fragment that has no sentence terminator."""
    stripped = text.rstrip()
    if not stripped:
        return text
    if END_RE.search(stripped):
        return stripped
    if TRAILING_COMMA_RE.search(stripped):
        return TRAILING_COMMA_RE.sub("。", stripped)
    return stripped + "。"


def protected_ids(session: dict) -> dict[str, str]:
    """sentence ids referenced from outside the transcript body, with their role."""
    refs: dict[str, str] = {}
    for question in session.get("discussionQuestions") or []:
        sid = str(question.get("sentenceId") or "").strip()
        if sid:
            refs.setdefault(sid, f"discussionQuestions:{question.get('id', '')}")
    for group in ("mainPoints", "discussionTopics", "referenceViews"):
        for index, item in enumerate((session.get("contentOverview") or {}).get(group) or []):
            for evidence in item.get("evidence") or []:
                sid = str(evidence.get("sentenceId") or "").strip()
                if sid:
                    refs.setdefault(sid, f"contentOverview:{group}:{index}")
    return refs


def merge_session(session: dict, min_chars: int, soft_min: int, para_max: int) -> dict:
    paragraphs = session["paragraphs"]
    refs = protected_ids(session)
    groups = group_paragraphs(paragraphs, para_max)

    # Pull each group's dangling tail into the next group when the speaker continues.
    pending_prefix: list[dict] = []
    prepared: list[list[dict]] = []
    for index, group in enumerate(groups):
        sentences = [s for p in group for s in p.get("sentences") or []]
        if pending_prefix:
            sentences = pending_prefix + sentences
            pending_prefix = []
        prepared.append((group, sentences))
        runs = build_runs(sentences, min_chars, soft_min)
        last_text = "".join(str(s.get("text") or "") for s in runs[-1]).strip() if runs else ""
        if (
            len(runs) > 1
            and index + 1 < len(groups)
            and last_text
            and not END_RE.search(last_text)
            and groups[index + 1][0].get("speaker") == group[0].get("speaker")
        ):
            pending_prefix = runs[-1]
            prepared[-1] = (group, sentences[: len(sentences) - len(runs[-1])])

    new_paragraphs: list[dict] = []
    old_to_new: dict[str, str] = {}
    merged_members: dict[str, list[str]] = {}
    carried_chars = 0

    for group, sentences in prepared:
        if not sentences:
            continue
        runs = build_runs(sentences, min_chars, soft_min)
        built: list[dict] = []
        for run in runs:
            text = "".join(str(s.get("text") or "") for s in run).strip()
            head = run[0]
            built.append(
                {
                    "id": head.get("id"),
                    "start": head.get("start"),
                    "end": run[-1].get("end"),
                    "rawText": head.get("rawText", ""),
                    "text": text,
                    "reviewNeeded": any(bool(s.get("reviewNeeded")) for s in run),
                    "speaker": head.get("speaker") or group[0].get("speaker"),
                }
            )
            for member in run:
                old_to_new[str(member.get("id"))] = str(head.get("id"))
            if len(run) > 1:
                merged_members[str(head.get("id"))] = [str(s.get("id")) for s in run]

        # turn-final sentence must end with a terminator
        last = built[-1]
        closed = close_dangling(last["text"])
        if closed != last["text"]:
            carried_chars += 1
            last["text"] = closed

        paragraph = {"id": f"p_{len(new_paragraphs) + 1:04d}", "speaker": group[0].get("speaker")}
        paragraph["sentences"] = built
        heading = next((p.get("heading") for p in group if p.get("heading")), None)
        if heading:
            paragraph["heading"] = heading
        summary = next((p.get("teacherSummary") for p in group if "teacherSummary" in p), None)
        if summary is not None:
            paragraph["teacherSummary"] = summary
        paragraph["start"] = built[0]["start"]
        paragraph["end"] = built[-1]["end"]
        new_paragraphs.append(paragraph)

    if pending_prefix:  # last group tail with no following group
        last_para = new_paragraphs[-1]
        last_sent = last_para["sentences"][-1]
        last_sent["text"] = "".join(str(s.get("text") or "") for s in pending_prefix) + last_sent["text"]
        last_sent["end"] = pending_prefix[-1].get("end")
        last_sent["text"] = close_dangling(last_sent["text"])
        for member in pending_prefix:
            old_to_new[str(member.get("id"))] = last_sent["id"]

    # remap external references
    remapped_refs = {}
    for sid, role in refs.items():
        target = old_to_new.get(sid)
        if target is None:
            raise SystemExit(f"protected sentence {sid} ({role}) disappeared during merge")
        remapped_refs[sid] = target
    for question in session.get("discussionQuestions") or []:
        sid = str(question.get("sentenceId") or "").strip()
        if sid in remapped_refs:
            question["sentenceId"] = remapped_refs[sid]
    deduped = 0
    for group_name in ("mainPoints", "discussionTopics", "referenceViews"):
        for item in (session.get("contentOverview") or {}).get(group_name) or []:
            for evidence in item.get("evidence") or []:
                sid = str(evidence.get("sentenceId") or "").strip()
                if sid in remapped_refs:
                    evidence["sentenceId"] = remapped_refs[sid]
            seen: set[str] = set()
            kept = []
            for evidence in item.get("evidence") or []:
                sid = str(evidence.get("sentenceId") or "").strip()
                if sid in seen:
                    deduped += 1
                    continue
                seen.add(sid)
                kept.append(evidence)
            item["evidence"] = kept

    session["paragraphs"] = new_paragraphs
    stats = {
        "sentencesBefore": sum(len(p.get("sentences") or []) for p in paragraphs),
        "sentencesAfter": sum(len(p["sentences"]) for p in new_paragraphs),
        "paragraphsBefore": len(paragraphs),
        "paragraphsAfter": len(new_paragraphs),
        "runsWithMergedFragments": len(merged_members),
        "danglingTailsClosed": carried_chars,
        "dedupedEvidence": deduped,
        "remappedReferences": remapped_refs,
        "minChars": min_chars,
        "softMin": soft_min,
        "paraMax": para_max,
    }
    ledger = {
        "tool": "scripts/merge_session_sentences.py",
        "params": {"minChars": min_chars, "softMin": soft_min, "paraMax": para_max},
        "stats": stats,
        "mergedMembers": merged_members,
    }
    return {"session": session, "stats": stats, "ledger": ledger}


def char_stream(session: dict) -> str:
    text = "".join(
        str(s.get("text") or "") for p in session["paragraphs"] for s in p.get("sentences") or []
    )
    return re.sub(r"[^\u3400-\u9fffA-Za-z0-9]", "", text)


def sync_overview(path: Path) -> dict:
    script = """
import fs from 'node:fs';
import { computeSourceDigest, hydrateEvidenceQuotes, validateContentOverview } from './scripts/content_overview_pipeline.mjs';
const file = process.argv[1];
const session = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!session.contentOverview) { console.log(JSON.stringify({ skipped: true })); process.exit(0); }
session.contentOverview = hydrateEvidenceQuotes(session.contentOverview, session);
session.contentOverview.sourceDigest = computeSourceDigest(session);
const result = validateContentOverview(session.contentOverview, session, {
  sourceTranscriptId: session.contentOverview.sourceTranscriptId,
});
fs.writeFileSync(file, JSON.stringify(session, null, 2) + '\\n');
console.log(JSON.stringify({ digest: session.contentOverview.sourceDigest, errors: result.errors.map((e) => e.code + ':' + e.detail) }));
"""
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script, str(path)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        raise SystemExit(f"overview sync failed:\n{out.stdout}\n{out.stderr}")
    return json.loads(out.stdout.strip().splitlines()[-1])


def metrics(session: dict) -> dict:
    import statistics

    sents = [s for p in session["paragraphs"] for s in p.get("sentences") or []]
    lengths = [len(str(s.get("text") or "").strip()) for s in sents]
    para_lengths = [para_chars(p) for p in session["paragraphs"]]
    no_end = sum(1 for s in sents if not END_RE.search(str(s.get("text") or "").strip()))
    short = sum(1 for s in sents if len(str(s.get("text") or "").strip()) <= 3)
    return {
        "paragraphs": len(session["paragraphs"]),
        "sentences": len(sents),
        "sentenceCharsMedian": statistics.median(lengths),
        "sentenceCharsP90": sorted(lengths)[int(0.9 * len(lengths))],
        "paragraphCharsMedian": statistics.median(para_lengths),
        "noEndPunctPct": round(100 * no_end / len(sents), 2),
        "shortFragmentPct": round(100 * short / len(sents), 2),
        "maxSentencesInParagraph": max(len(p.get("sentences") or []) for p in session["paragraphs"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--file", required=True, help="session JSON to rewrite")
    parser.add_argument("--min-chars", type=int, default=100, help="accumulate until a strong terminator and >= N chars")
    parser.add_argument("--soft-min", type=int, default=80, help="same, for ：； terminators")
    parser.add_argument("--para-max", type=int, default=300, help="max characters per merged paragraph")
    parser.add_argument("--apply", action="store_true", help="write the file (default: dry run)")
    parser.add_argument("--ledger", help="write merge ledger JSON here")
    parser.add_argument("--no-overview-sync", action="store_true", help="skip digest/quote re-hydration")
    args = parser.parse_args()

    path = Path(args.file)
    session = json.loads(path.read_text(encoding="utf-8"))
    before_stream = char_stream(session)
    before = metrics(session)

    result = merge_session(session, args.min_chars, args.soft_min, args.para_max)
    merged = result["session"]
    after_stream = char_stream(merged)
    if before_stream != after_stream:
        raise SystemExit("character stream changed: refusing to write")

    report = {"before": before, "after": metrics(merged), "stats": result["stats"]}
    if args.ledger:
        Path(args.ledger).parent.mkdir(parents=True, exist_ok=True)
        Path(args.ledger).write_text(json.dumps(result["ledger"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.apply:
        meta = merged.setdefault("_meta", {})
        meta["total_sentences"] = report["after"]["sentences"]
        meta["total_paragraphs"] = report["after"]["paragraphs"]
        meta["sentenceMerge"] = {
            "tool": "scripts/merge_session_sentences.py",
            "minChars": args.min_chars,
            "softMin": args.soft_min,
            "paraMax": args.para_max,
            "sentencesBefore": report["stats"]["sentencesBefore"],
            "sentencesAfter": report["stats"]["sentencesAfter"],
            "paragraphsBefore": report["stats"]["paragraphsBefore"],
            "paragraphsAfter": report["stats"]["paragraphsAfter"],
            "note": "只重切句與段界；用字、語序、rawText 未變更",
        }
        path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if not args.no_overview_sync:
            report["overview"] = sync_overview(path)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
