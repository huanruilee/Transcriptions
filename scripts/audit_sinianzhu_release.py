#!/usr/bin/env python3
"""Generate and validate a release ledger for the Si-Nian-Zhu course."""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

MIN_HEADINGS = 6
AUDIO_RE = re.compile(r"^(audio/[-\w]+\.mp3|https?://.+\.mp3)$", re.I)

def load_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)

def audit_session(path):
    data = load_json(path)
    sid = data.get("sessionId", path.stem)
    paragraphs = data.get("paragraphs", [])
    sentences = [s for p in paragraphs for s in p.get("sentences", [])]
    headings = [p for p in paragraphs if isinstance(p.get("heading"), str) and p["heading"].strip()]
    pending = [s for s in sentences if s.get("reviewNeeded") is True]
    structure_errors = []
    if sid != path.stem:
        structure_errors.append("sessionId does not match filename")
    if not paragraphs:
        structure_errors.append("paragraphs is empty")
    previous_end = 0.0
    for pidx, paragraph in enumerate(paragraphs):
        if not isinstance(paragraph.get("start"), (int, float)):
            structure_errors.append(f"paragraph[{pidx}] has invalid start")
        if not isinstance(paragraph.get("end"), (int, float)):
            structure_errors.append(f"paragraph[{pidx}] has invalid end")
        for sidx, sentence in enumerate(paragraph.get("sentences", [])):
            if not isinstance(sentence.get("text"), str) or not sentence["text"].strip():
                structure_errors.append(f"paragraph[{pidx}].sentence[{sidx}] has empty text")
            if not isinstance(sentence.get("start"), (int, float)) or not isinstance(sentence.get("end"), (int, float)):
                structure_errors.append(f"paragraph[{pidx}].sentence[{sidx}] has invalid timestamp")
            elif sentence["start"] < previous_end - 0.05:
                structure_errors.append(f"paragraph[{pidx}].sentence[{sidx}] timestamp regresses")
            else:
                previous_end = sentence["end"]
    audio_url = data.get("audioUrl")
    audio_ready = (
        data.get("audioAvailable") is True
        and isinstance(audio_url, str)
        and bool(AUDIO_RE.match(audio_url))
        and data.get("_meta", {}).get("audioDeleted") is not True
    )
    semantic_ready = (
        data.get("publicationState") == "published"
        and len(headings) >= MIN_HEADINGS
        and not pending
    )
    blockers = list(structure_errors)
    if not audio_ready:
        blockers.append("stable playable audio source is unavailable")
    if data.get("publicationState") != "published":
        blockers.append("publicationState is not published")
    if len(headings) < MIN_HEADINGS:
        blockers.append(f"only {len(headings)} headings; minimum is {MIN_HEADINGS}")
    if pending:
        blockers.append(f"{len(pending)} sentences still require semantic review")
    return {
        "sessionId": sid,
        "sourceFile": str(path),
        "publicationState": data.get("publicationState"),
        "structure": {
            "status": "PASS" if not structure_errors else "FAIL",
            "paragraphs": len(paragraphs),
            "sentences": len(sentences),
            "headings": len(headings),
            "errors": structure_errors,
        },
        "audio": {
            "status": "PASS" if audio_ready else "BLOCKED",
            "audioAvailable": data.get("audioAvailable", False),
            "audioUrlPresent": isinstance(audio_url, str) and bool(audio_url),
            "sourceAudioDeleted": data.get("_meta", {}).get("audioDeleted", False),
        },
        "semantic": {
            "status": "PASS" if semantic_ready else "BLOCKED",
            "pendingSentenceReviews": len(pending),
            "minimumHeadings": MIN_HEADINGS,
        },
        "releaseStatus": "READY" if not blockers else "BLOCKED",
        "blockers": blockers,
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--course-dir", default="courses/四念住")
    parser.add_argument("--output", default="reviews/evidence/sinianzhu/review_ledger.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    course_dir = Path(args.course_dir)
    course = load_json(course_dir / "course.json")
    sessions = [audit_session(path) for path in sorted((course_dir / "sessions").glob("session_*.json"))]
    blockers = [item for item in sessions if item["releaseStatus"] != "READY"]
    ledger = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "courseId": course.get("courseId"),
        "courseTitle": course.get("title"),
        "coursePublicationState": course.get("publicationState"),
        "sessionCount": len(sessions),
        "summary": {
            "ready": len(sessions) - len(blockers),
            "blocked": len(blockers),
            "structurePass": sum(x["structure"]["status"] == "PASS" for x in sessions),
            "audioPass": sum(x["audio"]["status"] == "PASS" for x in sessions),
            "semanticPass": sum(x["semantic"]["status"] == "PASS" for x in sessions),
        },
        "sessions": sessions,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(ledger["summary"], ensure_ascii=False))
    if args.check and blockers:
        print(f"BLOCKED: {len(blockers)} session(s) or release gates remain blocked", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
