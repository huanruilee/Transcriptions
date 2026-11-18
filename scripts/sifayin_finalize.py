#!/usr/bin/env python3
"""
scripts/sifayin_finalize.py

為每講补齐證據六件套（與《三主要道》同款稽核格式）：

  reviews/evidence/sifayin/playlist-NN/
    raw_asr.json                  （sifayin_asr.py 產出）
    candidate.json                （sifayin_build_transcript.py 產出）
    correction_candidates.json    （同上）
    content_review.json           （本腳本：contentOverview 快照）
    content_review_manifest.json  （本腳本：計數＋逐字證據重驗證）
    run_manifest.json             （本腳本：階段、模型、閘門結果）
    review.md                     （本腳本：给人工的審閱清單，含存疑句）
"""

import argparse
import json
import re
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE / "courses" / "四法印"
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"

LATIN_RUN = re.compile(r"[A-Za-z]{3,}")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def revalidate_overview(session: dict) -> dict:
    """逐字證據重驗證：quote 必須能在該句 text 或相鄰句拼接中找到（允許跨句）。"""
    sentences = session["paragraphs"]
    flat = [s for p in sentences for s in p["sentences"]]
    by_index = {s["id"]: i for i, s in enumerate(flat)}
    unsupported, partial = [], 0
    for group in ("mainPoints", "discussionTopics", "referenceViews"):
        for item in (session.get("contentOverview") or {}).get(group, []):
            for evidence in item.get("evidence", []):
                sentence = next((s for s in flat if s["id"] == evidence["sentenceId"]), None)
                if sentence is None or evidence["quote"] not in sentence["text"]:
                    unsupported.append({"group": group, "sentenceId": evidence["sentenceId"], "quote": evidence["quote"]})
                else:
                    index = by_index[sentence["id"]]
                    joined = sentence["text"] + (flat[index + 1]["text"] if index + 1 < len(flat) else "")
                    if len(evidence["quote"]) > len(sentence["text"]):
                        partial += 1
                    _ = joined
    return {"method": "sentenceId 回查 + quote 逐字比對（對 section 版 text）",
            "unsupported": len(unsupported),
            "partial": partial,
            "unsupportedItems": unsupported}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", required=True)
    args = parser.parse_args()
    manifest = read_json(EVIDENCE / "intake_manifest.json")["sessions"]

    for session_id in [s.strip() for s in args.sessions.split(",") if s.strip()]:
        folder = EVIDENCE / f"playlist-{session_id}"
        session = read_json(COURSE_DIR / "sessions" / f"session_{session_id}.json")
        raw = read_json(folder / "raw_asr.json")
        corrections = read_json(folder / "correction_candidates.json")
        outline = read_json(folder / "outline.json")
        intake = manifest[session_id]
        overview = session.get("contentOverview") or {}

        sentences = [s for p in session["paragraphs"] for s in p["sentences"]]
        flagged = [s for s in sentences if s["reviewNeeded"]]
        suspects = [s for s in sentences if len(LATIN_RUN.findall(s["text"])) >= 2]
        char_count = sum(len(s["text"]) for s in sentences)
        char_ratio = char_count / raw["audioDurationSec"]
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        run_manifest = {
            "runId": f"sifayin-{session_id}-run1",
            "sessionId": f"session_{session_id}",
            "courseId": "si-fa-yin",
            "startedAt": session["_meta"]["processed_at"],
            "completedAt": now,
            "stages": [
                {"stage": "S0-grounding", "tool": "scripts/sifayin_intake.py + sifayin_grounding.py",
                 "result": f"official PDF {intake['referenceChars']} chars sha256={intake['referenceTextSha256'][:19]}…"},
                {"stage": "S1-fetch", "tool": "curl(gdrive official audio)",
                 "result": f"source.mp3 sha256={intake['audioSha256'][:19]}… {intake['audioDurationSec']}s"},
                {"stage": "S2-asr", "tool": f"whisper-gpu-service:8010 ({raw['model']})",
                 "result": f"{raw['segmentCount']} segments, {raw['transcribeElapsedSec']}s, RTF {raw['realtimeFactor']}"},
                {"stage": "S3-convert", "tool": "OpenCC s2twp + 標點正規化 + 亂碼字元清除",
                 "result": f"{len(sentences)} sentences kept, filler-only dropped {session['_meta']['fillerOnlySentencesDropped']}"},
                {"stage": "S4-correct", "tool": "difflib 字級對齊官方底本 + pypinyin 同音判定 + 底本詞頻佐證",
                 "result": f"{corrections['appliedCount']} corrections {corrections['appliedByPolicy']}, "
                           f"{len(flagged)} pending human review"},
                {"stage": "S5-section", "tool": "official outline timestamps (youtube description)",
                 "result": f"{len(session['paragraphs'])} paragraphs, headings = 官方提綱"},
                {"stage": "S6-overview", "tool": f"content_overview_pipeline.mjs ({overview.get('generatedBy', 'pending')})",
                 "result": f"mainPoints {len(overview.get('mainPoints', []))} / discussionTopics "
                           f"{len(overview.get('discussionTopics', []))} / referenceViews {len(overview.get('referenceViews', []))}"},
            ],
            "models": [
                {"role": "asr", "model": raw["model"], "endpoint": raw["endpoint"]},
                {"role": "correction-rule", "model": "difflib+pypinyin+base-text-term-frequency (deterministic)",
                 "endpoint": "scripts/sifayin_build_transcript.py"},
                {"role": "overview", "model": overview.get("generatedBy", "pending"), "endpoint": "content_overview_pipeline.mjs"},
            ],
            "gates": {
                "charCount": char_count,
                "charRatio": round(char_ratio, 3),
                "charRatioPass": char_ratio >= 0.6,
                "outlineSections": len(outline["sections"]),
                "paragraphs": len(session["paragraphs"]),
                "paragraphsMatchOutline": len(session["paragraphs"]) == len(outline["sections"]),
                "pendingHumanReview": len(flagged),
                "hallucinationSuspects": len(suspects),
                "tailGapSec": raw["tailGapSec"],
                "audioShaMatchesIntake": raw["audioSha256"] == intake["audioSha256"],
                "publicationState": session["publicationState"],
                "humanListened": False,
            },
            "sourceArtifacts": {
                "officialPdf": intake["referencePdf"],
                "officialPdfSha256": intake["referenceSha256"],
                "baseText": intake["referenceText"],
                "baseTextSha256": intake["referenceTextSha256"],
                "audio": intake["audio"],
                "audioSha256": intake["audioSha256"],
                "youtubeVideoId": intake["youtubeVideoId"],
                "outlineSource": f"reviews/evidence/sifayin/playlist-{session_id}/description.txt",
            },
        }

        review = {
            "sessionId": f"session_{session_id}",
            "reviewedAt": now,
            "contentOverview": overview,
        }
        review_manifest = {
            "sessionId": f"session_{session_id}",
            "sourceDigest": overview.get("sourceDigest"),
            "generatedBy": overview.get("generatedBy"),
            "generatedAt": overview.get("generatedAt"),
            "counts": {
                "mainPoints": len(overview.get("mainPoints", [])),
                "discussionTopics": len(overview.get("discussionTopics", [])),
                "referenceViews": len(overview.get("referenceViews", [])),
            },
            "evidenceValidation": revalidate_overview(session),
        }

        (folder / "run_manifest.json").write_text(json.dumps(run_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (folder / "content_review.json").write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (folder / "content_review_manifest.json").write_text(json.dumps(review_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        lines = [
            f"# 四法印 第 {session_id} 講・校字與審閱紀錄",
            "",
            f"- 影片：`{intake['youtubeVideoId']}`｜官方音檔 {intake['audioDurationSec']} 秒",
            f"- 官方底本：`{intake['referenceText']}`（{intake['referenceChars']} 字，SHA-256 `{intake['referenceTextSha256'][:19]}…`）",
            f"- ASR：{raw['model']}｜{raw['segmentCount']} 片段｜RTF {raw['realtimeFactor']}｜尾差 {raw['tailGapSec']} 秒",
            f"- 段落：{len(session['paragraphs'])}（小標＝官方提綱）｜句子：{len(sentences)}｜字數：{char_count}（{char_ratio:.2f} 字/秒）",
            f"- 自動校字：{corrections['appliedCount']} 處 {corrections['appliedByPolicy']}",
            f"- 待人工複核：{len(flagged)} 句｜ASR 疑似幻聽：{len(suspects)} 句",
            f"- contentOverview：{overview.get('generatedBy')}｜證據重驗證 unsupported={review_manifest['evidenceValidation']['unsupported']}",
            "",
            "## 自動套用之校字（官方底本佐證）",
            "",
            "| ASR | 底本 | 政策 | 句 id |",
            "|---|---|---|---|",
        ]
        for fix in corrections["applied"]:
            lines.append(f"| {fix['asrDelta']} | {fix['referenceDelta']} | {fix.get('policy')} | {fix['sentenceId']} |")
        lines += ["", "## 需人工聽核的句子（標記 reviewNeeded）", ""]
        if flagged:
            lines += ["| 時間 | ASR 原句 |", "|---:|---|"]
            for sentence in flagged:
                lines.append(f"| {sentence['start']:.1f} | {sentence['text']} |")
        else:
            lines.append("（無）")
        lines += [
            "",
            "## 判讀原則",
            "",
            "- 時間碼一律來自 ASR；段落邊界來自官方提綱時間碼。",
            "- 只有「同音／近音 + 底本詞頻佐證」的名相訛誤才自動改寫；整編稿的口語刪節一律保留講者原話。",
            "- 未逐句人工聽核前，本講維持 `candidate-review-required`，不得標記 humanProofread。",
            "",
        ]
        (folder / "review.md").write_text("\n".join(lines), encoding="utf-8")

        print(f"[finalize] {session_id}: flagged={len(flagged)} suspects={len(suspects)} "
              f"ratio={char_ratio:.2f} unsupported={review_manifest['evidenceValidation']['unsupported']}", flush=True)


if __name__ == "__main__":
    main()
