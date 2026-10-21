#!/usr/bin/env python3
"""
scripts/build_verbatim_track.py

T5：雙軌輸出——逐字忠實原話產生器（verbatim/<SID>.json）。
規則（不可違反）：
1. 絕不刪減或改寫任何實詞、重複與自我修正。
2. 僅修正 ASR 同音錯字、去除純語氣詞（嗯/啊/呃/哎呦/空標點）、補標點與原典引號。
3. 依段落時間範圍將句子對齊至各段落 p_1, p_2...
4. 標註 speaker（預設「格西」；問答句或指定語境標註「學員」）。
5. 嚴格繁體中文，零簡體字。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COURSE_DIR = ROOT / "courses" / "入中論善顯密意疏"
SESSIONS_DIR = COURSE_DIR / "sessions"
VERBATIM_DIR = COURSE_DIR / "verbatim"
LEARNED_FILE = COURSE_DIR / "learned_corrections.json"

STRICT_SIMP_REGEX = re.compile(
    r"[为这样个说体经论门从对么变实证觉关开边过问题时间还会点现显义极胜广当无师发与见随应处观摄识别业释难车声闻缘执许计总种听讲话导读记诵辩净谛]"
)
FORBIDDEN_HOMOPHONES = re.compile(
    r"非紋症|肺紋症|至向有|自向有|損壞羹|損壞更|設法心法|不先一心法|"
    r"生一地|生意地|七[狂況]法|執陽眼為水|羊眼|執那個正的是"
)


def load_learned_corrections() -> dict:
    if not LEARNED_FILE.exists():
        return {}
    try:
        data = json.loads(LEARNED_FILE.read_text(encoding="utf-8"))
        return data.get("global_terms", {})
    except Exception:
        return {}


def apply_learned_lexicon(text: str, learned: dict) -> str:
    res = text
    for typo, info in learned.items():
        corr = info.get("corrected")
        rx = info.get("safe_regex", re.escape(typo))
        if corr and (typo in res or re.search(rx, res)):
            res = re.sub(rx, corr, res)
    return res


def clean_verbatim_text(text: str, learned: dict) -> str:
    t = apply_learned_lexicon(text.strip(), learned)
    # 移除純語氣詞，但不刪除實詞
    # 僅移除獨立的嗯／啊／呃，不得吃掉「啊難」等實詞。
    t = re.sub(r"(^|[，、。？！\s])(?:[嗯啊呃]+)(?=[，、。？！\s]|$)", r"\1", t)
    t = re.sub(r"^[，、\s]+|[，、\s]+$", "", t)
    # 清理殘留雙標點
    t = re.sub(r"[，、]{2,}", "，", t)
    if t and not re.search(r"[。？！…」』]$", t):
        if re.search(r"(嗎|呢|吧|對不對|是不是|如何|哪裡|怎麼|為什麼|何故)[？\?]?$", t):
            t += "？"
        else:
            t += "。"
    return t


def build_verbatim_payload(
    session_id: str,
    sentences: list[dict],
    paragraphs_meta: list[dict],
    learned: dict | None = None,
) -> dict:
    if learned is None:
        learned = load_learned_corrections()

    paras_verbatim: dict[str, list[dict]] = {}

    if sentences and not paragraphs_meta:
        raise ValueError("有句子時必須提供段落時間範圍")
    assignments = [[] for _ in paragraphs_meta]
    for sentence in sentences:
        t = float(sentence["start"])
        candidates = [i for i, pm in enumerate(paragraphs_meta)
                      if float(pm["start"]) <= t < float(pm["end"])]
        # 缺口、片頭與片尾仍須收錄一次；待人工核對段落歸屬。
        idx = candidates[0] if candidates else min(
            range(len(paragraphs_meta)),
            key=lambda i: min(abs(t - float(paragraphs_meta[i]["start"])),
                              abs(t - float(paragraphs_meta[i]["end"]))))
        row = dict(sentence)
        if not candidates:
            row.update(reviewNeeded=True, uncertainty="段落時間範圍外，歸屬待核對")
        assignments[idx].append(row)

    for p_idx, pm in enumerate(paragraphs_meta):
        p_id = pm.get("id") or f"p_{p_idx + 1}"
        p_num = p_id.replace("p_", "p")
        v_list = []
        for s in assignments[p_idx]:
            cleaned = clean_verbatim_text(s.get("text", ""), learned)
            if not cleaned:
                continue
            row = {
                "id": f"{p_num}-v{len(v_list) + 1}",
                "start": round(float(s["start"]), 3),
                "end": round(float(s["end"]), 3),
                "speaker": s.get("speaker") or "格西",
                "text": cleaned,
            }
            # 不憑「剛剛」等口頭用語猜測講者，保留來源標註與待審資訊。
            for key in ("reviewNeeded", "uncertainty", "rawText", "llmProposal", "editAudit", "sourceMatches"):
                if key in s:
                    row[key] = s[key]
            v_list.append(row)
        paras_verbatim[p_id] = v_list

    payload = {
        "sessionId": session_id,
        "paragraphs": paras_verbatim,
    }

    # 繁體檢驗
    serialized = json.dumps(payload, ensure_ascii=False)
    simps = STRICT_SIMP_REGEX.findall(serialized)
    if simps:
        raise ValueError(f"Simplified characters detected in verbatim payload: {set(simps)}")

    spoken_text = "".join(s["text"] for group in paras_verbatim.values() for s in group)
    forbidden = FORBIDDEN_HOMOPHONES.findall(spoken_text)
    if forbidden:
        raise ValueError(f"逐字稿含禁止的同音錯字：{set(forbidden)}")
    return payload


def validate_output_path(path):
    target = Path(path).resolve()
    protected = [COURSE_DIR / folder / name
                 for sid in ("36A", "36B")
                 for folder, name in (
                     ("verbatim", f"verbatim_{sid}.json"),
                     ("sessions", f"session_{sid}.json"),
                     ("publications", f"lecture_{sid}_study_guide.md"),
                     ("publications", f"lecture_{sid}_study_guide.html"))]
    if target in [p.resolve() for p in protected]:
        raise ValueError("36A/36B 為已發佈黃金樣本，不得覆寫，請指定沙盒輸出")
    return target


def main():
    parser = argparse.ArgumentParser(description="Build verbatim track JSON for a session.")
    parser.add_argument("session_id", help="Session ID, e.g. 36A, 37A")
    parser.add_argument("--input-sentences", help="Optional path to input sentences JSON")
    parser.add_argument("--out", help="Output path (default: courses/.../verbatim/verbatim_<SID>.json)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sid = args.session_id.strip()
    out_path = Path(args.out) if args.out else (VERBATIM_DIR / f"verbatim_{sid}.json")
    if not args.dry_run:
        validate_output_path(out_path)
    session_file = SESSIONS_DIR / f"session_{sid}.json"
    if not session_file.exists():
        print(f"❌ Session file not found: {session_file}")
        sys.exit(1)

    s_data = json.loads(session_file.read_text(encoding="utf-8"))
    paras_meta = s_data.get("paragraphs", [])

    if args.input_sentences:
        sents = json.loads(Path(args.input_sentences).read_text(encoding="utf-8"))
    else:
        # 自 session 既有段落扁平化句子作為來源
        sents = [
            s for p in paras_meta for s in p.get("sentences", [])
        ]

    payload = build_verbatim_payload(sid, sents, paras_meta)
    total_s = sum(len(v) for v in payload["paragraphs"].values())
    total_c = sum(len(x["text"]) for v in payload["paragraphs"].values() for x in v)
    print(f"✅ Generated verbatim track for {sid}: {len(payload['paragraphs'])} paras, {total_s} sentences, {total_c} chars.")

    if not args.dry_run:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"💾 Written to {out_path}")


if __name__ == "__main__":
    main()
