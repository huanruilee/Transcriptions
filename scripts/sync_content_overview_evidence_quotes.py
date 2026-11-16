#!/usr/bin/env python3
"""Re-anchor contentOverview evidence quotes to current sentence text.

contentOverview.discussionTopics (and any {sentenceId, quote} pair) cite
verbatim transcript text; after Stage6 text repairs the quotes drifted and
summaries:audit reports EVIDENCE_QUOTE_MISMATCH. Quotes are derived fields —
sync them to the corrected sentences (precedent: contentOverview 衍生欄位同步).
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def fix_course(cid, cdir):
    changed = 0
    for fp in sorted(os.listdir(os.path.join(cdir, "sessions"))) if os.path.isdir(os.path.join(cdir, "sessions")) else []:
        if not fp.endswith(".json") or "amendment" in fp: continue
        path = os.path.join(cdir, "sessions", fp)
        data = json.load(open(path))
        texts = {s.get("id"): s.get("text") for p in data.get("paragraphs") or [] for s in p.get("sentences") or []}
        def walk(node):
            nonlocal changed
            if isinstance(node, dict):
                sid, q = node.get("sentenceId"), node.get("quote")
                if isinstance(sid, str) and isinstance(q, str) and sid in texts and texts[sid] != q:
                    node["quote"] = texts[sid]
                    changed += 1
                for v in node.values(): walk(v)
            elif isinstance(node, list):
                for v in node: walk(v)
        walk(data.get("contentOverview"))
        if changed:
            json.dump(data, open(path, "w"), ensure_ascii=False, indent=2)
    return changed

total = 0
for cdir in sorted(os.path.join(ROOT, "courses", d) for d in os.listdir(os.path.join(ROOT, "courses"))):
    if os.path.isdir(os.path.join(cdir, "sessions")):
        n = fix_course(os.path.basename(cdir), cdir)
        if n: print(os.path.basename(cdir), "quotes synced:", n)
        total += n
print("total synced:", total)
