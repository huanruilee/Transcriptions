#!/usr/bin/env python3
"""
build_full_treatise_toc.py - Build Complete 17-Page Hierarchical 科判 (TOC)
Parses the entire 17-page outline from source_text/page_269.txt to page_285.txt,
locates each section's exact page in the treatise text (page_001..page_268),
maps them to course sessions, and outputs an exhaustive, beautiful toc.json.
"""
import os
import sys
import json
import re
from pathlib import Path

SOURCE_DIR = Path("courses/入中論善顯密意疏/source_text")
COURSE_JSON = Path("courses/入中論善顯密意疏/course.json")
TOC_JSON = Path("courses/入中論善顯密意疏/toc.json")

# Level rank mapping
TIER_RANKS = {
    '甲': 1, '乙': 2, '丙': 3, '丁': 4, '戊': 5,
    '己': 6, '庚': 7, '辛': 8, '壬': 9, '癸': 10,
    '子': 11, '丑': 12, '寅': 13, '卯': 14, '辰': 15,
    '巳': 16, '午': 17, '未': 18, '申': 19, '酉': 20,
    '戌': 21, '亥': 22
}

def parse_outline_lines():
    outline_lines = []
    for p in range(269, 286):
        p_path = SOURCE_DIR / f"page_{p:03d}.txt"
        if not p_path.exists():
            continue
        with open(p_path, "r", encoding="utf-8") as f:
            for line in f.read().splitlines():
                clean = line.strip()
                if not clean or clean.isdigit() or "《入中論大疏》科文" in clean:
                    continue
                # Match tier prefix like "甲一、", "乙二、", "子三、"
                m = re.match(r'^([甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥])([一二三四五六七八九十百千萬]+)[、\s]*(.*)$', clean)
                if m:
                    tier_char, num_str, title_text = m.groups()
                    rank = TIER_RANKS.get(tier_char, 99)
                    full_title = f"{tier_char}{num_str}、{title_text.strip()}" if title_text.strip() else f"{tier_char}{num_str}"
                    outline_lines.append({
                        "tier": tier_char,
                        "rank": rank,
                        "num": num_str,
                        "title": full_title,
                        "pure_title": title_text.strip()
                    })
    return outline_lines

def locate_page_for_sections(outline_lines):
    # Load all body text pages (p.1 to p.268)
    body_pages = {}
    for p in range(1, 269):
        p_path = SOURCE_DIR / f"page_{p:03d}.txt"
        if p_path.exists():
            with open(p_path, "r", encoding="utf-8") as f:
                body_pages[p] = f.read()

    # Find where each section appears in text
    last_found_page = 1
    for sec in outline_lines:
        prefix = f"{sec['tier']}{sec['num']}"
        pure = sec['pure_title']
        found_p = None

        # Search forward starting from last_found_page
        for p in range(last_found_page, 269):
            text = body_pages.get(p, "")
            if (prefix in text and pure[:4] in text) or (f"{sec['tier']}{sec['num']}、" in text):
                found_p = p
                break

        # Fallback full search if not found
        if not found_p:
            for p in range(1, 269):
                text = body_pages.get(p, "")
                if (prefix in text and pure[:4] in text) or (f"{sec['tier']}{sec['num']}、" in text):
                    found_p = p
                    break

        if found_p:
            sec["page"] = found_p
            last_found_page = max(last_found_page, found_p)
        else:
            sec["page"] = last_found_page

    return outline_lines

def map_pages_to_sessions(outline_lines):
    with open(COURSE_JSON, "r", encoding="utf-8") as f:
        course = json.load(f)
    sessions = course.get("sessions", [])

    # Build page to session mapping
    page_to_session = {}
    for s in sessions:
        sid = s["sessionId"]
        pr = s.get("pageRange", "")
        nums = [int(n) for n in re.findall(r'\d+', pr)]
        if nums:
            start_p = nums[0]
            end_p = nums[-1] if len(nums) > 1 else start_p
            for p in range(start_p, end_p + 1):
                if p not in page_to_session:
                    page_to_session[p] = sid

    # Map each section
    for sec in outline_lines:
        p = sec.get("page", 1)
        # Exact match or find closest preceding session
        sid = page_to_session.get(p)
        if not sid:
            # find closest page below
            for check_p in range(p, 0, -1):
                if check_p in page_to_session:
                    sid = page_to_session[check_p]
                    break
        sec["sessionId"] = sid or "01"
        sec["timestamp"] = 0

    return outline_lines

def build_hierarchy(flat_nodes):
    root = []
    stack = [] # [(rank, node_dict)]

    for item in flat_nodes:
        node = {
            "title": item["title"],
            "sessionId": item["sessionId"],
            "page": item.get("page", 1),
            "timestamp": item["timestamp"],
            "children": []
        }
        rank = item["rank"]

        while stack and stack[-1][0] >= rank:
            stack.pop()

        if not stack:
            root.append(node)
        else:
            stack[-1][1]["children"].append(node)

        stack.append((rank, node))

    # Clean empty children arrays
    def clean_children(node_list):
        for n in node_list:
            if not n["children"]:
                del n["children"]
            else:
                clean_children(n["children"])

    clean_children(root)
    return root

def main():
    print("🌲 Parsing full 17-page 《入中論大疏》科文 (page 269 to 285)...")
    outline_lines = parse_outline_lines()
    print(f"  Found {len(outline_lines)} raw outline entries.")

    print("🔍 Locating exact page numbers in treatise text (p.1 to p.268)...")
    outline_lines = locate_page_for_sections(outline_lines)

    print("🔗 Mapping outline nodes to 198 course sessions...")
    outline_lines = map_pages_to_sessions(outline_lines)

    print("🌳 Constructing nested outline hierarchy...")
    tree = build_hierarchy(outline_lines)

    toc_payload = {
        "courseId": "ru-zhong-lun",
        "title": "入中論善顯密意疏 全書總科判（17 頁完整科文體系）",
        "totalSections": len(outline_lines),
        "sections": tree
    }

    with open(TOC_JSON, "w", encoding="utf-8") as f:
        json.dump(toc_payload, f, ensure_ascii=False, indent=2)

    print(f"🎉 Successfully built full {len(outline_lines)}-node 科判 tree in {TOC_JSON}!")

if __name__ == "__main__":
    main()
