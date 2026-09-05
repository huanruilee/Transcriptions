#!/usr/bin/env python3
"""
scripts/llm_deep_calibrate_session.py

Deep Grounded Proofreading & Doctrinal Outline Calibration Engine.
Combines:
1. Source text physical boundary detection (eliminates premature outline jumps)
2. Domain-specific Tibetan Buddhist homophone correction (無明, 實執, 諦實, 聲聞, 消文, etc.)
3. Strict sentence-by-sentence proofreading
4. Grounded heading generation and course metadata synchronization.
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
COURSE_DIR = ROOT / "courses" / "入中論善顯密意疏"
SOURCE_DIR = COURSE_DIR / "source_text"
SESSIONS_DIR = COURSE_DIR / "sessions"
TOC_FILE = COURSE_DIR / "toc.json"
COURSE_FILE = COURSE_DIR / "course.json"

DEFAULT_ENDPOINTS = [
    "http://127.0.0.1:14001/v1",       # Smart Router via local Mac SSH tunnel (GX10 port 4001)
    "http://127.0.0.1:4001/v1",        # Smart Router direct on GX10 host
    "http://127.0.0.1:18001/v1",       # Direct vLLM fallback via Mac SSH tunnel (GX10 port 8001)
    "http://192.168.122.1:8001/v1",     # Direct vLLM on GX10 host
    "http://127.0.0.1:8001/v1",         # Direct local vLLM on GX10
]

ROUTER_AUTH_TOKEN = os.environ.get(
    "ROUTER_API_KEY",
    "gx10-c6a5ae95f47bb838fff310e20cf22e6488a0a7b9ff32290d4d864f5d6f2110f5"
)

LEARNED_FILE = COURSE_DIR / "learned_corrections.json"

def load_learned_lexicon():
    """Dynamically load active learned Buddhist terms from learned_corrections.json."""
    if not LEARNED_FILE.exists():
        return {}
    with open(LEARNED_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("global_terms", {})

def build_dynamic_glossary_rules(learned_terms):
    """Compile learned terms into a high-density structured prompt for local 27B."""
    lines = [
        "【全庫活態佛學名相高頻同音校對規則庫（動態自 learned_corrections.json 載入）】："
    ]
    cats = {}
    for typo, info in learned_terms.items():
        cat = info.get("category", "佛學名相")
        cats.setdefault(cat, []).append((typo, info.get("corrected", ""), info.get("reasoning", "")))

    for cat, items in sorted(cats.items()):
        lines.append(f"• [{cat}]：")
        for typo, corr, reason in items:
            desc = f"（{reason}）" if reason else ""
            lines.append(f"  - 「{typo}」 ➔ 校正為「{corr}」{desc}")
    return "\n".join(lines)

def deterministic_prepolish_sentences(sentences, learned_terms):
    """0-Token deterministic CPU pre-polishing of obvious Buddhist term homophones."""
    prepolished = []
    total_pre_fixes = 0
    for s in sentences:
        new_s = s
        for typo, info in learned_terms.items():
            corrected = info.get("corrected")
            safe_regex = info.get("safe_regex", re.escape(typo))
            if typo in new_s or re.search(safe_regex, new_s):
                subbed, count = re.subn(safe_regex, corrected, new_s)
                if count > 0:
                    new_s = subbed
                    total_pre_fixes += count
        prepolished.append(new_s)
    return prepolished, total_pre_fixes

def get_active_endpoint():
    token = ROUTER_AUTH_TOKEN
    for ep in DEFAULT_ENDPOINTS:
        try:
            headers = {}
            if "4001" in ep or "14001" in ep:
                headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(f"{ep}/models", headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    return ep
        except Exception:
            continue
    raise RuntimeError("Cannot connect to Smart Router or GX10 endpoint.")

def query_llm(endpoint, system_prompt, user_prompt, temperature=0.0, max_tokens=4000, api_key=None):
    is_smart_router = ("4001" in endpoint or "14001" in endpoint)
    model_name = "primary" if is_smart_router else "Qwen3.8-27B"

    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "chat_template_kwargs": {"enable_thinking": False}
    }

    headers = {"Content-Type": "application/json"}
    token = api_key or ROUTER_AUTH_TOKEN
    if token and is_smart_router:
        headers["Authorization"] = f"Bearer {token}"

    data = json.dumps(payload).encode("utf-8")
    for attempt in range(1, 4):
        req = urllib.request.Request(
            f"{endpoint}/chat/completions",
            data=data,
            headers=headers,
            method="POST"
        )
        start_t = time.time()
        try:
            with urllib.request.urlopen(req, timeout=240) as resp:
                raw_bytes = resp.read()
                result = json.loads(raw_bytes.decode("utf-8", errors="replace"))
                elapsed = time.time() - start_t
                model_used = result.get("model", model_name)
                usage = result.get("usage", {})
                comp_toks = usage.get("completion_tokens", 0)
                print(f"      ⚡ [Router: {model_used} | {comp_toks} tokens | {elapsed:.2f}s]")
                return result["choices"][0]["message"]["content"]
        except Exception as e:
            if attempt < 3:
                print(f"      ⚠️ [query_llm attempt {attempt}/3] {e}, retrying in 3s...", flush=True)
                time.sleep(3)
            else:
                raise e

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

def extract_source_pages(page_num, window=2):
    pages_text = []
    start_p = max(1, page_num - window)
    end_p = min(285, page_num + window)
    for p in range(start_p, end_p + 1):
        p_file = SOURCE_DIR / f"page_{p:03d}.txt"
        if p_file.exists():
            pages_text.append(f"=== 《善顯密意疏》第 {p} 頁 ===\n" + p_file.read_text(encoding="utf-8"))
    return "\n\n".join(pages_text), start_p, end_p

def deep_proofread_session(session_id, endpoint, fix_typos=True):
    print(f"\n=================================================================")
    print(f"🛠️ DEEP SEMANTIC CALIBRATION & PROOFREADING: Session {session_id}")
    print(f"=================================================================")

    session_file = SESSIONS_DIR / f"session_{session_id}.json"
    session_data = load_json(session_file)
    course_data = load_json(COURSE_FILE)
    session_meta = next((s for s in course_data["sessions"] if s["sessionId"] == session_id), None)
    if not session_meta:
        raise ValueError(f"Session {session_id} not found in course.json")

    page_range = session_meta.get("pageRange", "p.101")
    p_match = re.search(r"\d+", page_range)
    page_num = int(p_match.group(0)) if p_match else 101

    source_context, start_p, end_p = extract_source_pages(page_num, window=2)

    # 1. Step 1: Text Proofreading (Batch sentences)
    all_sentences = []
    sentence_lookup = []
    for p_idx, p in enumerate(session_data.get("paragraphs", [])):
        for s_idx, s in enumerate(p.get("sentences", [])):
            all_sentences.append(s.get("text", ""))
            sentence_lookup.append((p_idx, s_idx))

    print(f"📖 Loaded {len(all_sentences)} sentences across {len(session_data['paragraphs'])} paragraphs.")

    learned_terms = load_learned_lexicon()
    dynamic_glossary_rules = build_dynamic_glossary_rules(learned_terms)
    print(f"📚 Dynamically loaded {len(learned_terms)} active Buddhist glossary rules from learned_corrections.json")

    # 0-Token CPU Deterministic Pre-polishing
    prepolished_sentences, pre_fixes = deterministic_prepolish_sentences(all_sentences, learned_terms)
    if pre_fixes > 0:
        print(f"⚡ [0-Token Pre-polish] Applied {pre_fixes} deterministic corrections via learned_corrections.json in 0.01s!")

    if fix_typos:
        print("✍️ Performing Grounded Dual-Track Proofreading on GX10 (40 sentences per batch)...")
        batch_size = 40
        proofread_results = []
        for i in range(0, len(prepolished_sentences), batch_size):
            batch = prepolished_sentences[i:i+batch_size]
            print(f"   • Proofreading sentences {i+1} ~ {min(i+batch_size, len(prepolished_sentences))}...")

            sys_prompt = f"""你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》、月稱菩薩《入中論》與四部宗義的佛學總編輯。
當前任務為深度校對見悲青增格西第 {session_id} 堂錄音逐字稿。

【底本參考原文（第 {start_p}～{end_p} 頁）】：
---
{source_context}
---

{dynamic_glossary_rules}

【校對原則】：
1. 嚴格修正所有佛學名相與同音訛字（如五米➔無明、石子➔實執、假信➔假性、地實➔諦實、世論➔《釋論》、生文➔聲聞、消聞➔消文、皮活沙/皮革沙➔毘婆沙、撒家眼見➔薩迦耶見、長一自在我空➔常一自在我空、十有空➔實有空、中大師➔宗大師等）。
2. 保留見悲青增格西講課的白話開示語氣與口語助詞（如「對不對」、「這樣可以嗎」），切勿改寫為古文文言。
3. 【存疑標記規範】：若遇到錄音語意急促、口語中斷（如『什麼什麼』、『折什麼』、『再什麼』）、或字音存在多種可能性而難以確證時，請在該句開頭加上「[REVIEW: 存疑原因]」，例如：「[REVIEW: 口語停頓『什麼什麼空』，對照底本疑為『實質空』] 總之 他講的是這個了...」。此標註將無縫呈現在網頁 UI 上供人耳聽音核定。
4. 【極重要輸出規範】：輸入有 N 句話，必須返回剛好相同數量的 JSON 字串陣列 `["句子1", "句子2", ...]`，絕不可合併、刪減或遺漏句子！
"""
            user_prompt = f"請依據底本校對以下 {len(batch)} 個句子，返回相同長度的 JSON 字串陣列：\n" + json.dumps(batch, ensure_ascii=False, indent=2)

            raw = query_llm(endpoint, sys_prompt, user_prompt, temperature=0.0, max_tokens=4000)
            m = re.search(r'\[.*\]', raw, re.DOTALL)
            if not m:
                print(f"⚠️ Warning: Failed to parse batch JSON, keeping prepolished text.")
                proofread_results.extend(batch)
            else:
                try:
                    corrected_batch = json.loads(m.group(0))
                except Exception as ex:
                    print(f"⚠️ Warning: JSON decode error ({ex}), keeping prepolished text.")
                    corrected_batch = None

                if corrected_batch and len(corrected_batch) == len(batch):
                    proofread_results.extend(corrected_batch)
                else:
                    count_str = len(corrected_batch) if corrected_batch else "None"
                    print(f"⚠️ Warning: Batch count mismatch ({count_str} != {len(batch)}), falling back to prepolished.")
                    proofread_results.extend(batch)
        # Defensive Post-Polish Guard (ensures no LLM output reverts known learned homophones)
        proofread_results, post_fixes = deterministic_prepolish_sentences(proofread_results, learned_terms)
        if post_fixes > 0:
            print(f"🛡️ [Post-Polish Defensive Guard] Cleaned {post_fixes} residual homophones from LLM output!")

        # Apply proofread sentences back & collect review queue
        modified_count = 0
        review_queue = []
        web_review_queue = []

        for idx, (p_i, s_i) in enumerate(sentence_lookup):
            if idx < len(proofread_results):
                old_t = session_data["paragraphs"][p_i]["sentences"][s_i]["text"]
                raw_new_t = proofread_results[idx]
                s_obj = session_data["paragraphs"][p_i]["sentences"][s_i]

                # Check if flagged for review
                review_match = re.match(r'^\[(?:REVIEW|存疑)[:：]?\s*(.*?)\]\s*(.*)$', raw_new_t)
                if review_match:
                    reason, clean_new_t = review_match.groups()
                    new_t = clean_new_t.strip() or old_t
                    reason_clean = reason.strip() or "模型主動標註存疑"
                    s_obj["reviewNeeded"] = True
                    s_obj["uncertainty"] = f"【存疑標記】{reason_clean}"

                    ctx_before = session_data["paragraphs"][p_i]["sentences"][s_i-1]["text"] if s_i > 0 else ""
                    ctx_after = session_data["paragraphs"][p_i]["sentences"][s_i+1]["text"] if s_i < len(session_data["paragraphs"][p_i]["sentences"])-1 else ""
                    start_t = s_obj.get("start", 0)
                    end_t = s_obj.get("end", 0)

                    item = {
                        "session_id": session_id,
                        "sentence_idx": idx,
                        "start": start_t,
                        "end": end_t,
                        "asr_text": old_t,
                        "local_proposal": new_t,
                        "uncertainty_reason": s_obj["uncertainty"],
                        "context_before": ctx_before,
                        "context_after": ctx_after,
                        "page_ref": page_range,
                        "audio_url": session_data.get("audioUrl", "")
                    }
                    review_queue.append(item)
                    web_review_queue.append({
                        "sessionId": session_id,
                        "sentenceIndex": idx,
                        "audioUrl": session_data.get("audioUrl", ""),
                        "clipStart": max(0, start_t - 1.0),
                        "clipEnd": start_t + 3.0,
                        "asrText": old_t,
                        "proposal": new_t,
                        "reason": s_obj["uncertainty"],
                        "pageRef": page_range
                    })
                else:
                    new_t = raw_new_t

                if old_t != new_t:
                    modified_count += 1
                    session_data["paragraphs"][p_i]["sentences"][s_i]["text"] = new_t

        print(f"✅ Text proofreading complete! Corrected {modified_count} sentences (plus {pre_fixes} CPU pre-fixes).")
        if review_queue:
            REPORTS_DIR = ROOT / "reports"
            REPORTS_DIR.mkdir(parents=True, exist_ok=True)
            q_file = REPORTS_DIR / f"review_queue_{session_id}.json"
            web_q_file = REPORTS_DIR / f"web_review_{session_id}.json"
            q_data = {
                "session_id": session_id,
                "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_sentences": len(all_sentences),
                "review_count": len(review_queue),
                "items": review_queue
            }
            with open(q_file, "w", encoding="utf-8") as f:
                json.dump(q_data, f, ensure_ascii=False, indent=2)
            with open(web_q_file, "w", encoding="utf-8") as f:
                json.dump(web_review_queue, f, ensure_ascii=False, indent=2)
            print(f"⚠️ [GX10 Web Review Markers] Embedded {len(review_queue)} uncertainty markers into session JSON & exported to {q_file} & {web_q_file}!")

    # 2. Step 2: Doctrinal Outline & Kepan Grounding
    print("\n🧭 Step 2: Grounded Doctrinal Outline & Boundary Analysis...")
    sample_paragraphs = []
    for idx, p in enumerate(session_data.get("paragraphs", [])):
        p_id = p.get("id", f"p_{idx+1}")
        sents = p.get("sentences", [])
        if not sents:
            continue
        start_ts = sents[0].get("start", 0)
        full_p_text = "".join(s.get("text", "") for s in sents)
        sample_paragraphs.append({
            "idx": idx,
            "id": p_id,
            "start": round(start_ts, 2),
            "preview": full_p_text[:120]
        })

    sample_summary = "\n".join(
        f"[{p['id']} | {int(p['start']//60):02d}:{int(p['start']%60):02d} | {p['start']}s] {p['preview']}..."
        for p in sample_paragraphs[::max(1, len(sample_paragraphs)//40)]
    )

    outline_sys_prompt = f"""你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》的佛學專家。
當前任務為校對見悲青增格西第 {session_id} 講的科判歸屬與章節小標題。

【底本參考原文（第 {start_p}～{end_p} 頁）】：
---
{source_context}
---

【經論物理行號剛性規範（絕不可違背）】：
- 《善顯密意疏》科判物理邊界：
  * 「亥一、正義」：始於 p.100 根本頌「癡障性故名世俗...」，止於 p.103 第 6 行「反應見為虛妄也」。
  * 「亥二、釋煩惱不共建立」：始於 p.103 第 8 行「此宗明煩惱有不共理...」，止於 p.105 第 6 行「是不了義」。
  * 「戌二、三類補特伽羅見不見世俗之理」：始於 p.105 第 7 行「又此諸法於凡夫前...」。
- 【邊界防呆原則】：
  * 審視該講最後一段消文停在哪一頁哪一行。
  * 若最後一句尚未讀到「此宗明煩惱有不共理」，則該講【絕不可】標註為「亥二」，嚴禁超前給出未講之大科！
  * 若尚未讀到 p.105「又此諸法於凡夫前」，【絕不可】標註為「戌二」！

【標題規範】：
- 輸出 6～10 個段落小標題，格式必須嚴格為 `【類別】說明`。
- 類別限於：【科判導讀】、【經論引證】、【名相辨析】、【正理抉擇】、【格西要旨】、【中觀釋難】、【研讀總結】。
- 必須錨定在法師轉折論述的段落 ID。
- 【極重要】：請保持精簡，嚴格輸出 6～8 個 headings 小標題，禁止生成冗長解說，確保 JSON 在 800 tokens 內完整閉合！

輸出純 JSON 格式：
{{
  "activeKepanNodes": [
    {{
      "nodeTitle": "完整科判名稱（如：申三、別釋二諦體 > 酉一、釋世俗諦 > 戌一、明於何世俗前為諦何前不諦 > 亥一、正義）",
      "timestamp": 0,
      "page": 100
    }}
  ],
  "headings": [
    {{
      "paragraphId": "p_1",
      "timestamp": 0.5,
      "heading": "【類別】說明"
    }}
  ],
  "summary": "一句話講次精要（符合實際講授之大科）"
}}
"""
    outline_user_prompt = f"請依據以上物理邊界與底本原文，分析第 {session_id} 講逐字稿代表段落：\n" + sample_summary

    outline_raw = query_llm(endpoint, outline_sys_prompt, outline_user_prompt, temperature=0.0, max_tokens=2500)
    m = re.search(r'\{.*\}', outline_raw, re.DOTALL)
    outline_data = None
    if m:
        try:
            outline_data = json.loads(m.group(0))
        except Exception as ex:
            print(f"⚠️ Warning: Outline JSON parse error ({ex}), applying graceful outline fallback.")

    if not outline_data:
        outline_data = {
            "headings": [
                {"paragraphId": "p_1", "timestamp": 0.5, "heading": f"【科判導讀】第 {session_id} 堂經論開示研讀"}
            ],
            "summary": f"第 {session_id} 堂經論義理研讀與中觀正理抉擇。"
        }

    # Apply headings
    heading_map = {h["paragraphId"]: h["heading"] for h in outline_data.get("headings", [])}
    for p in session_data.get("paragraphs", []):
        pid = p.get("id")
        if pid in heading_map:
            p["heading"] = heading_map[pid]
    now_dt = datetime.now()
    session_data["lastUpdated"] = now_dt.strftime("%Y-%m-%d")
    if "_meta" not in session_data:
        session_data["_meta"] = {}
    session_data["_meta"]["last_updated"] = now_dt.strftime("%Y-%m-%d")
    session_data["_meta"]["processed_at"] = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    session_data["_meta"]["llm_proofread"] = "Smart Router (GX10 Qwen3.8-27B Grounded + Antigravity Tiered Review)"

    save_json(session_file, session_data)
    print(f"✅ Applied {len(heading_map)} calibrated headings to {session_file.name}")

    # Synchronize course.json
    orig_summary = session_meta.get("summary", "")
    ai_summary = outline_data.get("summary", orig_summary)
    if " ・ " in orig_summary:
        prefix = orig_summary.split(" ・ ")[0]
        if prefix not in ai_summary:
            session_meta["summary"] = f"{prefix} ・ {ai_summary}"
        else:
            session_meta["summary"] = ai_summary
    elif any(k in orig_summary for k in ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛"]):
        session_meta["summary"] = f"{orig_summary} ・ {ai_summary}"
    else:
        session_meta["summary"] = ai_summary

    session_meta["title"] = f"第 {session_meta.get('sessionNum')}{session_meta.get('subSession')} 堂 ({session_meta.get('periodLabel')}) | {session_meta.get('date')} | p.{page_num}"
    session_meta["sidebarLabel"] = f"（{session_id}）{session_meta.get('date').replace('-','')} 第六現前地p.{page_num}"
    save_json(COURSE_FILE, course_data)
    print(f"✅ Synchronized course.json metadata for {session_id}")

    # Synchronize toc.json
    toc_data = load_json(TOC_FILE)
    active_nodes = outline_data.get("activeKepanNodes", [])

    def clean_title(t):
        return re.sub(r'^[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥][一二三四五六七八九十百\d]+[、.\s]*', '', t).strip()

    def update_toc(nodes):
        for n in nodes:
            n_page = n.get("page", 0)
            n_norm = clean_title(n.get("title", ""))
            for an in active_nodes:
                an_title = an.get("nodeTitle", "").split(">")[-1].strip()
                an_norm = clean_title(an_title)
                if abs(n_page - an.get("page", page_num)) <= 3 and n_norm == an_norm:
                    sids = n.setdefault("sessionIds", [])
                    if session_id not in sids:
                        sids.append(session_id)
            nums = [int(re.findall(r'\d+', s)[0]) for s in n.get("sessionIds", []) if re.findall(r'\d+', s)]
            if len(nums) >= 2 and (max(nums) - min(nums) > 20):
                n["needsReview"] = True
                n["reviewStatus"] = "needs_review"
            if n.get("children"):
                update_toc(n["children"])

    update_toc(toc_data.get("sections", []))
    save_json(TOC_FILE, toc_data)
    print(f"✅ Synchronized toc.json for {session_id}")

    print("\n🎉 Deep semantic calibration complete!")
    print(f"• Summary: {session_meta['summary']}")
    print(f"• Headings count: {len(heading_map)}")
    for h in outline_data.get("headings", []):
        print(f"  - [{h['paragraphId']} | {h['timestamp']}s] {h['heading']}")

def main():
    parser = argparse.ArgumentParser(description="Deep Grounded Proofreading & Calibration")
    parser.add_argument("--session", type=str, required=True, help="Session ID (e.g. 31B)")
    args = parser.parse_args()

    endpoint = get_active_endpoint()
    print(f"🔌 Connected to GX10 endpoint: {endpoint}")
    deep_proofread_session(args.session, endpoint)

if __name__ == "__main__":
    main()
