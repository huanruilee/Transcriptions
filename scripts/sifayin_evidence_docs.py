#!/usr/bin/env python3
"""
scripts/sifayin_evidence_docs.py

從 intake manifest 產生《四法印》來源稽核文件：

  reviews/evidence/sifayin/reference/README.md
      官方整編逐字稿 PDF／純文字底本的 inventory（SHA-256、頁數、字數、取得時間）
  reviews/evidence/sifayin/reference/reference_inventory.json
      同一份資料的機可讀版本，供 grounding.json 與測試引用

來源都是 `sifayin_intake.py` 已落盤的檔案；本腳本只做彙整，不重新下載。
"""

import json
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
EVIDENCE = BASE / "reviews" / "evidence" / "sifayin"
REFERENCE_DIR = EVIDENCE / "reference"
MANIFEST = json.loads((EVIDENCE / "intake_manifest.json").read_text(encoding="utf-8"))

TITLE_HINTS = {}
INVENTORY_JSON = REFERENCE_DIR / "reference_inventory.json"
README = REFERENCE_DIR / "README.md"


def sha256_of(path: Path) -> str:
    import hashlib
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    sessions = MANIFEST["sessions"]
    entries = []
    for session_id in sorted(sessions):
        info = sessions[session_id]
        text_path = Path(info["referenceText"])
        pdf_path = Path(info["referencePdf"])
        entries.append({
            "referenceId": f"sifayin-official-transcript-{session_id}",
            "type": "edited-text-reference",
            "title": f"四法印 官方整編逐字稿 {session_id}",
            "session_id": f"session_{session_id}",
            "youtube_video_id": info["youtubeVideoId"],
            "source": "性法師（如來法性影音頻道）官方 YouTube 描述之 Google Drive 官方 PDF",
            "url": f"https://drive.usercontent.google.com/download?id={info['referenceFileId']}&export=download&confirm=t",
            "drive_file_id": info["referenceFileId"],
            "local_path": str(text_path),
            "pdf_local_path": str(pdf_path),
            "sha256": info["referenceTextSha256"],
            "pdf_sha256": info["referenceSha256"],
            "chars": info["referenceChars"],
            "retrieved_at": datetime.fromtimestamp(pdf_path.stat().st_mtime, tz=timezone.utc).isoformat(timespec="seconds"),
            "role": "官方整編定稿：作名相／引文校訂基準；時間碼一律以 ASR 為準",
        })

    REFERENCE_DIR.mkdir(parents=True, exist_ok=True)
    INVENTORY_JSON.write_text(json.dumps({
        "schema": "sifayin-reference-inventory/v1",
        "courseId": "si-fa-yin",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "references": entries,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# 四法印・官方來源底本 inventory",
        "",
        "來源：性法師「如來法性影音頻道」播放列表 `PLMngxNMnjFcPB4eYNHrOUdCgh__7hF2hl`",
        "每講 YouTube 描述均附官方整編逐字稿 PDF 與官方音檔（Google Drive 公開連結）。",
        "",
        "| 講次 | YouTube | 底本檔 | 字數 | 底本 SHA-256 | 音檔秒數 | 音檔 SHA-256 |",
        "|---|---|---|---:|---|---:|---|",
    ]
    for entry in entries:
        session_id = entry["session_id"].replace("session_", "")
        audio = sessions[session_id]
        lines.append(
            f"| {session_id} | `{entry['youtube_video_id']}` | `{entry['local_path']}` | {entry['chars']} | "
            f"`{entry['sha256'][:19]}…` | {audio['audioDurationSec']} | `{audio['audioSha256'][:19]}…` |"
        )
    lines += [
        "",
        "> 官方 PDF 與音檔屬大體積第三方素材，依 `.gitignore` 不入庫；",
        "> 這裡保存的是抽取後的純文字底本（入庫）、兩者 SHA-256，以及可重取的下載連結",
        "> （見 `reference_inventory.json` 的 `url` / `drive_file_id`）。",
        "",
        "使用規則：",
        "",
        "- 底本是**整編定稿**（口語有刪節、連接詞改寫），因此只作為名相與引文的校訂基準；",
        "  逐字稿正文仍以 ASR 轉寫為骨，時間碼一律來自 ASR。",
        "- 只有「同音／近音字替換」可由腳本自動套用（見 `scripts/sifayin_build_transcript.py` 的",
        "  `is_homophone_substitution`）；整編稿的口語刪節一律視為編輯差異，不改寫講者口語。",
        "- 開經偈／唱誦段與提綱時間碼需人工判讀，不自動作時間對齊。",
        "",
    ]
    README.write_text("\n".join(lines), encoding="utf-8")
    print(f"[evidence] references={len(entries)} -> {README.relative_to(BASE)}")


if __name__ == "__main__":
    main()
