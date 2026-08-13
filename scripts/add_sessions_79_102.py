#!/usr/bin/env python3
"""
add_sessions_79_102.py - Add sessions 79-102 to course.json from flyday metadata.

Reads /tmp/flyday_79_102.txt (format: N\tname\turl), extracts date/page/地 from
the filename, and inserts new session entries into course.json between 78B and 103A.

Usage: python3 add_sessions_79_102.py [--dry-run]
"""
import json
import os
import re
import sys

COURSE_JSON = "courses/入中論善顯密意疏/course.json"
LIST = "/tmp/flyday_79_102.txt"

def parse_filename(name):
    """Extract date, 地, page from flyday filename."""
    # e.g. 20180331-A 入中論善顯密意疏-第七遠行地p241(79).MP3
    m = re.match(r'(\d{8})-?([AB]?)\s+入中論善顯密意疏-(.+?)p(\d+)\((\d+)\)\.(?:mp3|MP3)$', name)
    if not m:
        return None
    date_str, sub, topic, page, num = m.groups()
    # date: YYYYMMDD -> YYYY-MM-DD
    date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
    return {
        'date': date,
        'subSession': sub if sub else '',
        'topic': topic,
        'page': int(page),
        'num': int(num),
    }

def main():
    dry_run = "--dry-run" in sys.argv

    with open(COURSE_JSON) as f:
        course = json.load(f)

    # Read flyday list
    entries = []
    with open(LIST) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('\t')
            if len(parts) < 2:
                continue
            n = int(parts[0])
            name = parts[1]
            meta = parse_filename(name)
            if meta:
                entries.append((n, name, meta))

    # Group by session number (A/B)
    sessions_by_num = {}
    for n, name, meta in entries:
        sessions_by_num.setdefault(n, []).append((name, meta))

    # Build new session entries
    new_sessions = []
    for n in sorted(sessions_by_num):
        items = sessions_by_num[n]
        # Sort A before B
        items.sort(key=lambda x: x[1]['subSession'])
        for name, meta in items:
            sub = meta['subSession']
            sid = f"{n}{sub}" if sub else str(n)
            period = "上節" if sub == "A" else ("下節" if sub == "B" else "")
            page = f"p.{meta['page']}"
            title = f"第 {sid} 堂 ({period}) | {meta['date']} | {page}"
            new_sessions.append({
                "sessionId": sid,
                "sessionNum": n,
                "subSession": sub,
                "periodLabel": period,
                "date": meta['date'],
                "pageRange": page,
                "title": title,
                "audioUrl": f"audio/{sid}.mp3",
                "jsonUrl": f"courses/入中論善顯密意疏/sessions/session_{sid}.json",
                "summary": "",
            })

    print(f"將新增 {len(new_sessions)} 個 session 到 course.json")

    # Insert after 78B, before 103A
    existing_ids = [s['sessionId'] for s in course['sessions']]
    # Find insertion index: after last session with num <= 78
    insert_idx = 0
    for i, s in enumerate(course['sessions']):
        num = s.get('sessionNum', 0)
        if num <= 78:
            insert_idx = i + 1

    if dry_run:
        print(f"[DRY] 將在 index {insert_idx} 插入 {len(new_sessions)} 個 session")
        for s in new_sessions[:5]:
            print(f"  {s['sessionId']}: {s['title']}")
        print("  ...")
        return

    # Insert
    course['sessions'][insert_idx:insert_idx] = new_sessions

    with open(COURSE_JSON, 'w', encoding='utf-8') as f:
        json.dump(course, f, ensure_ascii=False, indent=2)

    print(f"完成: course.json 現在有 {len(course['sessions'])} 個 session")

if __name__ == "__main__":
    main()
