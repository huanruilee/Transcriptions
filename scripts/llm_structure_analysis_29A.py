#!/usr/bin/env python3
"""
llm_structure_analysis_29A.py - Uses GX10 local Qwen3.8-27B to analyze the complete lecture
transcript of Session 29A, determine Buddhist commentary section boundaries, and generate
thematic subheadings based on meaning.
"""
import sys
import os
import json
import re
import requests
from pathlib import Path

LLM_URL = "http://192.168.122.1:8001/v1/chat/completions"

SYSTEM_PROMPT = """你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與月稱菩薩《入中論》的佛學專家。
當前任務是對法師第 29A 堂錄音逐字稿（p.97 觀待世間釋彼差別）進行「文義結構分析與小標題劃分」。

【分析原則】：
1. 依據法師開示的思維脈絡與佛學科判轉折，將全篇內容切分為 6～10 個重點主題章節（小標題）。
2. 小標題需具備高度佛學專業性、清晰精鍊，符合《善顯密意疏》論義（如：【科判導讀】、【宗派辨析：自續 vs 應成】、【外損害因：陽焰/幻術/咒術/旋火輪】、【內損害因：眩翳/飛蚊症/膽熱】、【世間名言正倒分齊】、【勝義中觀正理抉擇】、【隨堂答疑與總結】等）。
3. 輸出必須為標準 JSON 格式，標明每個小標題的起始段落 ID（例如 "p-1", "p-18" 等）與小標題名稱。

輸出 JSON 格式示例：
```json
[
  {
    "start_paragraph_id": "p-1",
    "heading": "【科判導讀】觀待世間釋世俗差別與所知二諦建立（p.97）",
    "summary": "確認論典頁碼（p.97），科判引導，建立勝義諦（不欺誑）與世俗諦（欺誑）二諦基本定義。"
  },
  ...
]
```
"""

def main():
    json_path = Path("courses/入中論善顯密意疏/sessions/session_29A.json")
    if not json_path.exists():
        print(f"File not found: {json_path}")
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Prepare condensed paragraph overview for LLM
    para_digest = []
    for p in data["paragraphs"]:
        full_p_text = "".join(s["text"] for s in p["sentences"])
        # First 60 chars of each paragraph as overview
        para_digest.append(f"{p['id']} (start: {p['start']:.1f}s): {full_p_text[:70]}...")

    prompt = f"以下是第 29A 堂共 {len(data['paragraphs'])} 個段落的時間與開頭摘要。請詳細分析文義轉折，劃分 6~10 個小標題，並回傳 JSON 陣列：\n\n" + "\n".join(para_digest)

    payload = {
        "model": "Qwen3.8-27B",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "chat_template_kwargs": {"enable_thinking": False}
    }

    print("\n=======================================================")
    print("🧠 CALLING GX10 LOCAL QWEN3.8-27B FOR STRUCTURAL & THEMATIC ANALYSIS")
    print("=======================================================")

    r = requests.post(LLM_URL, json=payload, timeout=120)
    r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"]
    print("LLM Response:\n", content)

    # Extract JSON
    match = re.search(r'\[\s*\{.*\}\s*\]', content, re.DOTALL)
    if not match:
        print("❌ Failed to parse JSON from LLM response.")
        sys.exit(1)

    sections = json.loads(match.group(0))
    print(f"\n🎉 Identified {len(sections)} semantic sections from Qwen3.8-27B!")

    # Create mapping of paragraph_id -> heading
    heading_map = {item["start_paragraph_id"]: item["heading"] for item in sections}

    # Apply to data
    for p in data["paragraphs"]:
        p.pop("heading", None)
        if p["id"] in heading_map:
            p["heading"] = heading_map[p["id"]]

    data["_meta"]["llm_sections"] = sections

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("🎉 Successfully applied Qwen3.8-27B semantic headings into session_29A.json!")

if __name__ == "__main__":
    main()
