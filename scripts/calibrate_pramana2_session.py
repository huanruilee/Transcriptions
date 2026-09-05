#!/usr/bin/env python3
"""
scripts/calibrate_pramana2_session.py

Grounded proofreading for 《釋量論第二品》sessions.
Reference text: gdrive/KnowledgeSources/如性法師教法/《釋量論·成量品》（全）.md
  — split by 第N講 headers; each YouTube lecture maps 1:1 to one 講 section.
Headings: toc.json children (from 題綱 ground truth) — LLM only anchors them
  to paragraph boundaries, never invents titles.

Pipeline per session:
  1. asr_out/pramana2/session_XX_raw.json → paragraphs/sentences schema
  2. deterministic pre-polish (learned_corrections.json global_terms, safe_regex)
  3. LLM dual-track proofreading (40 sentences/batch, subsection-grounded context)
  4. heading anchoring to 題綱 children + toc.json timestamp sync
  5. course.json summary sync + review queue export
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

ROOT = Path(__file__).resolve().parent.parent
COURSE_DIR = ROOT / "courses" / "釋量論第二品"
SESSIONS_DIR = COURSE_DIR / "sessions"
TOC_FILE = COURSE_DIR / "toc.json"
COURSE_FILE = COURSE_DIR / "course.json"
LEARNED_FILE = COURSE_DIR / "learned_corrections.json"
ASR_DIR = ROOT / "asr_out" / "pramana2"
REF_FILE = Path("/home/henry/gdrive/KnowledgeSources/如性法師教法/《釋量論·成量品》（全）.md")

CN_NUM = "零一二三四五六七八九十十一十二十三十四十五十六十七十八十九二十廿一廿二廿三廿四廿五廿六廿七廿八廿九三十卅一卅二"
CN_LIST = ["第一講","第二講","第三講","第四講","第五講","第六講","第七講","第八講","第九講","第十講",
"第十一講","第十二講","第十三講","第十四講","第十五講","第十六講","第十七講","第十八講","第十九講","第二十講",
"第二十一講","第二十二講","第二十三講","第二十四講","第二十五講","第二十六講","第二十七講","第二十八講","第二十九講","第三十講",
"第三十一講","第三十二講"]

DEFAULT_ENDPOINTS = [
    "http://127.0.0.1:4001/v1",
    "http://192.168.122.1:8001/v1",
    "http://127.0.0.1:8001/v1",
]
ROUTER_AUTH_TOKEN = os.environ.get(
    "ROUTER_API_KEY",
    "gx10-c6a5ae95f47bb838fff310e20cf22e6488a0a7b9ff32290d4d864f5d6f2110f5")


def load_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))

def save_json(p, data):
    Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_reference_lectures():
    """Split 成量品全文 into {1..32: {'title', 'sections': [(sec_title, text)]}}."""
    text = REF_FILE.read_text(encoding="utf-8")
    lectures = {}
    for idx, marker in enumerate(CN_LIST, start=1):
        m = re.search(rf"^# {marker}(.*)$", text, re.MULTILINE)
        if not m:
            continue
        start = m.end()
        nxt = re.search(r"^# 第[一二三四五六七八九十卅]+講", text[start:], re.MULTILINE)
        body = text[start: start + nxt.start()] if nxt else text[start:]
        # split by ## subsections
        parts = re.split(r"^## (.+?)(?:\{#[^}]*\})?\s*$", body, flags=re.MULTILINE)
        sections = []
        # parts[0] = preamble before first ##
        if parts[0].strip():
            sections.append(("（開場）", parts[0].strip()))
        for i in range(1, len(parts) - 1, 2):
            title = re.sub(r"\s+", "", parts[i])
            sections.append((title, parts[i + 1].strip()))
        lectures[idx] = {"title": m.group(1).strip(), "sections": sections}
    return lectures


def score_sections(batch_text, sections, top_k=2, max_chars=5500):
    """Pick top-k subsections by char-bigram overlap with the batch text."""
    def bigrams(s):
        s = re.sub(r"[^\u4e00-\u9fff]", "", s)
        return set(s[i:i+2] for i in range(len(s) - 1))
    bg = bigrams(batch_text)
    scored = []
    for title, body in sections:
        inter = len(bg & bigrams(body))
        scored.append((inter, title, body))
    scored.sort(key=lambda x: -x[0])
    picked, total = [], 0
    for inter, title, body in scored[:top_k]:
        snippet = body[:max_chars - total]
        if len(snippet) < 100:
            continue
        picked.append(f"=== 底本〔{title}〕===\n{snippet}")
        total += len(snippet)
    return "\n\n".join(picked)


def get_active_endpoint():
    for ep in DEFAULT_ENDPOINTS:
        try:
            headers = {"Authorization": f"Bearer {ROUTER_AUTH_TOKEN}"} if "4001" in ep else {}
            req = urllib.request.Request(f"{ep}/models", headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    return ep
        except Exception:
            continue
    raise RuntimeError("No LLM endpoint reachable")


def query_llm(endpoint, system_prompt, user_prompt, temperature=0.0, max_tokens=4000):
    is_router = "4001" in endpoint
    payload = {
        "model": "primary" if is_router else "Qwen3.8-27B",
        "messages": [{"role": "system", "content": system_prompt},
                     {"role": "user", "content": user_prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    headers = {"Content-Type": "application/json"}
    if is_router:
        headers["Authorization"] = f"Bearer {ROUTER_AUTH_TOKEN}"
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(f"{endpoint}/chat/completions",
                                         data=json.dumps(payload).encode(), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=300) as resp:
                result = json.loads(resp.read().decode("utf-8", errors="replace"))
            return result["choices"][0]["message"]["content"]
        except Exception as e:
            if attempt < 3:
                print(f"      ⚠️ query_llm {attempt}/3: {e}", flush=True)
                time.sleep(3)
            else:
                raise


def build_segments(raw):
    """ASR verbose_json segments → sentences; merge tiny fragments, split paragraphs on gaps."""
    segs = [s for s in raw["segments"] if (s.get("text") or "").strip()]
    sentences = []
    for s in segs:
        txt = s["text"].strip().rstrip("。！？，、；：")
        if not txt:
            continue
        if sentences and s["start"] - sentences[-1]["end"] < 0.35 and len(sentences[-1]["text"]) < 60:
            sep = "" if re.search(r"[，、]$", sentences[-1]["text"]) else "，"
            sentences[-1]["text"] = sentences[-1]["text"] + sep + txt
            sentences[-1]["end"] = s["end"]
        else:
            sentences.append({"start": round(float(s["start"]), 2), "end": round(float(s["end"]), 2), "text": txt})
    # paragraphs: split on >=1.8s gap, cap ~12 sentences
    paragraphs, cur = [], []
    for s in sentences:
        if cur and (s["start"] - cur[-1]["end"] >= 1.8 or len(cur) >= 12):
            paragraphs.append(cur); cur = []
        cur.append(s)
    if cur:
        paragraphs.append(cur)
    return paragraphs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", required=True, help="01..32")
    ap.add_argument("--skip-proofread", action="store_true", help="schema build only")
    args = ap.parse_args()
    sid = args.session.zfill(2)
    n = int(sid)

    raw_file = ASR_DIR / f"session_{sid}_raw.json"
    if not raw_file.exists():
        sys.exit(f"missing {raw_file}")
    raw = load_json(raw_file)
    course = load_json(COURSE_FILE)
    meta = next(s for s in course["sessions"] if s["sessionId"] == sid)
    toc = load_json(TOC_FILE)
    toc_sec = next(s for s in toc["sections"] if s.get("sessionId") == sid)
    learned = load_json(LEARNED_FILE).get("global_terms", {})
    lectures = load_reference_lectures()
    if n not in lectures:
        sys.exit(f"reference lecture {n} not found in 成量品全文")
    ref = lectures[n]

    print(f"🛠️ session {sid} | 底本: 第{n}講「{ref['title']}」 {len(ref['sections'])} 節 | ASR {len(raw['segments'])} segs")

    # 1. schema
    para_sents = build_segments(raw)
    paragraphs = []
    for i, sents in enumerate(para_sents, start=1):
        paragraphs.append({
            "id": f"p_{i}",
            "heading": "",
            "start": sents[0]["start"],
            "end": sents[-1]["end"],
            "sentences": sents,
        })
    session_data = {
        "sessionId": sid,
        "title": meta["title"],
        "audioUrl": meta["audioUrl"],
        "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
        "paragraphs": paragraphs,
        "_meta": {"source": "whisper-gpu large-v3-turbo + 成量品全文 grounded calibration"},
    }

    all_sentences = [s["text"] for p in paragraphs for s in p["sentences"]]
    lookup = [(pi, si) for pi, p in enumerate(paragraphs) for si in range(len(p["sentences"]))]
    print(f"📖 {len(all_sentences)} sentences / {len(paragraphs)} paragraphs")

    # 2. deterministic pre-polish
    def prepolish(sents):
        fixes = 0
        out = []
        for s in sents:
            for typo, info in learned.items():
                pat = info.get("safe_regex", re.escape(typo))
                new_s, cnt = re.subn(pat, info["corrected"], s)
                if cnt:
                    s = new_s; fixes += cnt
            out.append(s)
        return out, fixes

    prepolished, pre_fixes = prepolish(all_sentences)
    print(f"⚡ pre-polish: {pre_fixes} deterministic fixes")

    glossary_lines = "\n".join(
        f"- 「{t}」➔「{info['corrected']}」（{info.get('category','')}）"
        for t, info in sorted(learned.items(), key=lambda kv: -len(kv[0])))

    # 3. LLM proofreading
    review_items = []
    if not args.skip_proofread:
        endpoint = get_active_endpoint()
        print(f"✍️ proofreading via {endpoint} (batch=20)...")
        batch_size = 20
        results = []
        for i in range(0, len(prepolished), batch_size):
            batch = prepolished[i:i+batch_size]
            ctx = score_sections("".join(batch), ref["sections"])
            sys_prompt = f"""你是一位精通藏傳佛教格魯派因明（釋量論）的佛學義理審校專家，專精法稱論師《釋量論·第二品·成量品》（法尊法師譯本）與如性法師的課堂開示。
當前任務：深度校對如性法師《釋量論第二品》第 {n} 講（{ref['title']}）錄音逐字稿。

【底本參考原文（同講段落，節選）】：
---
{ctx}
---

【高頻同音校對規則庫（確定性規則，優先套用）】：
{glossary_lines}

【校對核心原則】：
1. 名相與引文第一優先：論典原頌（如「量士夫」「集量論禮讚文」、四諦十六行相、因三相）嚴格對照底本還原，加書名號與標點。
2. 因明術語同音錯字修正範例：量士夫/亮士夫、現量/現亮、比量/比亮、再決知/在決知、義共相/意共相、近取因/近取音、增上緣/增上原、無欺誑/無期狂、顛倒/巔倒、伺察/四察、周遍/周邊、俱生/據生、薩迦耶見/薩甲耶見、諦實/地實、無明/五米、聲聞/生文、應成/應層、自續/自取。
3. 保留如性法師口語開示語氣與啟發式提問（「這樣了解嗎？」「對不對？」），切勿改寫為書面論文。
4. 依底本消除法義邏輯衝突：若同音字導致法義與底本矛盾（如「常」與「無常」、「自相」與「共相」互誤），依底本脈絡修正。
5. 存疑標記：語意急促或多解難以確證時，句首加「[REVIEW: 原因]」，供人耳聽音核定。
6. 【輸出規範】：輸入 N 句，必須返回恰好 N 個字串的 JSON 陣列，不可合併、刪減或遺漏。
"""
            user_prompt = f"請依據底本校對以下 {len(batch)} 句，返回相同長度的 JSON 字串陣列：\n" + json.dumps(batch, ensure_ascii=False)
            raw_out = query_llm(endpoint, sys_prompt, user_prompt)
            m = re.search(r"\[.*\]", raw_out, re.DOTALL)
            parsed = None
            if m:
                try:
                    parsed = json.loads(m.group(0))
                except Exception:
                    parsed = None
            if parsed and len(parsed) == len(batch):
                results.extend(parsed)
            else:
                print(f"   ⚠️ batch {i//batch_size+1} count mismatch, keeping prepolished")
                results.extend(batch)
            print(f"   • {min(i+batch_size, len(prepolished))}/{len(prepolished)}", flush=True)

        results, post_fixes = prepolish(results)
        print(f"🛡️ post-polish guard: {post_fixes} residual fixes")

        for idx, (pi, si) in enumerate(lookup):
            s_obj = paragraphs[pi]["sentences"][si]
            old_t = s_obj["text"]
            raw_new = results[idx]
            rm = re.match(r"^\[(?:REVIEW|存疑)[:：]?\s*(.*?)\]\s*(.*)$", raw_new)
            if rm:
                reason, clean = rm.groups()
                s_obj["text"] = clean.strip() or old_t
                s_obj["reviewNeeded"] = True
                s_obj["uncertainty"] = f"【存疑標記】{reason.strip() or '模型主動標註存疑'}"
                review_items.append({"session_id": sid, "sentence_idx": idx, "start": s_obj["start"],
                                     "asr_text": old_t, "proposal": s_obj["text"], "reason": s_obj["uncertainty"]})
            else:
                s_obj["text"] = raw_new
    else:
        for idx, (pi, si) in enumerate(lookup):
            paragraphs[pi]["sentences"][si]["text"] = prepolished[idx]

    # 4. heading anchoring to 題綱 children
    child_titles = [c["title"] for c in toc_sec["children"]]
    previews = "\n".join(
        f"[{p['id']} | {int(p['start']//60):02d}:{int(p['start']%60):02d}] " +
        "".join(s["text"] for s in p["sentences"])[:80]
        for p in paragraphs[::max(1, len(paragraphs)//45)])
    anchor_prompt = f"""以下是如性法師《釋量論第二品》第 {n} 講（{ref['title']}）逐字稿段落預覽（含段落 ID 與時間）。
本講的章節大綱（題綱，順序固定，不可增刪）：
{chr(10).join(f'{i+1}. {t}' for i, t in enumerate(child_titles))}

請將每個章節標題錨定到它開始講述的段落 ID。規則：順序必須與大綱一致；第一節通常從 p_1 開始；只輸出 JSON。
輸出格式：{{"anchors": [{{"title": "...", "paragraphId": "p_N"}}], "summary": "一句話講次精要"}}

段落預覽：
{previews}
"""
    endpoint = get_active_endpoint()
    anchor_raw = query_llm(endpoint, "你是因明課程段落錨定助手，只輸出 JSON。", anchor_prompt, max_tokens=1200)
    am = re.search(r"\{.*\}", anchor_raw, re.DOTALL)
    anchors = None
    if am:
        try:
            anchors = json.loads(am.group(0))
        except Exception:
            anchors = None
    if anchors and anchors.get("anchors"):
        pid_index = {p["id"]: i for i, p in enumerate(paragraphs)}
        pos = 0
        for a in anchors["anchors"]:
            t = a.get("title", "")
            pid = a.get("paragraphId", "")
            # match to child title (fuzzy contains)
            ct = next((c for c in child_titles if c and (c in t or t in c or c[:6] in t)), None)
            if not ct or pid not in pid_index:
                continue
            target = pid_index[pid]
            if target < pos:
                continue
            pos = target
            paragraphs[target]["heading"] = ct
            for c in toc_sec["children"]:
                if c["title"] == ct and not c.get("timestamp"):
                    c["timestamp"] = paragraphs[target]["start"]
        meta["summary"] = anchors.get("summary") or meta.get("summary", "")
    print(f"🧭 headings anchored: {sum(1 for p in paragraphs if p['heading'])}/{len(child_titles)}")

    # 5. save
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    save_json(SESSIONS_DIR / f"session_{sid}.json", session_data)
    save_json(TOC_FILE, toc)
    save_json(COURSE_FILE, course)
    if review_items:
        rq = ROOT / "reports" / f"review_queue_pramana2_{sid}.json"
        rq.parent.mkdir(exist_ok=True)
        save_json(rq, {"session_id": sid, "generated_at": datetime.now().isoformat(timespec="seconds"),
                       "review_count": len(review_items), "items": review_items})
    print(f"✅ session_{sid}.json written | {len(review_items)} review items")


if __name__ == "__main__":
    main()
