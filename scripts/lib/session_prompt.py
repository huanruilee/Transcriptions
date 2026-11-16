#!/usr/bin/env python3
"""
scripts/lib/session_prompt.py

T2：依講次頁碼擴大底本視窗，動態產生當講 Whisper initial_prompt 與 LLM 校對上下文。
- 視窗：pageRange 起頁往前 BEFORE 頁、迄頁往後 AFTER 頁（涵蓋格西回顧前文，如 36A 回看 p.104）。
- 詞彙：書名號／引號內詞、科判標題（巳午未申…）、高頻四字以上名相。
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "courses" / "入中論善顯密意疏" / "source_text"

BEFORE = 10
AFTER = 3
MAX_PROMPT_CHARS = 220

PROMPT_HEAD = "以下是見悲青增格西講授宗喀巴大師《入中論善顯密意疏》的開示錄音，繁體中文。本講名相："

KEPAN_RE = re.compile(r"([子丑寅卯辰巳午未申酉戌亥][一二三四五六七八九十]+)[、，\s]*([\u4e00-\u9fff]{2,16})")
QUOTE_RE = re.compile(r"[「『《〈]([\u4e00-\u9fff·]{2,12})[」』》〉]")
STOP = {"如是", "是故", "所以", "此中", "謂若", "若爾", "何以", "然此", "此說", "此謂"}


def parse_page_range(page_range: str) -> tuple[int, int] | None:
    nums = [int(n) for n in re.findall(r"\d+", page_range or "")]
    if not nums:
        return None
    start, end = nums[0], nums[-1]
    if end < start or end - start > 12:
        end = start
    return start, end


def window_pages(page_range: str, before: int = BEFORE, after: int = AFTER, max_page: int = 285) -> list[int]:
    pr = parse_page_range(page_range)
    if not pr:
        return []
    s, e = pr
    return list(range(max(1, s - before), min(max_page, e + after) + 1))


def load_pages(pages: list[int], source_dir: Path = SOURCE_DIR) -> dict[int, str]:
    out = {}
    for p in pages:
        f = source_dir / f"page_{p:03d}.txt"
        if f.exists():
            out[p] = f.read_text(encoding="utf-8")
    return out


def extract_terms(text: str, core_text: str = "") -> list[str]:
    """抽取名相；core_text（當講主頁）出現的詞優先。"""
    terms: Counter[str] = Counter()
    for m in KEPAN_RE.finditer(text):
        terms[m.group(2)[:14]] += 3
    for m in QUOTE_RE.finditer(text):
        w = m.group(1)
        if w not in STOP:
            terms[w] += 2
    for w in re.findall(r"[\u4e00-\u9fff]{4,6}", text):
        terms[w] += 0  # register only
    if core_text:
        for w in list(terms):
            if w in core_text:
                terms[w] += 5
    ranked = [w for w, c in terms.most_common() if c > 0]
    # 去除被較長詞包含的短詞
    result: list[str] = []
    for w in ranked:
        if any(w in r for r in result):
            continue
        result.append(w)
    return result


def build_initial_prompt(page_range: str, source_dir: Path = SOURCE_DIR, max_chars: int = MAX_PROMPT_CHARS) -> str:
    pages = load_pages(window_pages(page_range), source_dir)
    pr = parse_page_range(page_range)
    core = "".join(t for p, t in pages.items() if pr and pr[0] <= p <= pr[1])
    terms = extract_terms("\n".join(pages.values()), core)
    prompt = PROMPT_HEAD
    for t in terms:
        cand = prompt + ("" if prompt.endswith("：") else "、") + t
        if len(cand) > max_chars:
            break
        prompt = cand
    return prompt + "。"


def build_source_context(page_range: str, source_dir: Path = SOURCE_DIR, max_chars: int = 12000) -> str:
    pages = load_pages(window_pages(page_range), source_dir)
    pr = parse_page_range(page_range)
    # 主頁優先放前面，其餘依頁序
    order = sorted(pages, key=lambda p: (0 if pr and pr[0] <= p <= pr[1] else 1, p))
    chunks, total = [], 0
    for p in order:
        block = f"=== 《善顯密意疏》第 {p} 頁 ===\n{pages[p].strip()}"
        if total + len(block) > max_chars:
            break
        chunks.append(block)
        total += len(block)
    return "\n\n".join(chunks)


if __name__ == "__main__":
    import sys
    pr = sys.argv[1] if len(sys.argv) > 1 else "p.111-113"
    print("pages:", window_pages(pr))
    print(build_initial_prompt(pr))
