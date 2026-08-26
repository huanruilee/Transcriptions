#!/usr/bin/env python3
"""
scripts/convert_all_to_traditional.py
Converts all session JSON files, course.json, and toc.json from Simplified Chinese to Pure Traditional Chinese (Taiwan Standard) using OpenCC.
"""

import json, re, sys
from pathlib import Path

try:
    import opencc
    converter = opencc.OpenCC('s2twp') # Simplified to Traditional (Taiwan Standard Phrase)
except ImportError:
    print("⚠️ opencc not found, please install opencc-python-reimplemented")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).parent.parent
SESSIONS_DIR = PROJECT_ROOT / "courses" / "入中論善顯密意疏" / "sessions"
COURSE_JSON = PROJECT_ROOT / "courses" / "入中論善顯密意疏" / "course.json"
TOC_JSON = PROJECT_ROOT / "courses" / "入中論善顯密意疏" / "toc.json"

def convert_object(obj):
    if isinstance(obj, str):
        return converter.convert(obj)
    elif isinstance(obj, list):
        return [convert_object(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: convert_object(v) for k, v in obj.items()}
    return obj

def main():
    print("🏮 Starting Global Traditional Chinese (繁體中文) Conversion...")
    all_files = sorted(list(SESSIONS_DIR.glob("session_*.json")))
    print(f"  Found {len(all_files)} session files in {SESSIONS_DIR}")

    converted_count = 0
    for p in all_files:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        orig_str = json.dumps(data, ensure_ascii=False)
        converted_data = convert_object(data)
        new_str = json.dumps(converted_data, ensure_ascii=False, indent=2)

        if orig_str != json.dumps(converted_data, ensure_ascii=False):
            converted_count += 1
            with open(p, "w", encoding="utf-8") as f:
                f.write(new_str)

    print(f"  ✅ Converted {converted_count} / {len(all_files)} session files to pure Traditional Chinese.")

    # Convert course.json
    if COURSE_JSON.exists():
        with open(COURSE_JSON, "r", encoding="utf-8") as f:
            cdata = json.load(f)
        cdata_conv = convert_object(cdata)
        with open(COURSE_JSON, "w", encoding="utf-8") as f:
            json.dump(cdata_conv, f, ensure_ascii=False, indent=2)
        print("  ✅ Converted course.json to Traditional Chinese.")

    # Convert toc.json
    if TOC_JSON.exists():
        with open(TOC_JSON, "r", encoding="utf-8") as f:
            tdata = json.load(f)
        tdata_conv = convert_object(tdata)
        with open(TOC_JSON, "w", encoding="utf-8") as f:
            json.dump(tdata_conv, f, ensure_ascii=False, indent=2)
        print("  ✅ Converted toc.json to Traditional Chinese.")

    print("🎉 All documents successfully converted to Pure Traditional Chinese (繁體中文)!")

if __name__ == "__main__":
    main()
