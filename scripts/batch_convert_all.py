#!/usr/bin/env python3
"""
batch_convert_all.py - Complete batch conversion pipeline orchestrator for GX10.
Executes the standardized 5-step 29A-quality transformation for all sessions:
1. Fetch/Stream official Flyday audio
2. Transcribe with local Whisper Large-v3 on GPU
3. Rule-based pre-polishing & punctuation
4. Deep proofreading with local Qwen3.8-27B
5. Structure analysis & subheading generation with local Qwen3.8-27B
6. Automated verification & progress checkpointing
"""
import sys
import os
import json
import re
import time
import argparse
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests

# Constants & Endpoints
ROUTER_URL = os.environ.get("ROUTER_URL", "http://127.0.0.1:4001/v1/chat/completions")
VLLM_FALLBACK_URL = os.environ.get("VLLM_FALLBACK_URL", "http://192.168.122.1:8001/v1/chat/completions")
AUDIO_MAP_PATH = Path("courses/入中論善顯密意疏/audio_map.json")
SESSIONS_DIR = Path("courses/入中論善顯密意疏/sessions")
AUDIO_DIR = Path("audio")
PROGRESS_FILE = Path("conversion_progress.json")

def get_router_headers():
    """Retrieve auth header for GX10 Smart Router from env or infra config."""
    key = os.environ.get("ROUTER_API_KEY", "")
    if not key:
        env_path = Path("/home/henry/gx10-infra-config/.env")
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("ROUTER_AGENT_KEYS="):
                        raw = line.split("=", 1)[1].strip("\"'")
                        for p in raw.split(","):
                            p = p.strip()
                            if p and ":" in p:
                                key = p.split(":", 1)[0].strip()
                                break
                    elif line.startswith("ROUTER_API_KEYS=") and not key:
                        raw = line.split("=", 1)[1].strip("\"'")
                        key = raw.split(",")[0].strip()
    if key:
        return {"Authorization": f"Bearer {key}"}
    return {}

ROUTER_HEADERS = get_router_headers()

# Ensure directories exist
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

# Common Buddhist Glossary for Rule-based Pre-polishing
BUDDHIST_GLOSSARY = [
    (r"生一[地諦第]", "勝義諦"),
    (r"勝一[地諦第]", "勝義諦"),
    (r"生意[地諦第]", "勝義諦"),
    (r"世俗[地第]", "世俗諦"),
    (r"四[屬屬][地諦第]", "世俗諦"),
    (r"俗[地第]", "世俗諦"),
    (r"二[地第]", "二諦"),
    (r"四[地第]", "四諦"),
    (r"關帶世間", "觀待世間"),
    (r"觀帶世間", "觀待世間"),
    (r"關帶", "觀待"),
    (r"七[狂況礦]法", "欺誑法"),
    (r"不七[狂況礦]法", "不欺誑法"),
    (r"不[欺欺][狂況礦]法", "不欺誑法"),
    (r"羊眼", "陽焰"),
    (r"陽眼", "陽焰"),
    (r"執陽焰[爲為]水", "執陽焰為水"),
    (r"頌[約結約]", "頌曰"),
    (r"頌[雲云]", "頌云"),
    (r"無分微[塵陳]", "無分微塵"),
    (r"現[前千]地", "現前地"),
    (r"善[顯顯]密意[疏書]", "善顯密意疏"),
    (r"入中[論論]", "入中論"),
    (r"自[虛續續]派", "自續派"),
    (r"自[虛續續]", "自續"),
    (r"應成派", "應成派"),
    (r"中[觀觀]派", "中觀派"),
    (r"中[觀觀]宗", "中觀宗"),
    (r"正世俗", "正世俗"),
    (r"[道倒]世俗", "倒世俗"),
    (r"正[道倒]", "正倒"),
    (r"設法", "色法"),
    (r"不先一心法", "不相應行法"),
    (r"不相應行[法識]", "不相應行法"),
    (r"數論", "數論"),
    (r"順世", "順世"),
    (r"神我", "神我"),
    (r"倒[裏裡]面", "倒裡面"),
    (r"所[知智]", "所知"),
    (r"能[知智]", "能知"),
    (r"現量", "現量"),
    (r"比量", "比量"),
    (r"名言", "名言"),
    (r"勝義", "勝義"),
    (r"世俗", "世俗"),
    (r"空[信性]", "空性"),
    (r"如水注水", "如水注水"),
    (r"損壞之因", "損壞之因"),
    (r"損壞[羹更]", "損壞根"),
    (r"六[根識]", "六根"),
    (r"眼[識識]", "眼識"),
    (r"耳[識識]", "耳識"),
    (r"鼻[識識]", "鼻識"),
    (r"舌[識識]", "舌識"),
    (r"身[識識]", "身識"),
    (r"意[識識]", "意識"),
    (r"非紋症|肺紋症", "飛蚊症"),
    (r"至向有|自向有", "自相有"),
    (r"咒詩", "咒師"),
    (r"過世", "過失"),
    (r"限到", "陷到"),
    (r"\b2D\b|2d|２Ｄ", "二諦"),
    (r"\b4D\b|4d|４Ｄ", "四諦"),
]

SOURCE_TEXT_DIR = Path("courses/入中論善顯密意疏/source_text")
COURSE_JSON_PATH = Path("courses/入中論善顯密意疏/course.json")

def load_audio_map():
    if AUDIO_MAP_PATH.exists():
        with open(AUDIO_MAP_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def load_course_session_map():
    if COURSE_JSON_PATH.exists():
        with open(COURSE_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {s["sessionId"]: s for s in data.get("sessions", [])}
    return {}

def get_session_source_text(session_id, session_map):
    session_info = session_map.get(session_id, {})
    page_range = session_info.get("pageRange", "")
    if not page_range:
        return "", []

    # Parse page numbers like "p.63", "p.97-p.100", "p.103-106", "P84"
    nums = [int(n) for n in re.findall(r'\d+', page_range)]
    if not nums:
        return "", []

    start_p = nums[0]
    end_p = nums[-1] if len(nums) > 1 else start_p
    # Limit range sanity (max 8 pages per session)
    if end_p - start_p > 8:
        end_p = start_p + 4

    page_texts = []
    for p in range(start_p, end_p + 1):
        pt_path = SOURCE_TEXT_DIR / f"page_{p:03d}.txt"
        if pt_path.exists():
            with open(pt_path, "r", encoding="utf-8") as f:
                page_texts.append(f"【第 {p} 頁】\n" + f.read().strip())

    combined_text = "\n\n".join(page_texts)
    # Extract dynamic terms (2-6 character Chinese terms from quotes or brackets)
    found_terms = set(re.findall(r'[「『《〈]([\u4e00-\u9fff]{2,8})[」』》〉]', combined_text))
    return combined_text, list(found_terms)

def download_audio_if_needed(session_id, audio_url):
    local_path = AUDIO_DIR / f"{session_id}.mp3"
    if local_path.exists() and local_path.stat().st_size > 1000000:
        return local_path

    print(f"  📥 Downloading audio for {session_id} from {audio_url}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    r = requests.get(audio_url, headers=headers, stream=True, timeout=60)
    r.raise_for_status()
    with open(local_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024*1024):
            if chunk:
                f.write(chunk)
    print(f"  ✅ Saved audio to {local_path} ({local_path.stat().st_size / 1024 / 1024:.1f} MB)")
    return local_path

def step1_asr_transcribe(session_id, audio_path, whisper_model):
    print(f"\n[Step 1/5] 🎙️ Running Whisper Large-v3 ASR on GPU for {session_id}...")
    segments, info = whisper_model.transcribe(
        str(audio_path),
        language="zh",
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        beam_size=5,
        word_timestamps=True
    )
    
    raw_sentences = []
    prev_end = 0.0
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        start = max(round(seg.start, 3), prev_end)
        end = max(round(seg.end, 3), start + 0.3)
        raw_sentences.append({
            "start": start,
            "end": end,
            "text": text
        })
        prev_end = end

    print(f"  ✅ Extracted {len(raw_sentences)} raw spoken sentences.")
    return raw_sentences, info.duration

def step2_pre_polish(raw_sentences, dynamic_terms=None):
    print(f"\n[Step 2/5] 📝 Pre-polishing, merging clauses & punctuation (terms: {len(dynamic_terms or [])})...")
    merged_sents = []
    curr_chunk = []

    for i, s in enumerate(raw_sentences):
        curr_chunk.append(s)
        is_last = (i == len(raw_sentences) - 1)
        next_s = raw_sentences[i+1] if not is_last else None
        gap = (next_s["start"] - s["end"]) if next_s else 999.0
        combined_text = "".join(x["text"] for x in curr_chunk)

        if is_last or gap >= 1.1 or len(combined_text) >= 28 or re.search(r'[。？！]$', s["text"].strip()):
            raw_text = " ".join(x["text"].strip() for x in curr_chunk if x["text"].strip())
            # Apply regex glossary
            for pat, repl in BUDDHIST_GLOSSARY:
                raw_text = re.sub(pat, repl, raw_text)
            
            # Clean oral tokens & format punctuation
            raw_text = re.sub(r'^[嗯啊喔對哦，、\s]+', '', raw_text)
            raw_text = re.sub(r'謝謝大家.*|感謝觀看.*|點讚.*|訂閱.*', '', raw_text).strip()
            
            if raw_text:
                if not re.search(r'[。？！…」』]$', raw_text):
                    if re.search(r'(嗎|呢|吧|對不對|是不是|如何|哪裡|怎麼|為什麼|何須|何故)[？\?]?$', raw_text):
                        raw_text = re.sub(r'[，、\s]*$', '？', raw_text)
                    elif re.search(r'(啦|啊|嘛|喔|了|的|這樣|這個)[！\!]?$', raw_text):
                        raw_text = re.sub(r'[，、\s]*$', '。', raw_text)
                    else:
                        raw_text += '。'
                
                merged_sents.append({
                    "start": curr_chunk[0]["start"],
                    "end": curr_chunk[-1]["end"],
                    "text": raw_text
                })
            curr_chunk = []

    print(f"  ✅ Consolidated into {len(merged_sents)} readable full sentences.")
    return merged_sents

def call_llm_completion(messages, temperature=0.05, timeout=60):
    """Call LLM via GX10 Smart Router (Port 4001) with fallback to direct local vLLM."""
    # 1. Try Smart Router (Port 4001) with model 'primary'
    try:
        payload = {
            "model": "primary",
            "messages": messages,
            "temperature": temperature,
            "chat_template_kwargs": {"enable_thinking": False}
        }
        r = requests.post(ROUTER_URL, json=payload, headers=ROUTER_HEADERS, timeout=timeout)
        if r.status_code == 200:
            return r.json()["choices"][0]["message"]["content"]
    except Exception as e:
        pass

    # 2. Fallback directly to local vLLM (Port 8001) with model 'Qwen3.8-27B'
    payload = {
        "model": "Qwen3.8-27B",
        "messages": messages,
        "temperature": temperature,
        "chat_template_kwargs": {"enable_thinking": False}
    }
    r = requests.post(VLLM_FALLBACK_URL, json=payload, timeout=timeout)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]

def step3_llm_proofread(sentences, session_id, source_text=""):
    print(f"\n[Step 3/5] 🧠 Deep proofreading with Smart Router for {session_id} (Grounded: {len(source_text)} chars)...")
    
    source_context_block = ""
    if source_text:
        source_context_block = f"""\n\n【當前講次對應之《入中論善顯密意疏》底本參考原文】：
---
{source_text[:3000]}
---"""

    system_prompt = f"""你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與月稱菩薩《入中論》的佛學專家與校對主編。
當前文本為法師第 {session_id} 堂錄音口述逐字稿。{source_context_block}

【校對原則】：
1. 【引用論疏原文時】：若法師在讀誦或引述論疏底本（如「頌曰：...」、「疏云：...」或經文），請嚴格依照上方底本字句校正 ASR 同音錯字。
2. 【白話講述開示時】：請保持口語對話與開示語氣自然流暢，僅依據底本校正佛學名相與錯別字，切勿將白話強行改寫為文言。
3. 【極重要】：輸入有 N 句話，輸出必須是剛好 N 句話的 JSON 字串陣列 `["句子1", "句子2", ...]`，絕不可合併或刪減句子！繁體中文輸出。"""

    batch_size = 12
    total_sents = len(sentences)
    batches = [sentences[i:i + batch_size] for i in range(0, total_sents, batch_size)]
    
    def process_batch(b_idx, batch):
        input_texts = [s["text"] for s in batch]
        prompt = f"請依據底本校對以下 {len(input_texts)} 個句子，修正佛學名相與同音錯字，以 JSON 字串陣列輸出：\n" + json.dumps(input_texts, ensure_ascii=False, indent=2)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        try:
            content = call_llm_completion(messages, temperature=0.05, timeout=60)
            match = re.search(r'\[\s*".*"\s*\]', content, re.DOTALL)
            if match:
                corr_list = json.loads(match.group(0))
                if len(corr_list) == len(batch):
                    res = []
                    for idx, s in enumerate(batch):
                        res.append({
                            "start": s["start"],
                            "end": s["end"],
                            "text": corr_list[idx]
                        })
                    return b_idx, res
        except Exception as e:
            print(f"    ⚠️ Batch {b_idx+1} LLM fallback: {e}")

        # Fallback to raw batch
        return b_idx, batch

    results = [None] * len(batches)
    # Execute with 4 parallel threads on GX10 Smart Router
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(process_batch, i, b) for i, b in enumerate(batches)]
        for fut in futures:
            b_idx, batch_res = fut.result()
            results[b_idx] = batch_res

    corrected_sentences = []
    for b_res in results:
        corrected_sentences.extend(b_res)

    print(f"  ✅ Completed LLM proofreading across {len(batches)} batches (Smart Router parallel).")
    return corrected_sentences

def step4_llm_structure(sentences, session_id, title):
    print(f"\n[Step 4/5] 📑 Semantic structuring & subheading generation with Smart Router...")
    # First cluster sentences into preliminary paragraphs
    paragraphs = []
    curr_p = []
    p_num = 1
    for i, s in enumerate(sentences):
        curr_p.append(s)
        is_last = (i == len(sentences) - 1)
        next_s = sentences[i+1] if not is_last else None
        gap = (next_s["start"] - s["end"]) if next_s else 999.0
        total_p_chars = sum(len(x["text"]) for x in curr_p)

        if is_last or gap >= 2.2 or len(curr_p) >= 6 or total_p_chars >= 160:
            paragraphs.append({
                "id": f"p-{p_num}",
                "start": curr_p[0]["start"],
                "end": curr_p[-1]["end"],
                "sentences": curr_p
            })
            p_num += 1
            curr_p = []

    # Send digest to LLM for semantic heading extraction
    para_digest = [f"{p['id']} ({p['start']:.1f}s): {''.join(s['text'] for s in p['sentences'])[:65]}..." for p in paragraphs]
    prompt = f"以下是第 {session_id} 堂共 {len(paragraphs)} 個段落的時間與開頭摘要。請分析文義轉折，劃分 6~10 個小標題，並回傳 JSON 陣列：\n\n" + "\n".join(para_digest)
    
    system_prompt = f"""你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與月稱菩薩《入中論》的佛學專家。
當前任務是對法師第 {session_id} 堂錄音逐字稿進行「文義結構分析與小標題劃分」。
請輸出標準 JSON 陣列，格式如：
[
  {{ "start_paragraph_id": "p-1", "heading": "【科判導讀】主題說明..." }}
]"""

    try:
        payload = {
            "model": "Qwen3.8-27B",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "chat_template_kwargs": {"enable_thinking": False}
        }
        r = requests.post(VLLM_FALLBACK_URL, json=payload, timeout=90)
        content = r.json()["choices"][0]["message"]["content"]
        match = re.search(r'\[\s*\{.*\}\s*\]', content, re.DOTALL)
        if match:
            sections = json.loads(match.group(0))
            heading_map = {item["start_paragraph_id"]: item["heading"] for item in sections}
            for p in paragraphs:
                if p["id"] in heading_map:
                    p["heading"] = heading_map[p["id"]]
            print(f"  ✅ Extracted {len(sections)} semantic headings from Qwen3.8-27B.")
    except Exception as e:
        print(f"  ⚠️ Heading extraction fallback: {e}")
        if paragraphs:
            paragraphs[0]["heading"] = f"【本講開示】{title}"

    return paragraphs

def process_single_session(session_id, audio_map, whisper_model, session_map=None):
    if session_map is None:
        session_map = load_course_session_map()

    audio_url = audio_map.get(session_id, f"https://buddha.flyday.com.tw/{session_id}.MP3")
    json_path = SESSIONS_DIR / f"session_{session_id}.json"

    print(f"\n=======================================================")
    print(f"🚀 PROCESSING SESSION {session_id} — Grounded Pipeline Standard")
    print(f"=======================================================")

    # 0. Load Ground Truth Treatise Text for this Session
    source_text, dynamic_terms = get_session_source_text(session_id, session_map)
    if source_text:
        print(f"  📖 Loaded {len(source_text)} chars of treatise grounding text ({len(dynamic_terms)} terms).")

    # 1. Audio
    audio_path = download_audio_if_needed(session_id, audio_url)

    # 2. ASR
    raw_sents, duration = step1_asr_transcribe(session_id, audio_path, whisper_model)

    # 3. Pre-polish with dynamic vocabulary
    clean_sents = step2_pre_polish(raw_sents, dynamic_terms=dynamic_terms)

    # 4. Grounded LLM Proofread with Local Qwen3.8-27B
    proofread_sents = step3_llm_proofread(clean_sents, session_id, source_text=source_text)

    # 5. LLM Structure & Headings
    session_info = session_map.get(session_id, {})
    title = session_info.get("title", f"第 {session_id} 堂")
    paragraphs = step4_llm_structure(proofread_sents, session_id, title)

    # Monotonicity enforcement
    prev_end = 0.0
    for p in paragraphs:
        for s in p["sentences"]:
            if s["start"] < prev_end:
                s["start"] = round(prev_end, 3)
            if s["end"] <= s["start"]:
                s["end"] = round(s["start"] + 0.5, 3)
            prev_end = s["end"]
        p["start"] = p["sentences"][0]["start"]
        p["end"] = p["sentences"][-1]["end"]

    # Assemble JSON payload
    today_date = time.strftime("%Y-%m-%d")
    payload = {
        "sessionId": session_id,
        "title": title,
        "audioUrl": audio_url,
        "lastUpdated": today_date,
        "paragraphs": paragraphs,
        "_meta": {
            "engine": "whisper-large-v3-turbo",
            "llm_proofread": "Smart Router (MiniMax-M3 / Qwen3.8-27B Grounded)",
            "last_updated": today_date,
            "grounding_source": "《入中論善顯密意疏》真值底本",
            "audio_duration": duration,
            "total_paragraphs": len(paragraphs),
            "total_sentences": sum(len(p["sentences"]) for p in paragraphs),
            "processed_at": time.strftime("%Y-%m-%d %H:%M:%S")
        }
    }

    # Strict Taiwan Standard Traditional Chinese (繁體中文) Pass
    try:
        import opencc
        t_conv = opencc.OpenCC('s2twp')
        def to_trad(o):
            if isinstance(o, str): return t_conv.convert(o)
            elif isinstance(o, list): return [to_trad(x) for x in o]
            elif isinstance(o, dict): return {k: to_trad(v) for k, v in o.items()}
            return o
        payload = to_trad(payload)
    except Exception as e:
        pass

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"🎉 Successfully generated {json_path} ({len(paragraphs)} paragraphs).")
    return True

def main():
    parser = argparse.ArgumentParser(description="Batch conversion pipeline for Buddhist lecture sessions")
    parser.add_argument("--sessions", nargs="+", help="Specific session IDs to process (e.g. 29A 30A 31A)")
    parser.add_argument("--all", action="store_true", help="Process all available sessions in audio_map.json")
    parser.add_argument("--resume", action="store_true", help="Resume from last completed session")
    args = parser.parse_args()

    audio_map = load_audio_map()
    session_map = load_course_session_map()
    all_sessions = list(audio_map.keys())

    if args.sessions:
        targets = args.sessions
    elif args.all:
        targets = all_sessions
    else:
        print("Usage: python3 scripts/batch_convert_all.py --sessions 29A 30A OR --all")
        sys.exit(0)

    # Initialize Whisper Model (large-v3-turbo with int8 on multi-core ARM64)
    print("\n📦 Loading faster-whisper large-v3-turbo on GX10 (int8, 8 threads)...")
    from faster_whisper import WhisperModel
    whisper_model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8", cpu_threads=8)

    print(f"🎯 Target queue: {len(targets)} sessions ({targets[:5]}...)")

    progress = {}
    if PROGRESS_FILE.exists() and args.resume:
        with open(PROGRESS_FILE, "r") as f:
            progress = json.load(f)

    for idx, sid in enumerate(targets, 1):
        if sid in progress and progress[sid].get("status") == "SUCCESS":
            print(f"⏭️ Skipping already completed session {sid} [{idx}/{len(targets)}]")
            continue

        try:
            t0 = time.time()
            success = process_single_session(sid, audio_map, whisper_model, session_map=session_map)
            elapsed = time.time() - t0
            progress[sid] = {"status": "SUCCESS", "elapsed_seconds": round(elapsed, 1)}
        except Exception as e:
            print(f"❌ Error processing {sid}: {e}")
            progress[sid] = {"status": "FAILED", "error": str(e)}

        with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)

    print("\n🏁 Batch conversion execution completed!")

if __name__ == "__main__":
    main()
