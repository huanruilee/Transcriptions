#!/usr/bin/env python3
"""
scripts/init_course.py - Initialize and scaffold a new Buddhist transcription course.

Usage:
    python3 scripts/init_course.py --id "guang-lun" --title "菩提道次第廣論" --master "見悲青增格西"
"""

import argparse
import json
import os
import sys
from pathlib import Path

def init_course(course_id: str, title: str, master: str, description: str, base_dir: Path = None):
    if base_dir is None:
        base_dir = Path.cwd()

    courses_dir = base_dir / "courses"
    course_path = courses_dir / title
    sessions_dir = course_path / "sessions"
    source_text_dir = course_path / "source_text"

    if course_path.exists():
        print(f"⚠️  Course directory already exists: {course_path}")
    else:
        course_path.mkdir(parents=True, exist_ok=True)
        sessions_dir.mkdir(parents=True, exist_ok=True)
        source_text_dir.mkdir(parents=True, exist_ok=True)
        print(f"📁 Created course directories at: {course_path}")

    # 1. Initialize course.json
    course_json_file = course_path / "course.json"
    if not course_json_file.exists():
        course_data = {
            "courseId": course_id,
            "title": title,
            "lecturer": master,
            "description": description or f"見悲青增格西開示《{title}》講記系列課程。本課程透過逐字稿與音檔雙向同步，提供深入義理研討。",
            "coverImage": "assets/cover.jpg",
            "sessions": []
        }
        with open(course_json_file, "w", encoding="utf-8") as f:
            json.dump(course_data, f, ensure_ascii=False, indent=2)
        print(f"📄 Created: {course_json_file}")

    # 2. Initialize audio_map.json
    audio_map_file = course_path / "audio_map.json"
    if not audio_map_file.exists():
        with open(audio_map_file, "w", encoding="utf-8") as f:
            json.dump({}, f, ensure_ascii=False, indent=2)
        print(f"📄 Created: {audio_map_file}")

    # 3. Initialize toc.json
    toc_file = course_path / "toc.json"
    if not toc_file.exists():
        toc_data = {
            "courseId": course_id,
            "courseTitle": title,
            "sections": []
        }
        with open(toc_file, "w", encoding="utf-8") as f:
            json.dump(toc_data, f, ensure_ascii=False, indent=2)
        print(f"📄 Created: {toc_file}")

    # 4. Initialize learned_corrections.json
    corrections_file = course_path / "learned_corrections.json"
    if not corrections_file.exists():
        corr_data = {
            "courseId": course_id,
            "domain_lexicon": {},
            "replacements": {}
        }
        with open(corrections_file, "w", encoding="utf-8") as f:
            json.dump(corr_data, f, ensure_ascii=False, indent=2)
        print(f"📄 Created: {corrections_file}")

    # 5. Place README / .gitkeep in subdirectories
    (sessions_dir / ".gitkeep").touch()
    (source_text_dir / ".gitkeep").touch()

    # 6. Register in courses/catalog.json
    catalog_file = courses_dir / "catalog.json"
    catalog_data = {
        "defaultCourseId": "ru-zhong-lun",
        "courses": []
    }
    if catalog_file.exists():
        try:
            with open(catalog_file, "r", encoding="utf-8") as f:
                catalog_data = json.load(f)
        except Exception:
            pass

    existing = next((c for c in catalog_data.get("courses", []) if c.get("id") == course_id or c.get("title") == title), None)
    relative_path = f"courses/{title}"
    if not existing:
        catalog_data["courses"].append({
            "id": course_id,
            "title": title,
            "master": master,
            "description": description or f"見悲青增格西開示《{title}》講記系列課程。",
            "path": relative_path,
            "totalSessions": 0
        })
        with open(catalog_file, "w", encoding="utf-8") as f:
            json.dump(catalog_data, f, ensure_ascii=False, indent=2)
        print(f"📑 Registered course '{title}' in {catalog_file}")
    else:
        print(f"ℹ️  Course '{title}' already registered in {catalog_file}")

    print("\n" + "=" * 60)
    print(f"🎉 課程《{title}》骨架初始化完成！")
    print("=" * 60)
    print("後續步驟指引：")
    print(f"  1. 填入錄音檔清單：編輯 {audio_map_file}")
    print(f"  2. 放置原典底本：將原書切頁文字放入 {source_text_dir}/page_XXX.txt")
    print(f"  3. 設定科判目錄：編輯 {toc_file}")
    print(f"  4. 產生講次清單：執行 python3 scripts/prepare_session_manifest.py")
    print("=" * 60 + "\n")

def main():
    parser = argparse.ArgumentParser(description="Initialize a new course in the Transcriptions platform.")
    parser.add_argument("--id", required=True, help="Course identifier slug (e.g. guang-lun)")
    parser.add_argument("--title", required=True, help="Course title in Traditional Chinese (e.g. 菩提道次第廣論)")
    parser.add_argument("--master", default="見悲青增格西", help="Lecturer name (default: 見悲青增格西)")
    parser.add_argument("--description", default="", help="Course summary/description")
    parser.add_argument("--base-dir", default=None, help="Root repository directory")
    args = parser.parse_args()

    base_dir = Path(args.base_dir) if args.base_dir else Path.cwd()
    init_course(args.id, args.title, args.master, args.description, base_dir)

if __name__ == "__main__":
    main()
