#!/usr/bin/env python3
"""Assemble the 27B study-group prototype from reviewed candidate artifacts."""

import argparse
import json
import re
from pathlib import Path


COURSE_ID = "shi-liang-lun-study-group-2025"
COURSE_TITLE = "2025《釋量論・第二品》大組共學"
DRIVE_FILE_ID = "1H_w9wP0Gi7zpXKO8NVO95Zvm2Iy5N6Wq"
DRIVE_URL = f"https://drive.usercontent.google.com/download?id={DRIVE_FILE_ID}&export=open"
AUDIO_URL = "https://gx10-2887.tail378c21.ts.net:9443/audio/shi-liang-lun-study-group-2025/27B.mp3"


def apply_review_fixes(sentences, questions):
    replacements = {
        "依緣假立": "依蘊假立",
        "而食嗔恚苦": "爾時增益苦",
        "解脫的自信": "解脫的自性",
        "體性相異": "反體相異",
    }
    for sentence in sentences:
        for source, target in replacements.items():
            sentence["text"] = sentence["text"].replace(source, target)
        raw_han = re.sub(r"[^\u4e00-\u9fff]", "", sentence["rawText"])
        text_han = re.sub(r"[^\u4e00-\u9fff]", "", sentence["text"])
        length_ratio = abs(len(raw_han) - len(text_han)) / max(1, len(raw_han))
        sentence["reviewNeeded"] = bool(sentence.get("reviewNeeded") or length_ratio > 0.12)
        sentence["lengthDeltaRatio"] = round(length_ratio, 4)

    q1 = questions[0]
    q1["rawQuestion"] = q1["rawQuestion"].replace("依緣假立", "依蘊假立")
    q1["displayQuestion"] = q1["displayQuestion"].replace("依緣假立", "依蘊假立")
    questions[1]["teacherTeaching"]["endSentenceId"] = "sent-0258"
    questions[1]["evidenceNote"] = "法師於 sent-0210 開始開示，結語延伸至 sent-0258 前段。"
    questions[2]["rawQuestion"] = (
        "針對偈頌「若未壞我貪，彼當受逼惱；爾時增益苦，不能住自性」，"
        "受苦者是存在的我，還是不存在的我？為何說把實際上不存在的我增益為有我？"
    )
    questions[2]["displayQuestion"] = questions[2]["rawQuestion"]
    questions[2]["evidenceNote"] = (
        "題目於 sent-0262 至 sent-0263 念出；引文依《釋量論》第二品第 192–193 頌校正。"
    )
    questions[3]["rawQuestion"] = questions[3]["rawQuestion"].replace("解脫的自信", "解脫的自性")
    questions[3]["displayQuestion"] = questions[3]["displayQuestion"].replace("解脫的自信", "解脫的自性")
    return sentences, questions


def make_paragraphs(sentences, questions, size=4):
    question_starts = {q["sentenceId"]: q for q in questions}
    teaching_ends = {q["teacherTeaching"]["endSentenceId"]: q for q in questions}
    paragraphs = []
    active_question = None
    current = []
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
            "reviewNeeded": sentence["reviewNeeded"],
        })
        if len(current) >= size or sentence["id"] in teaching_ends:
            flush()
    flush()
    return paragraphs


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--units", type=Path, required=True)
    parser.add_argument("--questions", type=Path, required=True)
    parser.add_argument("--course-dir", type=Path, required=True)
    args = parser.parse_args()

    units = json.loads(args.units.read_text())
    questions = json.loads(args.questions.read_text())
    sentences, questions = apply_review_fixes(units["sentences"], questions)
    paragraphs = make_paragraphs(sentences, questions)

    session = {
        "sessionId": "27B",
        "title": "第 27 講（下）大組共學",
        "audioUrl": AUDIO_URL,
        "mediaType": "audio/mp3",
        "lastUpdated": "2026-09-10",
        "transcriptStatus": "review-ready",
        "alignmentStatus": "sampled",
        "tocMode": "discussion-questions",
        "discussionQuestions": questions,
        "paragraphs": paragraphs,
        "_meta": {
            "sourceFileId": DRIVE_FILE_ID,
            "sourceSha256": "7a608caa1128026cd89829a152f10e743c86034c1ea9e40cedba9e1d6a706ada",
            "durationSeconds": 10202.544,
            "rawAsrPreserved": True,
            "privateNameListCommitted": False,
        },
    }
    course = {
        "courseId": COURSE_ID,
        "title": COURSE_TITLE,
        "master": "大組共學",
        "description": "依討論問題研讀《釋量論・第二品》，每題附法師開示摘要。",
        "tocMode": "discussion-questions",
        "sessions": [{
            "sessionId": "27B",
            "id": "27B",
            "sessionNum": 27,
            "subSession": "B",
            "periodLabel": "下",
            "title": "第 27 講（下）大組共學",
            "status": "review-ready",
            "audioUrl": AUDIO_URL,
        }],
    }
    toc = {
        "courseId": COURSE_ID,
        "tocMode": "discussion-questions",
        "nodes": [{
            "id": q["id"],
            "title": q["displayQuestion"],
            "sessionId": "27B",
            "sessionIds": ["27B"],
            "timestamp": q["start"],
        } for q in questions],
    }
    audio_map = {
        "27B": {
            "source": "google-drive",
            "fileId": DRIVE_FILE_ID,
            "sourceUrl": DRIVE_URL,
            "url": AUDIO_URL,
            "proxy": "gx10",
            "accessScope": "tailnet",
            "temporaryDownloadOnly": True,
        }
    }
    write_json(args.course_dir / "sessions/session_27B.json", session)
    write_json(args.course_dir / "course.json", course)
    write_json(args.course_dir / "toc.json", toc)
    write_json(args.course_dir / "audio_map.json", audio_map)


if __name__ == "__main__":
    main()
