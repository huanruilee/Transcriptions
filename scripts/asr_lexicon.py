#!/usr/bin/env python3
"""
scripts/asr_lexicon.py

Unified loader and utility module for the Centralized Buddhist ASR Phonetic Lexicon.
Single Source of Truth: courses/入中論善顯密意疏/learned_corrections.json
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LEXICON_PATH = ROOT / "courses" / "入中論善顯密意疏" / "learned_corrections.json"

def load_lexicon(path=None):
    lexicon_path = Path(path) if path else DEFAULT_LEXICON_PATH
    if not lexicon_path.exists():
        raise FileNotFoundError(f"Lexicon file not found: {lexicon_path}")
    with open(lexicon_path, "r", encoding="utf-8") as f:
        return json.load(f)

def get_global_terms(path=None):
    data = load_lexicon(path)
    return data.get("global_terms", {})

def generate_prompt_bias_guidance(path=None, limit=None):
    """
    Generates structured acoustic bias guidance to inject into GX10 LLM prompts.
    """
    terms = get_global_terms(path)
    lines = [
        "【ASR 高頻語音聽打盲區對照與校勘指引】（請優先檢驗並修正以下音近訛字）："
    ]
    items = list(terms.items())
    if limit:
        items = items[:limit]

    for typo, info in items:
        corr = info.get("corrected", "")
        cat = info.get("category", "")
        reason = info.get("reasoning", "")
        lines.append(f"• 「{typo}」 ➔ 檢驗是否為 「{corr}」（{cat}：{reason}）")

    return "\n".join(lines)

def apply_deterministic_corrections(text, path=None):
    """
    Applies zero-false-positive deterministic regex substitutions to text.
    """
    terms = get_global_terms(path)
    corrected_text = text
    applied = []

    for typo, info in terms.items():
        pattern_str = info.get("safe_regex", typo)
        corr = info.get("corrected")
        if not corr:
            continue
        try:
            pattern = re.compile(pattern_str)
            if pattern.search(corrected_text):
                corrected_text = pattern.sub(corr, corrected_text)
                applied.append((typo, corr))
        except re.error:
            # Fallback to literal replace
            if typo in corrected_text:
                corrected_text = corrected_text.replace(typo, corr)
                applied.append((typo, corr))

    return corrected_text, applied

if __name__ == "__main__":
    lexicon = load_lexicon()
    terms = lexicon.get("global_terms", {})
    print(f"✅ Loaded {len(terms)} centralized terms from {DEFAULT_LEXICON_PATH.name}")
    print("\nSample Prompt Injection Preview:")
    print(generate_prompt_bias_guidance(limit=6))
