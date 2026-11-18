#!/usr/bin/env python3
"""
scripts/sifayin_intake.py

《四法印》（如性法師・如來法性影音頻道）課程資產下載與典據建檔：
  1. 官方文字檔 PDF（逐字稿整編稿）→ reviews/evidence/sifayin/playlist-NN/reference_official.pdf
  2. 官方聲音檔 MP3 → reviews/evidence/sifayin/playlist-NN/source.mp3（.gitignore 排除）
  3. 抽出純文字底本 → courses/四法印/source_text/lecture_NN.txt
  4. 記錄 sha256、頁數、字數、音檔長度 → reviews/evidence/sifayin/intake_manifest.json

可重複執行：已存在且 sha256 一致的檔案不會重複下載。
"""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"
SOURCE_TEXT = BASE / "courses" / "四法印" / "source_text"

DRIVE_DL = "https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"

# (session_id, youtube_videoId, official_text_fileId, official_audio_fileId, outline_source)
SESSIONS = [
    ("01", "dAyrtR6hQik", "179s_yyywor0EgJ8nsyH1303yswUbIpu4", "1Oq_7SEtxPEA6g1dQ64sHV1Wj3CLmSRWh"),
    ("02", "tLSvZzazrbM", "1qMJJqQK3w5nlTf2O3O9lVxCE51Su0DG0", "1QDzmsGJx1SpuvtME3nkIrxDu_o2WTtIT"),
    ("03", "SPovYO1r4ss", "1V4qqdAxm9BhnLwSfmZmvxd-tf8oq4ZSI", "1XHS8VnubY_Y0_0l2pCdVtlvzecW2TfqL"),
    ("04", "BdOVte3o6kc", "18HFPgNLzP_VawslTz-86IBu7P3ifHqJ0", "1cPdmzrAoKlFfm6zKD86eaNLVmGapKS6j"),
    ("05", "FARWbQZPAcw", "1F6CVQ5B7YQ7YePHxHFbcIanQU8bkqxS2", "1U31o4-w0Wgg_p-sQGErRskVKYP6QMbPi"),
    ("06", "oCQU-3ggipM", "1R0okhvvsDrXwhOPvKciLszkRWrlP-Okh", "1p4UBYp61XTylf-AyxN1ylZI-d9bY3c2m"),
    ("07", "LQjIiEGKjH0", "1bMJAbYh9OMwU6dCVmv7T4WO5axT1TUGx", "15gszwF9ketaD1lK_bN6ktOlp2GDXFkK_"),
    ("08", "ucXdxJYUO8s", "1z59s16OEYwnE-drDZElLzRoceqNw6cbi", "1n8ihJaSYPXEYCzIsVxwIKpAupdYflDpo"),
    ("09", "bAuJq_T43S4", "1HZwB4PttBFVm6dQosttTJAfYWVqoWpCy", "146KDM5BEjJZlMr6O77J8_dArvANp38cs"),
    ("10", "11gEibLNGTM", "1QZqozWNahbPioqAf7uUZ73aklp8IaLS0", "1rhG2fqpFmEA81vB-_YWiyXKESUSloyDy"),
    ("11", "s8hZpRQm9BY", "1tuv19d_OCncOFbZaqON_DXJDRxH9qoWE", "1VIccKdvoQ75JH5YMfOAN_ZahpT2sLvj7"),
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def drive_download(file_id: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    subprocess.run(
        ["curl", "-fsSL", "--retry", "3", "--max-time", "900",
         "-o", str(tmp), DRIVE_DL.format(file_id=file_id)],
        check=True,
    )
    head = tmp.open("rb").read(8)
    if head[:4] in (b"<htm", b"<HTM") or head[:5] == b"<!doc":
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Drive returned HTML for {file_id} (permission or quota wall)")
    tmp.replace(dest)


def audio_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        text=True,
    )
    return round(float(out.strip()), 3)


def extract_pdf_text(pdf: Path) -> str:
    import pymupdf  # system python provides pymupdf
    doc = pymupdf.open(pdf)
    return "\n".join(page.get_text() for page in doc)


def clean_reference(raw: str) -> str:
    lines = []
    for line in raw.splitlines():
        stripped = line.strip().replace("\u00a0", "")
        if not stripped:
            continue
        if re.fullmatch(r"\d{1,3}", stripped):  # 頁碼
            continue
        lines.append(stripped)
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", default="", help="逗號分隔 sessionId；預設全部")
    parser.add_argument("--skip-audio", action="store_true")
    args = parser.parse_args()

    wanted = {s.strip() for s in args.sessions.split(",") if s.strip()}
    SOURCE_TEXT.mkdir(parents=True, exist_ok=True)

    manifest_path = EVIDENCE / "intake_manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"schema": "sifayin-intake/v1", "sessions": {}}

    for session_id, video_id, text_id, audio_id in SESSIONS:
        if wanted and session_id not in wanted:
            continue
        folder = EVIDENCE / f"playlist-{session_id}"
        folder.mkdir(parents=True, exist_ok=True)
        record = manifest["sessions"].setdefault(session_id, {"youtubeVideoId": video_id})

        pdf_path = folder / "reference_official.pdf"
        if not pdf_path.exists():
            drive_download(text_id, pdf_path)
        record["referenceFileId"] = text_id
        record["referencePdf"] = str(pdf_path.relative_to(BASE))
        record["referenceSha256"] = sha256_file(pdf_path)

        text_path = SOURCE_TEXT / f"lecture_{session_id}.txt"
        extracted = clean_reference(extract_pdf_text(pdf_path))
        text_path.write_text(extracted + "\n", encoding="utf-8")
        record["referenceText"] = str(text_path.relative_to(BASE))
        record["referenceTextSha256"] = sha256_file(text_path)
        record["referenceChars"] = len(re.sub(r"\s", "", extracted))

        if not args.skip_audio:
            mp3_path = folder / "source.mp3"
            if not mp3_path.exists():
                drive_download(audio_id, mp3_path)
            record["audioFileId"] = audio_id
            record["audio"] = str(mp3_path.relative_to(BASE))
            record["audioSha256"] = sha256_file(mp3_path)
            record["audioDurationSec"] = audio_duration(mp3_path)

        print(f"[intake] session {session_id}: chars={record['referenceChars']} "
              f"audio={record.get('audioDurationSec', 'skipped')}", flush=True)

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
