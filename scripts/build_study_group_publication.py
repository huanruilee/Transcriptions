#!/usr/bin/env python3
"""Build the public study-group course from reviewed evidence artifacts."""

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "reviews/evidence/study-group-2025"
COURSE_DIR = ROOT / "courses/2025釋量論第二品大組共學"
COURSE_ID = "shi-liang-lun-study-group-2025"


def display_session_id(title: str, playlist_index: int) -> str:
    """Use the lecture number in the title, while keeping playlist ids stable for routes."""
    match = re.search(r"第\s*(\d+)\s*講[^（(]*[（(](上|下)[）)]", title)
    if match:
        return f"{match.group(1)}{match.group(2)}"
    match = re.search(r"第\s*(\d+)\s*講", title)
    return match.group(1) if match else str(playlist_index)


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def read_main_prototype() -> dict:
    path = "courses/2025釋量論第二品大組共學/sessions/session_27B.json"
    raw = subprocess.check_output(["git", "show", f"main:{path}"], cwd=ROOT)
    return json.loads(raw)


def make_paragraphs(segments: list[dict], questions: list[dict], summaries: list[dict]) -> list[dict]:
    by_segment = {segment["id"]: segment for segment in segments}
    question_starts = {question["sourceSegmentIds"][0]: question for question in questions}
    summary_ends = {
        summary["sourceSegmentIds"][-1]: summary
        for summary in summaries
        if summary.get("sourceSegmentIds")
    }
    paragraphs = []
    current = []
    active_question = None

    def flush() -> None:
        nonlocal current
        if not current:
            return
        paragraph = {
            "id": f"p_{len(paragraphs) + 1:04d}",
            "questionId": active_question["id"] if active_question else None,
            "start": current[0]["start"],
            "end": current[-1]["end"],
            "sentences": current,
        }
        if current[0]["id"] in question_starts:
            paragraph["heading"] = question_starts[current[0]["id"]]["question"]
        if current[-1]["id"] in summary_ends:
            paragraph["teacherSummary"] = {
                "heading": "法師開示摘要",
                "items": summary_ends[current[-1]["id"]]["bullets"],
                "linkedToAudio": False,
                "status": "candidate",
            }
        paragraphs.append(paragraph)
        current = []

    for segment in segments:
        if segment["id"] in question_starts:
            flush()
            active_question = question_starts[segment["id"]]
        current.append({
            "id": segment["id"],
            "start": segment["start"],
            "end": segment["end"],
            "rawText": segment["text"],
            "text": segment["text"],
            # The course-level candidate state is shown separately. A sentence
            # is pending only when an independent review records a sentence-level flag.
            "reviewNeeded": bool(segment.get("reviewNeeded", False)),
        })
        if len(current) >= 8 or segment["id"] in summary_ends:
            flush()
    flush()
    return paragraphs


def build_session(index: int) -> tuple[dict, dict]:
    directory = EVIDENCE / f"playlist-{index:02d}"
    candidate = json.loads((directory / "candidate.json").read_text())
    review = json.loads((directory / "content_review.json").read_text())
    source = candidate["source"]
    questions = review["questionIndex"]
    summaries = review["teacherSummaries"]
    session_id = f"{index:02d}"
    session = {
        "sessionId": session_id,
        "displaySessionId": display_session_id(source["title"], index),
        "sourceOutlineId": "32-08" if index in (14, 15) else ("32-09" if index in (16, 17) else ("32-10" if index in (18, 19) else ("32-11" if index in (20, 21) else None))),
        "title": source["title"],
        "mediaType": "video/youtube",
        "youtubeVideoId": source["videoId"],
        "youtubeUrl": source["sourceUrl"],
        "lastUpdated": "2026-09-11",
        "transcriptStatus": "candidate",
        "alignmentStatus": "candidate",
        "tocMode": "discussion-questions",
        "discussionQuestions": [
            {
                "id": question["id"],
                "displayQuestion": question["question"],
                "sentenceId": question["sourceSegmentIds"][0],
                "start": next(s["start"] for s in review["segments"] if s["id"] == question["sourceSegmentIds"][0]),
                "teacherSummary": {
                    "heading": "法師開示摘要",
                    "items": next(s["bullets"] for s in summaries if s["questionId"] == question["id"]),
                    "linkedToAudio": False,
                    "status": "candidate",
                },
                "status": "candidate",
            }
            for question in questions
        ],
        "paragraphs": make_paragraphs(review["segments"], questions, summaries),
        "_meta": {
            "playlistIndex": index,
            "sourceUrl": source["sourceUrl"],
            "rawAsrPath": f"reviews/evidence/study-group-2025/playlist-{index:02d}/raw_asr.json",
            "contentReviewPath": f"reviews/evidence/study-group-2025/playlist-{index:02d}/content_review.json",
            "publicationState": "candidate-review-required",
        },
    }
    catalog_entry = {
        "sessionId": session_id,
        "displaySessionId": display_session_id(source["title"], index),
        "id": session_id,
        "sessionNum": index,
        "title": source["title"],
        "status": "candidate",
        "mediaType": "video/youtube",
        "youtubeVideoId": source["videoId"],
        "youtubeUrl": source["sourceUrl"],
    }
    return session, catalog_entry


def main() -> None:
    sessions = []
    catalog_sessions = []
    toc_nodes = []
    for index in range(1, 42):
        session, catalog_entry = build_session(index)
        sessions.append(session)
        catalog_sessions.append(catalog_entry)
        for question in session["discussionQuestions"]:
            toc_nodes.append({
                "id": question["id"],
                "title": question["displayQuestion"],
                "sessionId": session["sessionId"],
                "sessionIds": [session["sessionId"]],
                "timestamp": question["start"],
            })

    prototype = read_main_prototype()
    prototype["displaySessionId"] = "27下"
    for paragraph in prototype.get("paragraphs", []):
        if paragraph.get("teacherSummary"):
            paragraph["teacherSummary"].setdefault("heading", "法師開示摘要")
    sessions.append(prototype)
    catalog_sessions.append({
        "sessionId": "27B",
        "id": "27B",
        "sessionNum": 27,
        "subSession": "B",
        "periodLabel": "下",
        "displaySessionId": "27下",
        "title": prototype["title"],
        "status": prototype.get("transcriptStatus", "review-ready"),
        "mediaType": prototype["mediaType"],
        "audioUrl": prototype["audioUrl"],
    })
    for question in prototype["discussionQuestions"]:
        toc_nodes.append({
            "id": question["id"],
            "title": question["displayQuestion"],
            "sessionId": "27B",
            "sessionIds": ["27B"],
            "timestamp": question["start"],
        })

    for session in sessions:
        write_json(COURSE_DIR / "sessions" / f"session_{session['sessionId']}.json", session)
    write_json(COURSE_DIR / "course.json", {
        "courseId": COURSE_ID,
        "title": "2025《釋量論・第二品》大組共學",
        "master": "大組共學",
        "description": "依討論問題研讀《釋量論・第二品》，每題附法師開示摘要。",
        "tocMode": "discussion-questions",
        "transcriptPublicationState": "candidate-review-required",
        "sessions": catalog_sessions,
        "unavailableSessions": [
            {"playlistIndex": 42, "reason": "youtube_unavailable"},
            {"playlistIndex": 43, "reason": "youtube_private"},
            {"playlistIndex": 44, "reason": "source_audio_silent"},
        ],
    })
    write_json(COURSE_DIR / "toc.json", {
        "courseId": COURSE_ID,
        "tocMode": "discussion-questions",
        "nodes": toc_nodes,
    })

    catalog_path = ROOT / "courses/catalog.json"
    catalog = json.loads(catalog_path.read_text())
    catalog["courses"] = [course for course in catalog["courses"] if course["id"] != COURSE_ID]
    catalog["courses"].append({
        "id": COURSE_ID,
        "title": "2025《釋量論・第二品》大組共學",
        "master": "大組共學",
        "description": "依討論問題研讀《釋量論・第二品》，每題附法師開示摘要。",
        "path": "courses/2025釋量論第二品大組共學",
        "mediaType": "video/youtube",
        "totalSessions": len(sessions),
        "publicationState": "candidate-review-required",
    })
    write_json(catalog_path, catalog)


if __name__ == "__main__":
    main()
