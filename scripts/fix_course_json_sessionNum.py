#!/usr/bin/env python3
"""
fix_course_json_sessionNum.py - Fix Bug: sessionNum must be integer per DATA_SCHEMA.md

33 sessions in course.json have sessionNum as a string instead of an integer.
This breaks any numeric sort/filter/comparison downstream.
"""

import json
from pathlib import Path

COURSE_JSON = Path("courses/入中論善顯密意疏/course.json")


def main():
    with open(COURSE_JSON, encoding='utf-8') as f:
        data = json.load(f)

    fixed = []
    for session in data.get("sessions", []):
        sn = session.get("sessionNum")
        if isinstance(sn, str):
            try:
                session["sessionNum"] = int(sn)
                fixed.append(session["sessionId"])
            except ValueError:
                print(f"  ! Could not convert {session['sessionId']}: '{sn}'")

    with open(COURSE_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\nFixed {len(fixed)} sessions:")
    for sid in fixed:
        print(f"  - {sid}")


if __name__ == "__main__":
    main()