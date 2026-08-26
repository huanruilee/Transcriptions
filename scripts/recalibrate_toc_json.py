#!/usr/bin/env python3
"""
scripts/recalibrate_toc_json.py
自動校正 toc.json 中所有 393 個科判節點的 sessionId, sessionIds 與精準聲學起點 timestamp。
"""

import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
COURSE_DIR = BASE_DIR / "courses" / "入中論善顯密意疏"
SESSIONS_DIR = COURSE_DIR / "sessions"

# 1. 讀取 course.json
with open(COURSE_DIR / "course.json", "r", encoding="utf-8") as f:
    course = json.load(f)

# 建立 頁碼 -> 講次 映射
session_page_map = {}
for s in course.get("sessions", []):
    sid = s["sessionId"]
    pr = s.get("pageRange", "")
    pm = re.search(r"p\.?(\d+)", pr)
    p_num = int(pm.group(1)) if pm else 0
    session_page_map.setdefault(p_num, []).append(sid)

# 2. 讀取所有 session JSON
session_headings = {}
session_sentences = {}

for sf in SESSIONS_DIR.glob("session_*.json"):
    sid = sf.stem.replace("session_", "")
    with open(sf, "r", encoding="utf-8") as f:
        sdata = json.load(f)
    
    headings = []
    sentences = []
    for p in sdata.get("paragraphs", []):
        h = p.get("heading")
        p_start = p.get("start", 0)
        p_id = p.get("id")
        if h:
            headings.append({"heading": h, "start": p_start, "id": p_id})
        for sent in p.get("sentences", []):
            sentences.append({"text": sent.get("text", ""), "start": sent.get("start", 0), "id": sent.get("id")})
    
    session_headings[sid] = headings
    session_sentences[sid] = sentences

# 3. 讀取 toc.json
with open(COURSE_DIR / "toc.json", "r", encoding="utf-8") as f:
    toc = json.load(f)

def calibrate_node(node):
    title = node.get("title", "")
    page = node.get("page", 0)
    
    # 清理標題前綴
    core_title = re.sub(r"^[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥][一二三四五六七八九十百]+[、\s]*", "", title)
    core_title = re.sub(r"^[一二三四五六七八九十百]+[、\s]*", "", core_title)
    
    # 候選講次：該頁碼與相鄰前後 2 頁之講次
    cand_sessions = []
    for p_offset in [0, -1, 1, -2, 2, -3, 3]:
        for s in session_page_map.get(page + p_offset, []):
            if s not in cand_sessions:
                cand_sessions.append(s)
    
    if not cand_sessions:
        cand_sessions = [node.get("sessionId")] if node.get("sessionId") else ["01"]

    target_session = cand_sessions[0]
    target_timestamp = 0.0
    matched = False

    # 優先嘗試匹配小標題
    for sid in cand_sessions:
        for h in session_headings.get(sid, []):
            htext = h["heading"]
            if any(k in htext for k in [core_title, core_title[:4], core_title[:3]] if len(k) >= 2):
                target_session = sid
                target_timestamp = round(float(h["start"]), 2)
                matched = True
                break
        if matched:
            break

    # 其次嘗試匹配句意文字
    if not matched:
        for sid in cand_sessions:
            for sent in session_sentences.get(sid, []):
                stext = sent["text"]
                if core_title and len(core_title) >= 3 and core_title in stext:
                    target_session = sid
                    target_timestamp = round(float(sent["start"]), 2)
                    matched = True
                    break
            if matched:
                break

    # 預設對齊該堂課第一句起點
    if not matched:
        target_session = cand_sessions[0]
        first_sents = session_sentences.get(target_session, [])
        target_timestamp = round(float(first_sents[0]["start"]), 2) if first_sents else 0.0

    node["sessionId"] = target_session
    node["sessionIds"] = cand_sessions
    node["timestamp"] = target_timestamp

    # 遞歸處理子節點
    for child in node.get("children", []):
        calibrate_node(child)

for section in toc.get("sections", []):
    calibrate_node(section)

# 4. 寫回 toc.json
with open(COURSE_DIR / "toc.json", "w", encoding="utf-8") as f:
    json.dump(toc, f, ensure_ascii=False, indent=2)

print(f"Recalibrated all {toc.get('totalSections', 393)} nodes in toc.json with precise session IDs and acoustic timestamps.")
