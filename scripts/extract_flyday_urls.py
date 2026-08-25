#!/usr/bin/env python3
"""
map_flyday_urls.py - Map each session in courses/入中論善顯密意疏/course.json to its remote flyday audio URL.
"""
import re
import json
import urllib.parse

CONTENT_FILE = "/Users/henry/.gemini/antigravity-ide/brain/fd29af72-e90f-44d7-81b8-37d73d70eba8/.system_generated/steps/362/content.md"
COURSE_JSON_FILE = "courses/入中論善顯密意疏/course.json"

with open(CONTENT_FILE, "r", encoding="utf-8") as f:
    html = f.read()

# Extract all a href ending with .mp3 or .MP3
pattern = r'<a href="(https://buddha\.flyday\.com\.tw/[^"]+?\.(?:mp3|MP3))">([^<]+)</a>'
matches = re.findall(pattern, html)

flyday_items = []
for url, title in matches:
    # unquote url filename
    fname = urllib.parse.unquote(url.split('/')[-1])
    flyday_items.append({'url': url, 'title': title, 'filename': fname})

print(f"Total flyday MP3 items extracted: {len(flyday_items)}")

# Print first 10 items
for item in flyday_items[:10]:
    print(item['filename'], "->", item['url'])
