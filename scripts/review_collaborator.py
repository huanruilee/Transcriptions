#!/usr/bin/env python3
"""
scripts/review_collaborator.py
Collaborative Tiered Review Bridge between Local Model (GX10 27B),
High-Tier Reviewer (Antigravity AI Agent), and Human Supervisor.

Capabilities:
1. Export & manage review queues (reports/review_queue_<SID>.json).
2. Format structured Markdown review tables for high-tier model / human review.
3. Apply reviewed rulings directly to session JSON, update timestamps, and absorb learned terms.
4. Export to web review console (review.html) for 3-second audio ear verification.
"""

import os
import sys
import re
import json
import argparse
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SESSIONS_DIR = REPO_ROOT / "courses" / "入中論善顯密意疏" / "sessions"
SOURCE_DIR = REPO_ROOT / "courses" / "入中論善顯密意疏" / "source_text"
COURSE_FILE = REPO_ROOT / "courses" / "入中論善顯密意疏" / "course.json"
LEARNED_FILE = REPO_ROOT / "courses" / "入中論善顯密意疏" / "learned_corrections.json"
REPORTS_DIR = REPO_ROOT / "reports"

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

def get_source_page_text(page_num):
    p_file = SOURCE_DIR / f"page_{page_num:03d}.txt"
    if p_file.exists():
        return p_file.read_text(encoding="utf-8").strip()
    return ""

def format_time(seconds):
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"

def generate_review_markdown(queue_data):
    """Format review queue items into Markdown for High-Tier AI (Antigravity) & Human review."""
    session_id = queue_data.get("session_id", "Unknown")
    items = queue_data.get("items", [])
    
    lines = [
        f"# 📋 逐字稿疑難句會診報告：第 {session_id} 堂",
        f"**生成時間**：{queue_data.get('generated_at', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))}",
        f"**待審句數**：共 {len(items)} 句",
        "",
        "---",
        ""
    ]

    for idx, item in enumerate(items, 1):
        s_idx = item.get("sentence_idx")
        start_t = item.get("start", 0)
        end_t = item.get("end", 0)
        time_str = f"{format_time(start_t)} ({start_t:.2f}s ~ {end_t:.2f}s)"
        asr_text = item.get("asr_text", "")
        proposal = item.get("local_proposal", "")
        reason = item.get("uncertainty_reason", "模型置信度偏低或語義存疑")
        ctx_before = item.get("context_before", "")
        ctx_after = item.get("context_after", "")
        page_ref = item.get("page_ref", "")

        lines.append(f"### 【條目 {idx}】第 {s_idx} 句 ｜ 時間：`{time_str}` ｜ 頁碼參考：`{page_ref}`")
        if ctx_before:
            lines.append(f"> **前文脈絡**：{ctx_before}")
        lines.append(f"* **ASR 原始聽打**：`{asr_text}`")
        lines.append(f"* **本地 27B 建議**：`{proposal}`")
        lines.append(f"* **存疑原因**：{reason}")
        if ctx_after:
            lines.append(f"> **後文脈絡**：{ctx_after}")
        lines.append("")
        lines.append(f"**高階模型仲裁結論**：*(待填入 / 點評理由)*")
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)

def apply_review_decisions(session_id, decisions, update_learned=True):
    """
    Apply high-tier reviewer decisions to session JSON.
    decisions: list of dicts:
    [
      {
        "sentence_idx": 159,
        "action": "custom" | "accept_proposal" | "keep_asr",
        "final_text": "...",
        "reasoning": "...",
        "learn_term": {
          "typo": "女兒",
          "corrected": "能立",
          "category": "因明名相"
        }
      }
    ]
    """
    session_file = SESSIONS_DIR / f"session_{session_id}.json"
    if not session_file.exists():
        raise FileNotFoundError(f"Session file not found: {session_file}")

    data = load_json(session_file)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Flatten sentences with index
    flat_sentences = []
    for p_idx, p in enumerate(data.get("paragraphs", [])):
        for s_idx, s in enumerate(p.get("sentences", [])):
            flat_sentences.append((p_idx, s_idx, s))

    decisions_map = {d["sentence_idx"]: d for d in decisions}
    applied_count = 0
    learned_terms = []

    for idx, (p_i, s_i, s_obj) in enumerate(flat_sentences):
        if idx in decisions_map:
            d = decisions_map[idx]
            old_text = s_obj.get("text", "")
            action = d.get("action", "custom")
            
            if action == "keep_asr":
                final_text = d.get("asr_text", old_text)
            elif action == "accept_proposal":
                final_text = d.get("proposal", old_text)
            else:
                final_text = d.get("final_text", old_text)

            if final_text != old_text:
                data["paragraphs"][p_i]["sentences"][s_i]["text"] = final_text
                applied_count += 1

            if update_learned and "learn_term" in d and d["learn_term"]:
                learned_terms.append(d["learn_term"])

    # Update metadata
    if "_meta" not in data:
        data["_meta"] = {}
    data["_meta"]["processed_at"] = now_str
    data["_meta"]["last_updated"] = now_str
    data["lastUpdated"] = now_str

    save_json(session_file, data)
    print(f"✅ Successfully applied {applied_count} review decisions to Session {session_id}.")

    # If learned terms provided, update learned_corrections.json
    if learned_terms and LEARNED_FILE.exists():
        learned_data = load_json(LEARNED_FILE)
        global_terms = learned_data.get("global_terms", {})
        added_count = 0

        for lt in learned_terms:
            typo = lt.get("typo")
            corr = lt.get("corrected")
            if typo and corr and typo not in global_terms:
                global_terms[typo] = {
                    "corrected": corr,
                    "category": lt.get("category", "中觀量論名相"),
                    "safe_regex": typo,
                    "treatise_ref": f"善顯密意疏 Session {session_id}",
                    "confidence": lt.get("confidence", 0.99),
                    "reasoning": lt.get("reasoning", f"由高階 Review 仲裁判定：{typo} ➔ {corr}")
                }
                added_count += 1

        if added_count > 0:
            learned_data["_metadata"]["totalGlobalTerms"] = len(global_terms)
            learned_data["_metadata"]["lastUpdated"] = now_str
            save_json(LEARNED_FILE, learned_data)
            print(f"🧠 Absorbed {added_count} newly verified terms into learned_corrections.json!")

    return applied_count

def export_to_web_review_queue(queue_data, output_path=None):
    """Export review queue into format suitable for review.html."""
    session_id = queue_data.get("session_id", "Unknown")
    items = queue_data.get("items", [])
    
    web_queue = []
    for item in items:
        start_t = item.get("start", 0)
        web_queue.append({
            "sessionId": session_id,
            "sentenceIndex": item.get("sentence_idx"),
            "audioUrl": item.get("audio_url", ""),
            "clipStart": max(0, start_t - 1.0),
            "clipEnd": start_t + 3.0,
            "asrText": item.get("asr_text", ""),
            "proposal": item.get("local_proposal", ""),
            "reason": item.get("uncertainty_reason", ""),
            "pageRef": item.get("page_ref", "")
        })

    if not output_path:
        output_path = REPORTS_DIR / f"web_review_{session_id}.json"
    save_json(output_path, web_queue)
    print(f"🌐 Exported {len(web_queue)} items for web review console: {output_path}")
    return web_queue

def main():
    parser = argparse.ArgumentParser(description="Collaborative Tiered Reviewer CLI")
    parser.add_argument("--session", "-s", help="Session ID (e.g. 31B)")
    parser.add_argument("--format-markdown", action="store_true", help="Format queue JSON as readable Markdown")
    parser.add_argument("--apply", help="Path to decisions JSON to apply")
    parser.add_argument("--export-web", action="store_true", help="Export to review.html format")
    args = parser.parse_args()

    if args.session:
        queue_path = REPORTS_DIR / f"review_queue_{args.session}.json"
        if args.format_markdown:
            if not queue_path.exists():
                print(f"Error: Review queue not found at {queue_path}", file=sys.stderr)
                sys.exit(1)
            q_data = load_json(queue_path)
            md = generate_review_markdown(q_data)
            print(md)
            return

        if args.apply:
            decisions = load_json(Path(args.apply))
            apply_review_decisions(args.session, decisions)
            return

        if args.export_web:
            if not queue_path.exists():
                print(f"Error: Review queue not found at {queue_path}", file=sys.stderr)
                sys.exit(1)
            q_data = load_json(queue_path)
            export_to_web_review_queue(q_data)
            return

    parser.print_help()

if __name__ == "__main__":
    main()
