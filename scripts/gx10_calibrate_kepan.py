#!/usr/bin/env python3
"""
scripts/gx10_calibrate_kepan.py

Orchestration and calibration engine for 《入中論善顯密意疏》.
Leverages GX10 local Qwen3.8-27B (via SSH tunnel on port 18001 or direct vLLM port 8001)
to perform grounded semantic alignment between:
1. Source treatise text (source_text/page_XXX.txt)
2. Lecture transcript (sessions/session_XXX.json)
3. Table of Contents (toc.json)
4. Course Manifest (course.json)
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent
COURSE_DIR = ROOT / "courses" / "入中論善顯密意疏"
SOURCE_DIR = COURSE_DIR / "source_text"
SESSIONS_DIR = COURSE_DIR / "sessions"
TOC_FILE = COURSE_DIR / "toc.json"
COURSE_FILE = COURSE_DIR / "course.json"

DEFAULT_ENDPOINTS = [
    "http://127.0.0.1:18001/v1",       # Local Mac SSH tunnel
    "http://192.168.122.1:8001/v1",     # Direct on GX10 host
    "http://127.0.0.1:8001/v1",         # Direct local on GX10
]

def get_active_endpoint():
    for ep in DEFAULT_ENDPOINTS:
        try:
            req = urllib.request.Request(f"{ep}/models", method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    return ep
        except Exception:
            continue
    raise RuntimeError(
        "Cannot connect to GX10 Qwen3.8-27B endpoint. "
        "Please ensure the SSH tunnel is active (ssh -f -N -L 18001:192.168.122.1:8001 gx10) "
        "or that vLLM is running on port 8001."
    )

def query_llm(endpoint, system_prompt, user_prompt, temperature=0.1, max_tokens=3000):
    payload = {
        "model": "Qwen3.8-27B",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "chat_template_kwargs": {"enable_thinking": False}
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{endpoint}/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        return result["choices"][0]["message"]["content"]

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

def extract_source_context(page_num, window=2):
    pages_text = []
    start_p = max(1, page_num - window)
    end_p = min(285, page_num + window)
    for p in range(start_p, end_p + 1):
        p_file = SOURCE_DIR / f"page_{p:03d}.txt"
        if p_file.exists():
            pages_text.append(f"=== 第 {p} 頁 ===\n" + p_file.read_text(encoding="utf-8"))
    return "\n\n".join(pages_text), start_p, end_p

def analyze_session(session_id, endpoint, dry_run=False):
    print(f"\n=======================================================")
    print(f"🔍 Analyzing Session {session_id} using GX10 Qwen3.8-27B")
    print(f"=======================================================")

    session_file = SESSIONS_DIR / f"session_{session_id}.json"
    if not session_file.exists():
        raise FileNotFoundError(f"Session file not found: {session_file}")

    course_data = load_json(COURSE_FILE)
    session_meta = next((s for s in course_data["sessions"] if s["sessionId"] == session_id), None)
    if not session_meta:
        raise ValueError(f"Session {session_id} not found in course.json")

    page_range = session_meta.get("pageRange", "p.1")
    p_match = re.search(r"\d+", page_range)
    page_num = int(p_match.group(0)) if p_match else 1

    source_context, start_p, end_p = extract_source_context(page_num, window=2)
    session_data = load_json(session_file)

    paragraphs = session_data.get("paragraphs", [])
    transcript_samples = []
    for idx, p in enumerate(paragraphs):
        p_id = p.get("id", f"p_{idx+1}")
        sents = p.get("sentences", [])
        if not sents:
            continue
        start_ts = sents[0].get("start", 0)
        full_p_text = "".join(s.get("text", "") for s in sents)
        transcript_samples.append({
            "idx": idx,
            "id": p_id,
            "start": round(start_ts, 2),
            "preview": full_p_text[:140]
        })

    # Sample representative paragraphs across the session (up to 80 paragraphs)
    step = max(1, len(transcript_samples) // 60)
    selected_samples = transcript_samples[::step]
    if transcript_samples[-1] not in selected_samples:
        selected_samples.append(transcript_samples[-1])

    transcript_summary_str = "\n".join(
        f"[{p['id']} | {int(p['start']//60):02d}:{int(p['start']%60):02d} | {p['start']}s] {p['preview']}..."
        for p in selected_samples
    )

    system_prompt = """你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與月稱菩薩《入中論》的佛學專家與校對主編。
你的任務是依據法師（見悲青增格西）當堂錄音逐字稿與論疏底本，進行精確的「科判對齊、小標題劃分與講次摘要」。

【校對標準與格式規範】：
1. 【小標題切分】：
   - 將全篇講記切分為 6～10 個核心段落大綱。
   - 每個小標題必須符合 Buddhist transcription toolkit 規範格式：`【類別】說明`。
   - 類別僅限於：【科判導讀】、【經論引證】、【名相辨析】、【正理抉擇】、【格西要旨】、【中觀釋難】、【研讀總結】、【法義迴向】。
   - 必須精確錨定在法師轉換論題的段落 ID（如 "p_1", "p_53" 等）與時間戳。
   - 嚴禁超前給出後續卷冊或尚未講到之科判！

2. 【科判對齊 (TOC Mapping)】：
   - 找出本堂課法師所講述的宗大師科判節點（例如：申三、別釋二諦體 > 酉一、釋世俗諦 > 戌一、明於何世俗前為諦何前不諦 > 亥一、正義）。
   - 給出切入該科判節點的時間戳（秒數）。

3. 【課程摘要 (Summary)】：
   - 一句精鍊的繁體中文課程綱要，格式如：「酉一 釋世俗諦 ・ 戌一 明於何世俗前為諦何前不諦（亥一 正義）與影像谷響喻」。

【輸出格式】：
必須嚴格輸出純 JSON 物件，不得包含 markdown 標籤或任何前導文字：
{
  "activeKepanNodes": [
    {
      "nodeTitle": "完整科判名稱（如：戌一、明於何世俗前為諦何前不諦）",
      "timestamp": 18,
      "page": 100
    }
  ],
  "headings": [
    {
      "paragraphId": "p_1",
      "timestamp": 0.5,
      "heading": "【類別】說明文字"
    }
  ],
  "summary": "一句話講次精要"
}"""

    user_prompt = f"""請依據以下《入中論善顯密意疏》底本參考原文（第 {start_p}～{end_p} 頁）以及第 {session_id} 講逐字稿段落清單，輸出標準 JSON 分析結果：

【底本參考原文（第 {start_p}～{end_p} 頁）】：
---
{source_context}
---

【第 {session_id} 講逐字稿段落代表清單（共選取 {len(selected_samples)} 段）】：
---
{transcript_summary_str}
---
"""

    print("🤖 Calling Qwen3.8-27B on GX10...")
    raw_response = query_llm(endpoint, system_prompt, user_prompt, temperature=0.1)

    # Clean JSON
    json_match = re.search(r"\{.*\}", raw_response, re.DOTALL)
    if not json_match:
        raise ValueError(f"Failed to parse JSON from LLM output:\n{raw_response}")

    analysis = json.loads(json_match.group(0))

    print(f"\n📊 [Analysis Result for {session_id}]")
    print(f"• Summary: {analysis.get('summary')}")
    print(f"• Active Kepan Nodes: {len(analysis.get('activeKepanNodes', []))}")
    for n in analysis.get("activeKepanNodes", []):
        print(f"  - {n.get('nodeTitle')} (ts: {n.get('timestamp')}s, p.{n.get('page')})")
    print(f"• Headings: {len(analysis.get('headings', []))}")
    for h in analysis.get("headings", []):
        print(f"  - [{h.get('paragraphId')} | {h.get('timestamp')}s] {h.get('heading')}")

    if dry_run:
        print("\n[Dry Run] Changes not written to disk.")
        return analysis

    # Apply updates
    # 1. Update session json headings
    heading_map = {h["paragraphId"]: h["heading"] for h in analysis.get("headings", [])}
    updated_paragraphs = 0
    for p in session_data.get("paragraphs", []):
        pid = p.get("id")
        if pid in heading_map:
            p["heading"] = heading_map[pid]
            updated_paragraphs += 1
        elif "heading" in p:
            del p["heading"]

    save_json(session_file, session_data)
    print(f"✅ Updated {updated_paragraphs} headings in {session_file.name}")

    # 2. Normalize and update course.json
    if "summary" in analysis and analysis["summary"]:
        session_meta["summary"] = analysis["summary"]

    # Normalization of date and labels
    raw_date = session_meta.get("date", "")
    if len(raw_date) == 8 and raw_date.isdigit():
        session_meta["date"] = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}"
    if "subSession" in session_meta:
        if session_meta["subSession"] == "A":
            session_meta["periodLabel"] = "上節"
        elif session_meta["subSession"] == "B":
            session_meta["periodLabel"] = "下節"
    if not session_meta.get("sidebarLabel"):
        date_str = session_meta.get("date", "").replace("-", "")
        pr = session_meta.get("pageRange", "")
        session_meta["sidebarLabel"] = f"（{session_id}）{date_str} 第六現前地{pr}"
    if not session_meta.get("officialAudioUrl"):
        session_meta["officialAudioUrl"] = session_meta.get("audioUrl", "")
    if not session_meta.get("flydayAudioUrl"):
        session_meta["flydayAudioUrl"] = session_meta.get("audioUrl", "")

    save_json(COURSE_FILE, course_data)
    print(f"✅ Updated and normalized course.json for {session_id}")

    # 3. Update toc.json
    toc_data = load_json(TOC_FILE)
    active_nodes = analysis.get("activeKepanNodes", [])
    
    def normalize_title(t):
        return re.sub(r'^[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥][一二三四五六七八九十百\d]+[、.\s]*', '', t).strip()

    def update_tree(nodes):
        matched = False
        for node in nodes:
            node_page = node.get("page", 0)
            node_title_norm = normalize_title(node.get("title", ""))
            for an in active_nodes:
                an_page = an.get("page", page_num)
                # Ensure page proximity within 3 pages
                if abs(node_page - an_page) > 3:
                    continue
                an_title = an.get("nodeTitle", "").split(">")[-1].strip()
                an_title_norm = normalize_title(an_title)
                if (an_title_norm and an_title_norm == node_title_norm) or (node.get("title") == an.get("nodeTitle")):
                    sids = node.get("sessionIds", [])
                    if session_id not in sids:
                        sids.append(session_id)
                    node["sessionIds"] = sids
                    matched = True
            if node.get("children"):
                if update_tree(node["children"]):
                    matched = True
        return matched

    update_tree(toc_data.get("sections", []))

    save_json(TOC_FILE, toc_data)
    print(f"✅ Updated toc.json nodes for {session_id}")

    return analysis

def main():
    parser = argparse.ArgumentParser(description="Calibrate Session TOC & Headings using GX10 Qwen3.8-27B")
    parser.add_argument("--session", type=str, help="Specific session ID (e.g. 31A)")
    parser.add_argument("--range", type=str, help="Range of sessions (e.g. 31A..31B)")
    parser.add_argument("--dry-run", action="store_true", help="Do not write changes to disk")
    args = parser.parse_args()

    endpoint = get_active_endpoint()
    print(f"🔌 Connected to GX10 Qwen3.8-27B at: {endpoint}")

    if args.session:
        analyze_session(args.session, endpoint, dry_run=args.dry_run)
    elif args.range:
        parts = args.range.split("..")
        if len(parts) != 2:
            print("Invalid range format. Use e.g. 31A..31B")
            sys.exit(1)
        course_data = load_json(COURSE_FILE)
        sids = [s["sessionId"] for s in course_data["sessions"]]
        try:
            start_idx = sids.index(parts[0])
            end_idx = sids.index(parts[1])
        except ValueError as e:
            print(f"Session not found in course.json: {e}")
            sys.exit(1)

        target_sids = sids[start_idx:end_idx+1]
        print(f"🎯 Target sessions ({len(target_sids)}): {target_sids}")
        for sid in target_sids:
            analyze_session(sid, endpoint, dry_run=args.dry_run)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
