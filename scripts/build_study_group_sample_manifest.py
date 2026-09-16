#!/usr/bin/env python3
"""Build the study-group sample manifest for the 2025 大組共學 playlist.

Derives, for every playable playlist entry (the 42 candidate sessions, with
unavailable entries excluded and 27B preserved separately), exactly five
sample roles: opening, middle, ending, question, teacher-summary. All
selection is data-driven from the playlist inventory, the course data, and
the per-playlist content_review artifacts -- never a hard-coded per-session
list. Output is deterministic (sorted keys, fixed ordering, no timestamps).

Usage:
    python3 scripts/build_study_group_sample_manifest.py [--check]

--check re-derives the manifest in memory and exits non-zero if the
committed manifest differs (for CI reuse).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

RUNNER_VERSION = "1.0.0"
BASELINE_REF = "origin/codex/session01-refinement-confirmed"
ROLES = ("opening", "middle", "ending", "question", "teacher-summary")
SCHEMA = "study-group-sample-manifest/v1"

ROOT = Path(__file__).resolve().parent.parent
INVENTORY_PATH = ROOT / "reviews/evidence/study-group-2025/playlist_inventory.json"
COURSE_PATH = ROOT / "courses/2025釋量論第二品大組共學/course.json"
EVIDENCE_DIR = ROOT / "reviews/evidence/study-group-2025"
OUTPUT_PATH = EVIDENCE_DIR / "sample_manifest.json"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def segment_number(segment_id: str) -> int:
    return int(segment_id[4:])


def git_baseline_commit() -> str:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "--verify", BASELINE_REF],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build() -> dict:
    inventory = load_json(INVENTORY_PATH)
    course = load_json(COURSE_PATH)

    course_by_video = {
        session["youtubeVideoId"]: session
        for session in course["sessions"]
        if session.get("youtubeVideoId")
    }

    playable = [item for item in inventory["items"] if item.get("playable")]
    excluded = [item for item in inventory["items"] if not item.get("playable")]

    sessions = []
    for item in playable:
        video_id = item["videoId"]
        course_session = course_by_video.get(video_id)
        if course_session is None:
            raise SystemExit(f"course data has no session for playable video {video_id}")
        session_id = course_session["sessionId"]
        playlist_dir = EVIDENCE_DIR / f"playlist-{int(item['playlistIndex']):02d}"
        review_path = playlist_dir / "content_review.json"
        raw_asr_path = playlist_dir / "raw_asr.json"
        review = load_json(review_path)
        if review["source"]["videoId"] != video_id:
            raise SystemExit(f"content review video mismatch at {review_path}")
        segments = review["segments"]
        by_id = {segment["id"]: segment for segment in segments}

        first_question = min(review["questionIndex"], key=lambda q: q["localIndex"])
        question_segment_id = min(first_question["sourceSegmentIds"], key=segment_number)
        summaries = [
            summary
            for summary in review["teacherSummaries"]
            if summary["questionId"] == first_question["id"]
        ]
        if not summaries:
            raise SystemExit(f"no teacher summary for {first_question['id']} in {review_path}")
        summary = min(summaries, key=lambda s: s["localIndex"])
        summary_segment_id = min(summary["sourceSegmentIds"], key=segment_number)

        role_segment_ids = {
            "opening": segments[0]["id"],
            "middle": segments[len(segments) // 2]["id"],
            "ending": segments[-1]["id"],
            "question": question_segment_id,
            "teacher-summary": summary_segment_id,
        }
        question_source_ids = {
            sid for question in review["questionIndex"] for sid in question["sourceSegmentIds"]
        }
        if role_segment_ids["teacher-summary"] in question_source_ids:
            raise SystemExit(f"teacher-summary segment overlaps a question source in {review_path}")

        roles = {}
        for role in ROLES:
            segment_id = role_segment_ids[role]
            segment = by_id[segment_id]
            roles[role] = {
                "sessionId": session_id,
                "videoId": video_id,
                "segmentId": segment_id,
                "start": segment["start"],
                "end": segment["end"],
                "publishedTextSha256": sha256_text(segment["text"]),
                "artifacts": {
                    "contentReviewPath": str(review_path.relative_to(ROOT)),
                    "contentReviewSha256": sha256_file(review_path),
                    "rawAsrPath": str(raw_asr_path.relative_to(ROOT)),
                    "rawAsrSha256": sha256_file(raw_asr_path),
                },
            }

        sessions.append(
            {
                "sessionId": session_id,
                "displaySessionId": course_session.get("displaySessionId"),
                "videoId": video_id,
                "playlistIndex": int(item["playlistIndex"]),
                "roles": roles,
            }
        )

    retained = [
        {
            "sessionId": session["sessionId"],
            "reason": (
                "no playable playlist entry (not in the 42 candidate playable "
                "playlist scope); preserved separately outside the manifest sessions"
            ),
        }
        for session in course["sessions"]
        if not session.get("youtubeVideoId")
        or session["youtubeVideoId"] not in {item["videoId"] for item in playable}
    ]

    return {
        "schema": SCHEMA,
        "generatedBy": {
            "runner": "scripts/build_study_group_sample_manifest.py",
            "version": RUNNER_VERSION,
        },
        "baseline": {"ref": BASELINE_REF, "commit": git_baseline_commit()},
        "scope": {
            "candidateCount": len(sessions),
            "excludedVideoIds": [item["videoId"] for item in excluded],
            "selection": "playlist inventory playable entries, in playlist order, joined to course data by youtubeVideoId",
            "inputs": [
                str(INVENTORY_PATH.relative_to(ROOT)),
                str(COURSE_PATH.relative_to(ROOT)),
            ],
        },
        "retainedSeparately": retained,
        "sessions": sessions,
    }


def serialize(manifest: dict) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the committed manifest matches a fresh deterministic build",
    )
    args = parser.parse_args()

    rendered = serialize(build())
    if args.check:
        current = OUTPUT_PATH.read_text(encoding="utf-8") if OUTPUT_PATH.exists() else ""
        if current != rendered:
            print("sample_manifest.json is stale; re-run the runner", file=sys.stderr)
            return 1
        print("sample_manifest.json is up to date")
        return 0
    OUTPUT_PATH.write_text(rendered, encoding="utf-8")
    count = len(json.loads(rendered)["sessions"])
    print(f"wrote {OUTPUT_PATH.relative_to(ROOT)} ({count} sessions x {len(ROLES)} roles)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
