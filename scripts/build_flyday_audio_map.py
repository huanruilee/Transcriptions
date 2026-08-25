#!/usr/bin/env python3
import re
import json
import urllib.parse

CONTENT_FILE = "/Users/henry/.gemini/antigravity-ide/brain/fd29af72-e90f-44d7-81b8-37d73d70eba8/.system_generated/steps/362/content.md"
COURSE_JSON_FILE = "courses/入中論善顯密意疏/course.json"
OUTPUT_MAP_FILE = "courses/入中論善顯密意疏/audio_map.json"

with open(CONTENT_FILE, "r", encoding="utf-8") as f:
    html = f.read()

pattern = r'<a href="(https://buddha\.flyday\.com\.tw/[^"]+?\.(?:mp3|MP3))">([^<]+)</a>'
matches = re.findall(pattern, html)

flyday_items = []
for url, title in matches:
    fname = urllib.parse.unquote(url.split('/')[-1])
    # Pattern: 20160521 入中論善顯密意疏-第六現前地p63(1).MP3
    # or: 20160528-A 入中論善顯密意疏-第六現前地p63(2).MP3
    # or: 20181222-B 入中論善顯密意疏-第五難勝地p63(110)-圓滿.mp3
    m = re.search(r'(\d{8})-?([AB]?)\s+.*?\((\d+)\)[^.]*\.(?:mp3|MP3)', fname, re.IGNORECASE)
    if m:
        date_raw, sub, num_str = m.groups()
        date_fmt = f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:8]}"
        num = int(num_str)
        sub_id = sub.upper() if sub else ''
        
        # Canonical sessionId in course.json
        if num == 1 and not sub_id:
            sid = "01"
        else:
            sub_part = sub_id if sub_id else 'A'
            sid = f"{num:02d}{sub_part}"
            
        flyday_items.append({
            'sessionId': sid,
            'date': date_fmt,
            'subSession': sub_id,
            'num': num,
            'url': url,
            'filename': fname
        })

print(f"Total flyday parsed items: {len(flyday_items)}")

# Build lookup table by sessionId and by (date, subSession)
by_sid = {}
by_date_sub = {}
for item in flyday_items:
    by_sid[item['sessionId']] = item['url']
    by_date_sub[(item['date'], item['subSession'])] = item['url']

with open(COURSE_JSON_FILE, "r", encoding="utf-8") as f:
    course = json.load(f)

session_url_map = {}
matched = 0
missing = []

for s in course['sessions']:
    sid = s['sessionId']
    url = by_sid.get(sid)
    if not url:
        url = by_date_sub.get((s['date'], s.get('subSession', '')))
    
    if url:
        session_url_map[sid] = url
        matched += 1
    else:
        missing.append(sid)

print(f"Successfully matched: {matched} / {len(course['sessions'])}")
if missing:
    print(f"Missing {len(missing)} sessions: {missing}")

with open(OUTPUT_MAP_FILE, "w", encoding="utf-8") as f:
    json.dump(session_url_map, f, indent=2, ensure_ascii=False)

print(f"Saved audio map to {OUTPUT_MAP_FILE}")
