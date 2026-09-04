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

ROOT = Path(__file__).resolve().parent.parent
COURSE_DIR = ROOT / "courses" / "入中論善顯密意疏"
SOURCE_DIR = COURSE_DIR / "source_text"
SESSIONS_DIR = COURSE_DIR / "sessions"
TOC_FILE = COURSE_DIR / "toc.json"
COURSE_FILE = COURSE_DIR / "course.json"

DEFAULT_ENDPOINTS = [
    "http://127.0.0.1:18001/v1",       # Local Mac SSH tunnel
    "http://192.168.122.1:8001/v1",     # Direct on GX10 host
    "http://127.0.0.1:8001/v1",         # Direct local on GX10
]

BUDDHIST_GLOSSARY_RULES = """
【格魯派佛學高頻同音錯字校對規則庫】：
- 「五米/五明」在談及惑業、煩惱、實執時 ➔ 校正為「無明」
- 「地/地實/聲一地/世俗地」 ➔ 校正為「諦/諦實/勝義諦/世俗諦」
- 「假信/假性」 ➔ 校正為「假性」（如「唯是假性」）
- 「石子/食指/實指」在談及執著時 ➔ 校正為「實執」（如「以無實執故」）
- 「生文/聲聞」 ➔ 校正為「聲聞」（如「聲聞、獨覺、菩薩」）
- 「消聞/消文」在談及依疏講述時 ➔ 校正為「消文」
- 「七弟/七地」 ➔ 校正為「七地」
- 「實諦/十地」在談及菩薩位階時 ➔ 校正為「十地」
- 「世論/釋論」 ➔ 校正為「《釋論》」
- 「現正/現證」在談及空性真實義時 ➔ 校正為「現證」
- 「髒斃/藏幣/障蔽」 ➔ 校正為「障蔽」
- 「自信/自性」在談及本性、無自性時 ➔ 校正為「自性」
- 「幻花/幻化」 ➔ 校正為「幻化」
- 「巨生/俱生」 ➔ 校正為「俱生」
- 「一段無名者/已斷無明者」 ➔ 校正為「已斷無明者」
- 「知世俗前/之世俗前」 ➔ 校正為「之世俗前」
- 「皆限為諦/皆現為諦」 ➔ 校正為「皆現為諦」
- 「明眼識」 ➔ 校正為「名言識」（如「一般正常人的名言識前面不是諦」）
- 「佔物無明」 ➔ 校正為「染污無明」（如「由染污無明增上之力安立世俗諦」）
- 「十二元緊」 ➔ 校正為「十二緣起」
- 「有之所設」 ➔ 校正為「有支所攝」（如「此由有支所攝染污無明增上之力」）
- 「實子無明」 ➔ 校正為「實執無明」
- 「憑子老/憑衣等」 ➔ 校正為「瓶衣等」（如「非說像瓶衣等這些世俗諦」）
- 「慧解太初」 ➔ 校正為「慧解太粗」
- 「精進地菩薩」 ➔ 校正為「清淨地菩薩」（如「清淨地菩薩、八地九地十地清淨地」）
- 「心跟敬」 ➔ 校正為「心境二義」
- 「此女兒太無關係」 ➔ 校正為「此能立太無關係」（因明能立與所立）
"""

def get_active_endpoint():
    for ep in DEFAULT_ENDPOINTS:
        try:
            req = urllib.request.Request(f"{ep}/models", method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    return ep
        except Exception:
            continue
    raise RuntimeError("Cannot connect to GX10 Qwen3.8-27B endpoint.")

def query_llm(endpoint, system_prompt, user_prompt, temperature=0.0, max_tokens=4000):
    payload = {
        "model": "Qwen3.8-27B",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "chat_template_kwargs": {"enable_thinking": False}
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{endpoint}/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        return result["choices"][0]["message"]["content"]

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

    if fix_typos:
        print("✍️ Performing Grounded Dual-Track Proofreading (50 sentences per batch)...")
        batch_size = 40
        proofread_results = []
        for i in range(0, len(all_sentences), batch_size):
            batch = all_sentences[i:i+batch_size]
            print(f"   • Proofreading sentences {i+1} ~ {min(i+batch_size, len(all_sentences))}...")

            sys_prompt = f"""你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與月稱菩薩《入中論》的佛學總編輯。
當前任務為校對見悲青增格西第 {session_id} 堂錄音逐字稿。

【底本參考原文（第 {start_p}～{end_p} 頁）】：
---
{source_context}
---

{BUDDHIST_GLOSSARY_RULES}

【校對原則】：
1. 嚴格修正所有佛學名相與同音訛字（如五米➔無明、石子➔實執、假信➔假性、地實➔諦實、世論➔《釋論》、生文➔聲聞、消聞➔消文等）。
2. 保留見悲青增格西講課的白話開示語氣與口語助詞（如「對不對」、「這樣可以嗎」），切勿改寫為古文文言。
3. 若對某句修正缺乏充分把握、或口語與底本法義嚴重衝突，請在該句開頭加上「[REVIEW: 存疑原因]」，後續將由高級專家大模型深度會診。
4. 【極重要輸出規範】：輸入有 N 句話，必須返回剛好相同數量的 JSON 字串陣列 `["句子1", "句子2", ...]`，絕不可合併、刪減或遺漏句子！
"""
            user_prompt = f"請依據底本校對以下 {len(batch)} 個句子，返回相同長度的 JSON 字串陣列：\n" + json.dumps(batch, ensure_ascii=False, indent=2)

            raw = query_llm(endpoint, sys_prompt, user_prompt, temperature=0.0, max_tokens=4000)
            m = re.search(r'\[.*\]', raw, re.DOTALL)
            if not m:
                print(f"⚠️ Warning: Failed to parse batch JSON, keeping original text.")
                proofread_results.extend(batch)
            else:
                corrected_batch = json.loads(m.group(0))
                if len(corrected_batch) == len(batch):
                    proofread_results.extend(corrected_batch)
                else:
                    print(f"⚠️ Warning: Batch count mismatch ({len(corrected_batch)} != {len(batch)}), falling back to original.")
                    proofread_results.extend(batch)

        # Apply proofread sentences back & collect review queue
        modified_count = 0
        review_queue = []

        for idx, (p_i, s_i) in enumerate(sentence_lookup):
            if idx < len(proofread_results):
                old_t = session_data["paragraphs"][p_i]["sentences"][s_i]["text"]
                raw_new_t = proofread_results[idx]
                s_obj = session_data["paragraphs"][p_i]["sentences"][s_i]

                # Check if flagged for review
                review_match = re.match(r'^\[(?:REVIEW|存疑)[:：]?\s*(.*?)\]\s*(.*)$', raw_new_t)
                if review_match:
                    reason, clean_new_t = review_match.groups()
                    new_t = clean_new_t or old_t
                    ctx_before = session_data["paragraphs"][p_i]["sentences"][s_i-1]["text"] if s_i > 0 else ""
                    ctx_after = session_data["paragraphs"][p_i]["sentences"][s_i+1]["text"] if s_i < len(session_data["paragraphs"][p_i]["sentences"])-1 else ""
                    review_queue.append({
                        "session_id": session_id,
                        "sentence_idx": idx,
                        "start": s_obj.get("start", 0),
                        "end": s_obj.get("end", 0),
                        "asr_text": old_t,
                        "local_proposal": new_t,
                        "uncertainty_reason": reason or "模型主動標註存疑",
                        "context_before": ctx_before,
                        "context_after": ctx_after,
                        "page_ref": page_range,
                        "audio_url": session_data.get("audioUrl", "")
                    })
                else:
                    new_t = raw_new_t

                if old_t != new_t:
                    modified_count += 1
                    session_data["paragraphs"][p_i]["sentences"][s_i]["text"] = new_t

        print(f"✅ Text proofreading complete! Corrected {modified_count} sentences.")
        if review_queue:
            REPORTS_DIR = ROOT / "reports"
            REPORTS_DIR.mkdir(parents=True, exist_ok=True)
            q_file = REPORTS_DIR / f"review_queue_{session_id}.json"
            q_data = {
                "session_id": session_id,
                "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_sentences": len(all_sentences),
                "review_count": len(review_queue),
                "items": review_queue
            }
            with open(q_file, "w", encoding="utf-8") as f:
                json.dump(q_data, f, ensure_ascii=False, indent=2)
            print(f"⚠️ [Tier 2 Escalation] Detected {len(review_queue)} uncertain sentences. Exported to {q_file} for High-Tier Review!")

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

    outline_raw = query_llm(endpoint, outline_sys_prompt, outline_user_prompt, temperature=0.0)
    m = re.search(r'\{.*\}', outline_raw, re.DOTALL)
    if not m:
        raise ValueError(f"Failed to parse outline JSON:\n{outline_raw}")

    outline_data = json.loads(m.group(0))

    # Apply headings
    heading_map = {h["paragraphId"]: h["heading"] for h in outline_data.get("headings", [])}
    for p in session_data.get("paragraphs", []):
        pid = p.get("id")
        if pid in heading_map:
            p["heading"] = heading_map[pid]
        elif "heading" in p:
            del p["heading"]

    save_json(session_file, session_data)
    print(f"✅ Applied {len(heading_map)} calibrated headings to {session_file.name}")

    # Synchronize course.json
    session_meta["summary"] = outline_data.get("summary", session_meta.get("summary"))
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
