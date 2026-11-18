#!/usr/bin/env python3
"""把重建前已 ai-reviewed 的 contentOverview 還原回文字未變的逐字稿。

規則（可稽核）：只有 paragraphs 的 (id, heading) 與每句 (id, text)
與舊檔完全相同，才還原 contentOverview；文字變了就標記需重跑 overview。
"""
import json
import sys
from pathlib import Path

COURSE = Path("courses/四法印")
SNAP = Path("/tmp/sifayin_ov")


def fingerprint(data):
    return [(p["id"], p.get("heading"), [(s["id"], s["text"]) for s in p["sentences"]])
            for p in data["paragraphs"]]


def main():
    need = []
    for path in sorted((COURSE / "sessions").glob("session_*.json")):
        new = json.loads(path.read_text(encoding="utf-8"))
        old_path = SNAP / path.name
        if not old_path.exists():
            need.append(path.stem)
            continue
        old = json.loads(old_path.read_text(encoding="utf-8"))
        overview = old.get("contentOverview")
        if not overview:
            need.append(path.stem)
            continue
        if fingerprint(new) != fingerprint(old):
            need.append(path.stem)
            continue
        if new.get("contentOverview") == overview:
            continue
        new["contentOverview"] = overview
        path.write_text(json.dumps(new, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[restore] {path.stem}: 文字未變，還原 contentOverview（{overview.get('status')}）")
    print("[restore] 需重跑 overview:", ",".join(n.replace("session_", "") for n in need) or "無")
    return 0


if __name__ == "__main__":
    sys.exit(main())
