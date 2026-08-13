#!/usr/bin/env python3
"""
clean_llm_residue.py - Fix Bug 2.1: Remove LLM prompt/output residue from session JSONs

Pattern: AGY sometimes appended its confirmation/reply text (e.g., "以上為依據...")
to the last paragraph's last sentence. Detect and strip these contamination markers.
"""

import json
import re
from pathlib import Path

SESSIONS_DIR = Path("courses/入中論善顯密意疏/sessions")

# Regex patterns: LLM output residue markers
LLM_RESIDUE_PATTERNS = [
    # Bullet/numbered start + reserve-style
    r'^[\s\n]*[\d]+\.\s*\*\*保留講者講述原貌\*\*.*$',
    r'^[\s\n]*[\d]+\.\s*\*\*結構與口語完整保留\*\*.*$',
    r'^[\s\n]*[\d]+\.\s*\*\*[^*]+\*\*[:：].*$',  # numbered bullets ending with ":"
    # Header lines + content
    r'^[\s\n]*---\s*\n以上為依據.*$',
    r'^[\s\n]*---\s*\n已依照.*$',
    r'^[\s\n]*以上為依據.*$',
    r'^[\s\n]*已依照.*$',
    # Files mentioned
    r'.*agy_prompt.*',
    r'.*KnowledgeSources.*',
    # Confirmation phrases
    r'.*無寫入任何檔案.*',
    r'.*未寫入任何檔案.*',
    r'.*直接輸出至\s*stdout.*',
    r'.*輸出於上方.*',
    r'.*校正完畢之完整逐字稿.*',
    r'.*完成全篇逐字稿.*',
]

# Compile combined regex with multiline + case-insensitive
LLM_RESIDUE_REGEX = re.compile('|'.join(LLM_RESIDUE_PATTERNS), re.MULTILINE | re.DOTALL)

def is_residue(text: str) -> bool:
    """Detect if text contains LLM residue markers."""
    if not text:
        return False
    # Has LLM-style markers
    if 'agy_prompt' in text or 'KnowledgeSources' in text:
        return True
    if '無寫入任何檔案' in text or '未寫入任何檔案' in text or '輸出至 stdout' in text:
        return True
    if '校正完畢' in text and '逐字稿' in text:
        return True
    # Generic: ends with sentence about completion/no-file-write
    if re.search(r'(以上為依據|已依照|對照原典).{0,200}(簡轉繁|簡轉繁、佛法).{0,100}(校正|完成|無寫入)', text, re.DOTALL):
        return True
    return False


def clean_session(path: Path) -> bool:
    """Strip LLM residue from a session JSON. Returns True if changed."""
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    paragraphs = data.get("paragraphs", [])
    if not paragraphs:
        return False

    changed = False
    # Strategy: scan every sentence in every paragraph, drop ones matching residue
    for para in paragraphs:
        sentences = para.get("sentences", [])
        cleaned = []
        for sent in sentences:
            text = sent.get("text", "")
            if is_residue(text):
                changed = True
                # Print info
                print(f"  REMOVE @ {path.name} para[{para.get('id')}] sent[{sent.get('id')}]")
                print(f"    text: {text[:120]!r}")
                continue
            cleaned.append(sent)
        para["sentences"] = cleaned

    # Special case: if a paragraph ends up with no sentences, remove it entirely
    paragraphs = [p for p in paragraphs if p.get("sentences")]
    data["paragraphs"] = paragraphs

    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    return changed


def main():
    import sys
    dry_run = "--dry-run" in sys.argv
    n_total = 0
    n_changed = 0
    files_changed = []
    for path in sorted(SESSIONS_DIR.glob("session_*.json")):
        n_total += 1
        if clean_session(path):
            n_changed += 1
            files_changed.append(path.name)
    mode = "DRY-RUN" if dry_run else "EXEC"
    print(f"\n[{mode}] Summary: {n_changed}/{n_total} session files would be cleaned")
    if files_changed:
        print("Files affected:")
        for f in files_changed:
            print(f"  - {f}")


if __name__ == "__main__":
    main()