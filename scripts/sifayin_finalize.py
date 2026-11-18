#!/usr/bin/env python3
"""四法印：每講稽核紀錄（run_manifest.json ＋ review.md）。

沿用 `reviews/evidence/sanzhuyaodao/playlist-NN/` 的證據格式，但如實反映
四法印的路徑差異：有講師官方整編逐字稿與官方提綱，校字採可稽核的
同音／近音名相規則，而不是模型自由改寫。

用法：python3 scripts/sifayin_finalize.py [--sessions 01,02,...]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"
COURSE = BASE / "courses" / "四法印"

ASR_MODEL = "faster-whisper-large-v3-turbo"
ALIGN_RULE = "python-difflib 對齊官方整編稿＋同音/近音名相規則（scripts/sifayin_build_transcript.py）"
OVERVIEW_MODEL = "eNeural glm53-flash（生成＋獨立證據審查）"
ALLOWED_UNRESOLVED_NOTES = {
    "editorial-divergence", "punctuation-gap", "unattested-homophone", "orthographic-variant",
}


def sha256_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def text_of(session: dict) -> str:
    return "\n".join(p["text"] for p in session["paragraphs"])


def session_ids(args: str) -> list[str]:
    if args.strip():
        return [a.strip() for a in args.split(",") if a.strip()]
    return sorted(p.name.replace("session_", "").replace(".json", "")
                  for p in (COURSE / "sessions").glob("session_*.json"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", default="")
    args = ap.parse_args()

    intake = load(EVIDENCE / "intake_manifest.json")["sessions"]
    for sid in session_ids(args.sessions):
        folder = EVIDENCE / f"playlist-{sid}"
        review_manifest_path = folder / "content_review_manifest.json"
        if not review_manifest_path.exists():
            print(f"[finalize] {sid}: 缺 content_review_manifest.json（先跑 content overview）",
                  file=sys.stderr)
            continue
        raw = load(folder / "raw_asr.json")
        candidate = load(folder / "candidate.json")
        corrections = load(folder / "correction_candidates.json")
        outline = load(folder / "outline.json")
        session = load(COURSE / "sessions" / f"session_{sid}.json")
        review_manifest = load(review_manifest_path)
        rec = intake[sid]

        final_chars = len(re.sub(r"\s", "", text_of(session)))
        char_ratio = round(final_chars / raw["charCount"], 4)

        notes: dict[str, int] = {}
        for item in corrections["unresolved"]:
            note = item.get("note") or "unspecified"
            notes[note] = notes.get(note, 0) + 1
        unknown_notes = sorted(set(notes) - ALLOWED_UNRESOLVED_NOTES)
        pending_review = notes.get("unattested-homophone", 0) + notes.get("unspecified", 0) \
            + sum(1 for item in corrections["unresolved"] if item.get("reviewNeeded"))

        evidence = review_manifest["evidenceValidation"]
        counts = review_manifest["counts"]
        evidence_total = sum(counts.values())
        unsupported = evidence.get("unsupported", 0) + evidence.get("partial", 0)

        payload = {
            "runId": f"si-fa-yin-{int(sid)}-run1",
            "sessionId": f"session_{sid}",
            "courseId": "si-fa-yin",
            "startedAt": raw.get("processedAt") or session["lastUpdated"],
            "completedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "stages": [
                {"stage": "S1-fetch", "tool": "curl(drive)",
                 "result": f"source.mp3 sha256={rec['audioSha256'][7:23]}… "
                           f"{rec['audioDurationSec']}s；官方 PDF sha256={rec['referenceSha256'][7:23]}…"},
                {"stage": "S2-asr", "tool": "whisper-gpu-service:8010",
                 "result": f"{raw['segmentCount']} segments, {raw['charCount']} chars, "
                           f"RTF={raw['realtimeFactor']}, tailGap={raw['tailGapSec']}s"},
                {"stage": "S3-align", "tool": "difflib char-level alignment vs 官方整編稿",
                 "result": f"{len(corrections['applied'])} auto fixes, "
                           f"{len(corrections['unresolved'])} documented divergences"},
                {"stage": "S4-correct", "tool": ALIGN_RULE,
                 "result": json.dumps(corrections["appliedByPolicy"], ensure_ascii=False)},
                {"stage": "S5-section", "tool": "official outline timestamps",
                 "result": f"{len(session['paragraphs'])} paragraphs"},
                {"stage": "S6-overview", "tool": OVERVIEW_MODEL,
                 "result": json.dumps(counts, ensure_ascii=False)},
            ],
            "models": [
                {"role": "asr", "model": ASR_MODEL, "endpoint": "127.0.0.1:8010"},
                {"role": "correction-rule", "model": "deterministic-python",
                 "endpoint": "scripts/sifayin_build_transcript.py",
                 "policy": corrections["correctionPolicy"]},
                {"role": "overview", "model": "glm53-flash", "endpoint": "agents.eneural.ai"},
            ],
            "gates": {
                "charRatio": char_ratio,
                "charRatioThreshold": 0.6,
                "charRatioPass": char_ratio >= 0.6,
                "audioShaMatchesIntake": raw["audioSha256"] == rec["audioSha256"],
                "tailGapSec": raw["tailGapSec"],
                "paragraphs": len(session["paragraphs"]),
                "outlineItems": len(outline["sections"]),
                "paragraphsMatchOutline": len(session["paragraphs"]) == len(outline["sections"]),
                "pendingHumanReview": pending_review,
                "unresolvedNotes": notes,
                "unknownUnresolvedNotes": unknown_notes,
                "overviewEvidenceTotal": evidence_total,
                "overviewUnsupported": unsupported,
                "overviewPass": unsupported == 0,
                "humanListened": False,
                "publicationState": session["publicationState"],
            },
            "artifacts": {
                "rawAsr": sha256_file(folder / "raw_asr.json"),
                "candidate": sha256_file(folder / "candidate.json"),
                "correctionCandidates": sha256_file(folder / "correction_candidates.json"),
                "outline": sha256_file(folder / "outline.json"),
                "contentReview": sha256_file(folder / "content_review.json"),
                "contentReviewManifest": sha256_file(review_manifest_path),
                "finalSession": sha256_file(COURSE / "sessions" / f"session_{sid}.json"),
                "baseText": sha256_file(BASE / rec["referenceText"]),
            },
        }
        (folder / "run_manifest.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        applied = corrections["applied"]
        review_needed = [item for item in corrections["unresolved"]
                         if item.get("note") == "unattested-homophone" or item.get("reviewNeeded")]
        lines = [
            f"# 四法印 第{int(sid)}講 稽核紀錄（{candidate['title']}）",
            "",
            f"- 影片：{rec['youtubeVideoId']}（https://www.youtube.com/watch?v={rec['youtubeVideoId']}）",
            f"- 音檔：講師官方 MP3，{rec['audioDurationSec']} 秒，{rec['audioSha256']}",
            f"- 底本：講師官方整編逐字稿 PDF（{rec['referenceSha256']}），"
            f"抽取文字 {rec['referenceChars']} 字（{rec['referenceText']}）",
            f"- ASR：{ASR_MODEL}，{raw['segmentCount']} 段 / {raw['charCount']} 字，"
            f"RTF {raw['realtimeFactor']}，尾差 {raw['tailGapSec']} 秒",
            f"- 對校：官方提綱 {len(outline['sections'])} 段全部成為段落邊界；"
            f"自動校字 {len(applied)} 處；記錄差異 {len(corrections['unresolved'])} 處"
            f"（{json.dumps(notes, ensure_ascii=False)}）",
            f"- 摘要：glm53-flash 生成＋獨立證據審查，{json.dumps(counts, ensure_ascii=False)}，"
            f"逐字回查不通過 {unsupported} 條",
            f"- 狀態：{session['publicationState']}（尚未逐句人工聽核）",
            "",
            "## 自動套用之校字（僅同音／近音名相，保留 ASR 口語）",
            "",
        ]
        if applied:
            lines += ["| sentenceId | ASR | 底本 | 規則 | 句相似度 |", "|---|---|---|---|---|"]
            for item in applied:
                lines.append(f"| {item['sentenceId']} | {item['asrDelta']} | {item['referenceDelta']} "
                             f"| {item['policy']} | {item['sentenceSimilarity']} |")
        else:
            lines.append("（無）")
        lines += ["", "## 需人工聽核的句子（同音但無詞頻佐證等語意疑義）", ""]
        if review_needed:
            lines += ["| sentenceId | ASR | 底本 | 原因 |", "|---|---|---|---|"]
            for item in review_needed[:60]:
                lines.append(f"| {item['sentenceId']} | {item['asrDelta']} | {item['referenceDelta']} "
                             f"| {item.get('note', '')} |")
        else:
            lines.append("（無）")
        lines += ["", f"- 整段口語刪節／改寫（editorial-divergence）共 {notes.get('editorial-divergence', 0)} 處、"
                      f"標點差異 {notes.get('punctuation-gap', 0)} 處、正寫法差異 "
                      f"{notes.get('orthographic-variant', 0)} 處：一律保留 ASR 原樣，"
                      "完整清單見 `correction_candidates.json`。", ""]
        (folder / "review.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"[finalize] {sid}: paragraphs={len(session['paragraphs'])}/"
              f"{len(outline['sections'])}, ratio={char_ratio}, applied={len(applied)}, "
              f"pending={pending_review}, overviewUnsupported={unsupported}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
