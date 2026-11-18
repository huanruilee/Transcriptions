#!/usr/bin/env python3
"""Add `studyGuides` manifest (available *_study_guide.html pages) to every course.json.

The SPA must not render the 研讀講記 button/iframe for sessions whose study-guide
asset does not exist (previously every course got a pattern-guessed URL → 404 iframe).
"""
import json, os, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for cdir in sorted(glob.glob(os.path.join(ROOT, "courses", "*"))):
    cj = os.path.join(cdir, "course.json")
    if not os.path.isdir(cdir) or not os.path.exists(cj):
        continue
    pages = sorted("publications/" + os.path.basename(p)
                   for p in glob.glob(os.path.join(cdir, "publications", "*_study_guide.html")))
    data = json.load(open(cj))
    data["studyGuides"] = pages
    json.dump(data, open(cj, "w"), ensure_ascii=False, indent=2)
    print(os.path.basename(cdir), "->", len(pages), "study guides")
