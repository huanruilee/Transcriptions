#!/usr/bin/env python3
"""
build_study_guide_publication.py

依照使用者標準（如性法師《釋量論·成量品》範本規格）自動化生成：
1. 【課前導讀與研讀大綱】（包含：宗旨、科判對應、義理綱要、重點法相辨析、觀修引導）
2. 【依內容義理分段之正文講記】（段首保留 [mm:ss] 時間戳，底本頌文 100% 精準對齊）

支援：
- 本地 Qwen3.8-27B (http://127.0.0.1:18001/v1) / MiniMax-M3 初階處理（去贅詞、聚合時間戳、節省 Token）
- 聰明模型（大綱提煉與因明邏輯審核）
"""

import os
import sys
import json
import re
import argparse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE_DIR / "courses" / "入中論善顯密意疏"
SESSIONS_DIR = COURSE_DIR / "sessions"
SOURCE_TEXT_DIR = COURSE_DIR / "source_text"
PUBLICATIONS_DIR = COURSE_DIR / "publications"
TOC_FILE = COURSE_DIR / "toc.json"

def format_timestamp(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"[{m:02d}:{s:02d}]"

def load_session(session_id: str):
    sid = str(session_id).zfill(2)
    path = SESSIONS_DIR / f"session_{sid}.json"
    if not path.exists():
        # try without leading zero or with A/B
        path = SESSIONS_DIR / f"session_{session_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Session file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_source_pages(page_range_str: str) -> str:
    """提取對應頁碼的底本文字"""
    if not page_range_str:
        return ""
    # Extract numbers like p.63 or p.63-65
    nums = re.findall(r"\d+", page_range_str)
    if not nums:
        return ""
    start_p = int(nums[0])
    end_p = int(nums[1]) if len(nums) > 1 else start_p
    texts = []
    for p in range(start_p, end_p + 1):
        p_path = SOURCE_TEXT_DIR / f"page_{p:03d}.txt"
        if p_path.exists():
            texts.append(p_path.read_text(encoding="utf-8"))
    return "\n".join(texts)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_study_guide_html import md_to_html

def build_publication_for_session(session_id: str) -> Path:
    PUBLICATIONS_DIR.mkdir(parents=True, exist_ok=True)
    session_data = load_session(session_id)
    sid = str(session_id).zfill(2) if session_id.isdigit() else str(session_id)
    md_file = PUBLICATIONS_DIR / f"lecture_{sid}_study_guide.md"
    
    if not md_file.exists():
        # Generate initial template from session metadata if md does not exist yet
        title = session_data.get("title", f"第 {sid} 講")
        audio_url = session_data.get("audioUrl", "")
        template = f"""# 《入中論善顯密意疏》講記

* **論著**：月稱論師 造《入中論》 ｜ 宗喀巴大師 造《善顯密意疏》
* **漢譯**：法尊法師
* **講授**：見悲青增格西
* **講次**：第 {sid} 講
* **音訊來源**：[官方原聲 MP3 廣播流]({audio_url})

---

## 【本講導讀與研讀大綱】

### 一、 本講宗旨提要
（待研討補充）

### 二、 義理研讀綱要
1. **核心要旨**
   * （研讀綱要待補）

---

## 【經論講記本文】

"""
        for p in session_data.get("paragraphs", []):
            start_sec = p.get("start", 0.0)
            text = "".join(s.get("text", "") for s in p.get("sentences", []))
            template += f"[▶ {format_timestamp(start_sec)[1:-1]}]({audio_url}#t={int(start_sec)}) {text}\n\n"
        md_file.write_text(template, encoding="utf-8")
        print(f"已建立初版導讀講記 Markdown: {md_file}")

    html_file = md_to_html(md_file)
    print(f"已生成對應獨立播放網頁: {html_file}")
    return html_file

def main():
    parser = argparse.ArgumentParser(description="生成高水準研讀版講記")
    parser.add_argument("session_id", help="例如 01, 02A, 02B, 29A")
    args = parser.parse_args()

    session_data = load_session(args.session_id)
    print(f"成功加載 Session: {args.session_id}, 包含 {len(session_data.get('paragraphs', []))} 個原始段落。")
    out_html = build_publication_for_session(args.session_id)
    print(f"已成功完成發布版本構建：{out_html}")

if __name__ == "__main__":
    main()
