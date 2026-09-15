#!/usr/bin/env python3
"""Assemble a study-group batch session from reviewed units and questions.

Generalised from assemble_study_group_prototype.py (27B) without the 27B
hard-coded review fixes. Provenance (YouTube source video, sha256, duration)
is passed in via arguments so every batch is reproducible from its manifest.
"""

import argparse
import json
from datetime import date
from pathlib import Path

COURSE_ID = "shi-liang-lun-study-group-2025"


def make_paragraphs(sentences, questions, size=4):
    question_starts = {q["sentenceId"]: q for q in questions}
    teaching_ends = {q["teacherTeaching"]["endSentenceId"]: q for q in questions}
    paragraphs = []
    current = []
    active_question = None
    attached_summary_ends = set()

    def flush():
        nonlocal current
        if not current:
            return
        paragraph = {
            "id": f"p_{len(paragraphs) + 1:03d}",
            "questionId": active_question["id"] if active_question else None,
            "start": current[0]["start"],
            "end": current[-1]["end"],
            "sentences": current,
        }
        if current[0]["id"] in question_starts:
            paragraph["heading"] = question_starts[current[0]["id"]]["displayQuestion"]
        ending = teaching_ends.get(current[-1]["id"])
        if ending and current[-1]["id"] not in attached_summary_ends:
            paragraph["teacherSummary"] = ending["teacherSummary"]
        paragraphs.append(paragraph)
        current = []

    for sentence in sentences:
        if sentence["id"] in question_starts:
            flush()
            outgoing = teaching_ends.get(sentence["id"])
            if outgoing and paragraphs:
                paragraphs[-1]["teacherSummary"] = outgoing["teacherSummary"]
                attached_summary_ends.add(sentence["id"])
            active_question = question_starts[sentence["id"]]
        current.append({
            "id": sentence["id"],
            "start": sentence["start"],
            "end": sentence["end"],
            "rawText": sentence["rawText"],
            "text": sentence["text"],
            "reviewNeeded": bool(sentence.get("reviewNeeded")),
        })
        if len(current) >= size or sentence["id"] in teaching_ends:
            flush()
    flush()
    return paragraphs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--units", type=Path, required=True)
    parser.add_argument("--questions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--session-num", type=int, required=True)
    parser.add_argument("--sub-session", required=True)
    parser.add_argument("--period-label", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--video-url", required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--duration-seconds", type=float, required=True)
    parser.add_argument("--asr-engine", default="faster-whisper-large-v3-turbo (whisper-gpu :8010)")
    args = parser.parse_args()

    units = json.loads(args.units.read_text())
    questions = json.loads(args.questions.read_text())
    sentences = units["sentences"]
    for sentence in sentences:
        raw_han = "".join(ch for ch in sentence["rawText"] if "\u4e00" <= ch <= "\u9fff")
        text_han = "".join(ch for ch in sentence["text"] if "\u4e00" <= ch <= "\u9fff")
        ratio = abs(len(raw_han) - len(text_han)) / max(1, len(raw_han))
        sentence["reviewNeeded"] = bool(sentence.get("reviewNeeded") or ratio > 0.12)
        sentence["lengthDeltaRatio"] = round(ratio, 4)

    session = {
        "sessionId": args.session_id,
        "title": args.title,
        "audioUrl": args.video_url,
        "mediaType": "audio/mp3",
        "lastUpdated": date.today().isoformat(),
        "transcriptStatus": "review-ready",
        "alignmentStatus": "sampled",
        "tocMode": "discussion-questions",
        "discussionQuestions": questions,
        "paragraphs": make_paragraphs(sentences, questions),
        "_meta": {
            "sourceType": "youtube",
            "sourceVideoId": args.video_id,
            "sourceUrl": args.video_url,
            "sourceSha256": args.source_sha256,
            "durationSeconds": args.duration_seconds,
            "asrEngine": args.asr_engine,
            "rawAsrPreserved": True,
            "privateNameListCommitted": False,
            "audioAccess": "youtube-source-only",
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(session, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "sessionId": args.session_id,
        "sentences": len(sentences),
        "paragraphs": len(session["paragraphs"]),
        "questions": len(questions),
        "reviewNeeded": sum(1 for s in sentences if s["reviewNeeded"]),
    }))


if __name__ == "__main__":
    main()
