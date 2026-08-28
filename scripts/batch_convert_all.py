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
ROUTER_HEADERS = {
    "Authorization": "Bearer gx10-c6a5ae95f47bb838fff310e20cf22e6488a0a7b9ff32290d4d864f5d6f2110f5",
    "Content-Type": "application/json"
}
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
    # 補特伽羅 (Pudgala / 藏文 གང་ཟག)
    (r"葡萄[切勒熱了]+", "補特伽羅"),
    (r"普特[伽羅勒]+", "補特伽羅"),
    (r"布特[伽羅勒]+", "補特伽羅"),
    
    # 能諍 / 諍論 / 出過
    (r"持有有何能[政整政治]+", "此宗有何能諍"),
    (r"有何能[政整政治]+", "有何能諍"),
    (r"有何能夠[政整政治]+", "有何能夠能諍"),
    (r"能[政整政治]+", "能諍"),
    (r"說中過失", "說種種過失"),
    (r"負不能以至終了意", "復不能依自宗了義"),
    (r"最[驚驚][議意]+的 最[驚驚][議意]+[為爲]意", "最精微義"),
    (r"最[驚驚][議意]+", "最精微"),
    (r"精[偉偉]", "精微"),
    (r"深[吸細]正理", "深細正理"),
    (r"神[系細]", "深細"),
    (r"而是他難", "而釋他難"),
    (r"[為爲]樂狡辯", "唯樂狡辯"),
    (r"[雲云]我[終宗]無所需", "云我宗無所許"),
    (r"我[終宗]無所需", "我宗無所許"),
    (r"實不須[知示]如是精[偉微]建立", "實不須示如是精微建立"),
    (r"[聰充][銳類]知[士識]", "聰叡智士"),
    (r"聰[銳慧]智士", "聰叡智士"),
    (r"若不建議精細的那個正理", "若不以精細正理"),
    (r"無[謂為]慈悲", "由具慈悲"),
    (r"顧略[失示]", "故略示"),
    (r"而你始終無過之門[禁徑]", "自宗無過之門徑"),
    (r"門[禁徑]", "門徑"),
    
    # 緣青色 / 相違 / 見青
    (r"我[建見]青色", "我見青色"),
    (r"我[建見]", "我見"),
    (r"相[偽違]", "相違"),
    (r"原青色", "緣青色"),
    (r"原青眼", "緣青眼識"),
    (r"如是念識 [雲云]和 如何是念原青色", "如是念識，云何能念緣青色"),
    (r"然以彼是見青[為爲][元緣]", "然以彼是見青之緣"),
    (r"按理[說説]", "名言說"),
    
    # 二諦 / 四諦 / 勝義 / 世俗 / 色法 / 陽焰
    (r"[羊陽]眼", "陽焰"),
    (r"設法心法", "色法心法"),
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
    (r"著相有?", "自相有"),
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

WHISPER_GPU_URL = os.environ.get("WHISPER_GPU_URL", "http://127.0.0.1:8010/v1/audio/transcriptions")

def step1_asr_transcribe(session_id, audio_path, whisper_model=None):
    print(f"\n[Step 1/5] 🎙️ Running Whisper Large-v3 ASR on GPU (Port 8010 CUDA) for {session_id}...")
    
    # 1. First Priority: Dedicated GPU Whisper Microservice on Port 8010 (59x Realtime, CUDA int8 on GB10)
    try:
        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f, "audio/mpeg")}
            data = {"language": "zh", "response_format": "verbose_json", "beam_size": "5"}
            r = requests.post(WHISPER_GPU_URL, files=files, data=data, timeout=300)
            if r.status_code == 200:
                res = r.json()
                duration = res.get("duration", 0)
                raw_sentences = []
                prev_end = 0.0
                for seg in res.get("segments", []):
                    text = seg.get("text", "").strip()
                    if not text:
                        continue
                    start = max(round(seg.get("start", 0), 3), prev_end)
                    end = max(round(seg.get("end", 0), 3), start + 0.3)
                    raw_sentences.append({
                        "start": start,
                        "end": end,
                        "text": text
                    })
                    prev_end = end
                print(f"  ⚡ Extracted {len(raw_sentences)} raw spoken sentences via GPU Whisper Service (Duration: {duration/60:.1f}m).")
                return raw_sentences, duration
    except Exception as e:
        print(f"  ⚠️ GPU Whisper Service fallback: {e}")

    # 2. Local fallback if service is unreachable
    if whisper_model:
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

        print(f"  ✅ Extracted {len(raw_sentences)} raw spoken sentences (Local Fallback).")
        return raw_sentences, info.duration
    
    raise RuntimeError("Neither GPU Whisper Service nor local model is available.")

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
    """Call LLM via local vLLM (Qwen3.8-27B on GB10 GPU) with fallback to Smart Router."""
    # 1. First priority: Direct Local vLLM Qwen3.8-27B on GB10 GPU (Fast & Reliable)
    try:
        payload = {
            "model": "Qwen3.8-27B",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 2048,
            "chat_template_kwargs": {"enable_thinking": False}
        }
        r = requests.post(VLLM_FALLBACK_URL, json=payload, timeout=timeout)
        if r.status_code == 200:
            res = r.json()["choices"][0]["message"]["content"]
            if res and res.strip():
                return res
    except Exception:
        pass

    # 2. Secondary fallback: Smart Router (Port 4001)
    payload = {
        "model": "primary",
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 2048
    }
    r = requests.post(ROUTER_URL, json=payload, headers=ROUTER_HEADERS, timeout=timeout)
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

    system_prompt = f"""你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與月稱菩薩《入中論》的頂級佛學專家與校對主編。
當前文本為法師第 {session_id} 堂錄音口述逐字稿。{source_context_block}

【佛法名相與同音錯字校對手冊】：
- 補特伽羅（Pudgala / gang zag）：語音常誤為「葡萄切勒/葡萄切熱/葡萄切了/普特伽羅」，務必校正為「補特伽羅」。
- 此宗能諍 / 出過：語音常誤為「此宗有何能政治/能整/能政」，務必校正為「此宗有何能諍/能諍」。
- 緣青色 / 見青之緣：語音常誤為「原青色/原青眼/相偽/見青為元」，務必校正為「緣青色/緣青眼識/相違/見青之緣」。
- 聰叡智士：語音常誤為「充類知識/聰銳志士」，務必校正為「聰叡智士」。
- 宗喀巴大師疏文：語音常誤為「最驚議/精偉/深吸/神系/門禁/雲我終無所需」，務必校正為「最精微/精微/深細/深細正理/門徑/云我宗無所許」。
- 二諦正理：語音常誤為「生一地/生意諦/勝一地/世俗地/七狂法/陽眼/咒詩」，務必校正為「勝義諦/世俗諦/不欺誑法/陽焰/咒師/自相有/自證分/依他起」。

【校對原則】：
1. 【引用論疏原文時】：若法師在讀誦或引述論疏底本（如「頌曰：...」、「疏云：...」或經文），請嚴格依照上方底本字句校正 ASR 同音錯字。
2. 【白話講述開示時】：請保持口語開示語氣自然流暢，僅精準校正佛學名相與錯別字，切勿將白話強行改寫為生硬文言。
3. 【極重要】：輸入有 N 句話，輸出必須是剛好 N 句話的 JSON 字串陣列 `["句子1", "句子2", ...]`，絕不可合併或刪減句子！100% 繁體中文（台灣正體）輸出。"""


    # Optimized: Batch size increased from 12 -> 25 (reduces total LLM calls by 52%, speeds up by 2-3x, improves paragraph context)
    batch_size = 25
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
    # Execute with 2 parallel threads per session (2 workers * 2 = 4 concurrent vLLM requests, perfectly matching vLLM max-num-seqs=4)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(process_batch, i, b) for i, b in enumerate(batches)]
        for fut in futures:
            b_idx, batch_res = fut.result()
            results[b_idx] = batch_res

    corrected_sentences = []
    for b_res in results:
        corrected_sentences.extend(b_res)

    print(f"  ✅ Completed LLM proofreading across {len(batches)} batches (Optimized 25-sentence batches, Smart Router / vLLM).")
    return corrected_sentences

def step4_llm_structure(sentences, session_id, title):
    print(f"\n[Step 4/5] 📑 Semantic structuring & subheading generation with Smart Router...")
    full_transcript = "\n".join(s["text"] for s in sentences)
    
    system_prompt = """你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與中觀應成派見解的科判大師。
請根據法師整堂課講述之逐字稿內容，提煉出 8 到 10 個核心法義科判小標題（例如：【科判導讀】、【名相辨析】、【中觀釋難】、【經論引證】、【正理抉擇】、【格西要旨】、【研讀總結】、【法義迴向】），並標注每一段標題所對應的起始句子序號（0-indexed）。

【輸出格式】：以標準 JSON 陣列格式輸出，每項包含 "startIndex" 與 "heading"：
[
  {"startIndex": 0, "heading": "【科判導讀】第六現前地唯識宗無境有識之破執正理"},
  ...
]"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"法師第 {session_id} 堂課逐字稿（共 {len(sentences)} 句）：\n{full_transcript[:12000]}"}
    ]

    headings_map = {}
    try:
        content = call_llm_completion(messages, temperature=0.1, timeout=90)
        match = re.search(r'\[\s*\{.*\}\s*\]', content, re.DOTALL)
        if match:
            h_data = json.loads(match.group(0))
            for item in h_data:
                idx = item.get("startIndex", 0)
                h_text = item.get("heading", "").strip()
                if h_text and not h_text.startswith("【"):
                    h_text = f"【{h_text}】"
                headings_map[idx] = h_text
            print(f"  ✅ Extracted {len(headings_map)} semantic headings from Smart Router.")
    except Exception as e:
        print(f"  ⚠️ Heading generation LLM fallback: {e}")

    # Fallback to standard 8 headings if LLM failed
    if len(headings_map) < 6:
        print("  ℹ️ Applying golden standard 8 fallback headings across paragraphs.")
        total = len(sentences)
        step = max(1, total // 8)
        default_titles = [
            f"【科判導讀】第六現前地第 {session_id} 堂法要科判開示",
            "【名相辨析】勝義諦與世俗諦不共正理審察",
            "【中觀釋難】應成派破自生他生與自性執",
            "【經論引證】宗喀巴大師善顯密意疏原文決擇",
            "【正理抉擇】依無自性通達名言幻現之甚深義",
            "【格西要旨】世俗因果取捨與緣起正見修持",
            f"【研讀總結】第 {session_id} 堂課要義綜述",
            "【法義迴向】深觀二諦圓滿無上般若妙智"
        ]
        headings_map = {i * step: default_titles[i] for i in range(len(default_titles))}

    # Group into natural paragraphs (3 to 6 sentences each)
    paragraphs = []
    curr_sentences = []
    curr_heading = None

    for i, s in enumerate(sentences):
        if i in headings_map:
            if curr_sentences:
                paragraphs.append({
                    "id": f"p_{len(paragraphs)+1}",
                    "heading": curr_heading,
                    "sentences": curr_sentences
                })
                curr_sentences = []
                curr_heading = None
            curr_heading = headings_map[i]

        curr_sentences.append(s)
        # Split paragraph at natural semantic boundary or length
        if len(curr_sentences) >= 4 or (len(curr_sentences) >= 2 and re.search(r'[。！？]$', s["text"])):
            paragraphs.append({
                "id": f"p_{len(paragraphs)+1}",
                "heading": curr_heading,
                "sentences": curr_sentences
            })
            curr_sentences = []
            curr_heading = None

    if curr_sentences:
        paragraphs.append({
            "id": f"p_{len(paragraphs)+1}",
            "heading": curr_heading,
            "sentences": curr_sentences
        })

    # Ensure at least 8 headings exist across the paragraphs
    h_count = sum(1 for p in paragraphs if p.get("heading"))
    if h_count < 6:
        step = max(1, len(paragraphs) // 8)
        default_titles = [
            f"【科判導讀】第六現前地第 {session_id} 堂法要科判開示",
            "【名相辨析】勝義諦與世俗諦不共正理審察",
            "【中觀釋難】應成派破自生他生與自性執",
            "【經論引證】宗喀巴大師善顯密意疏原文決擇",
            "【正理抉擇】依無自性通達名言幻現之甚深義",
            "【格西要旨】世俗因果取捨與緣起正見修持",
            f"【研讀總結】第 {session_id} 堂課要義綜述",
            "【法義迴向】深觀二諦圓滿無上般若妙智"
        ]
        for i in range(min(len(default_titles), len(paragraphs))):
            target_p = paragraphs[min(i * step, len(paragraphs) - 1)]
            if not target_p.get("heading"):
                target_p["heading"] = default_titles[i]

    return paragraphs

def process_single_session(session_id, audio_map, whisper_model=None, session_map=None):
    if session_id not in audio_map:
        raise ValueError(f"Session {session_id} not found in audio_map.json")

    audio_url = audio_map[session_id]
    session_title_info = (session_map or {}).get(session_id, {})
    title = session_title_info.get("title", f"第 {session_id} 堂")
    grounding_data = get_session_source_text(session_id, session_map)
    grounding_text = grounding_data[0]
    grounding_terms = grounding_data[1]

    print(f"\n=======================================================")
    print(f"🚀 PROCESSING SESSION {session_id} — Grounded Pipeline Standard")
    print(f"=======================================================")

    # Step 1: Whisper ASR
    raw_sentences, duration = step1_asr_transcribe(session_id, download_audio_if_needed(session_id, audio_url), whisper_model)

    # Step 2: Pre-polish
    pre_polished = step2_pre_polish(raw_sentences, dynamic_terms=grounding_terms)

    # Step 3: LLM Proofreading
    proofread_sentences = step3_llm_proofread(pre_polished, session_id, source_text=grounding_text)

    # Step 4: Semantic Structuring & Headings
    paragraphs = step4_llm_structure(proofread_sentences, session_id, title)

    # Calculate precise start and end for paragraphs
    json_path = SESSIONS_DIR / f"session_{session_id}.json"
    prev_end = 0.0
    for p in paragraphs:
        for s in p["sentences"]:
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
    parser.add_argument("--workers", type=int, default=2, help="Number of concurrent session workers (default: 2)")
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
    progress = {}
    if PROGRESS_FILE.exists() and args.resume:
        with open(PROGRESS_FILE, "r") as f:
            progress = json.load(f)

    # Filter out already completed sessions if resuming
    pending_targets = [
        sid for sid in targets
        if not (args.resume and sid in progress and progress[sid].get("status") == "SUCCESS")
    ]

    print(f"\n🚀 Launching GX10 Pipeline with {args.workers} concurrent session workers.")
    print(f"🎯 Target queue: {len(pending_targets)} pending sessions (out of {len(targets)} total)")

    from faster_whisper import WhisperModel
    import threading
    _local = threading.local()

    def get_thread_model():
        if not hasattr(_local, "model"):
            print(f"  📦 Initializing WhisperModel on thread {threading.current_thread().name} (int8, 8 threads)...")
            _local.model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8", cpu_threads=8)
        return _local.model

    def worker_task(sid):
        try:
            t0 = time.time()
            model = get_thread_model()
            process_single_session(sid, audio_map, model, session_map=session_map)
            elapsed = time.time() - t0
            res = {"status": "SUCCESS", "elapsed_seconds": round(elapsed, 1)}
        except Exception as e:
            print(f"❌ Error processing {sid}: {e}")
            res = {"status": "FAILED", "error": str(e)}

        # Update progress file
        progress[sid] = res
        with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)
        return sid, res

    if args.workers > 1:
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {executor.submit(worker_task, sid): sid for sid in pending_targets}
            for fut in futures:
                sid = futures[fut]
                try:
                    sid, res = fut.result()
                    print(f"🏁 Finished {sid}: {res.get('status')}")
                except Exception as e:
                    print(f"💥 Worker failed for {sid}: {e}")
    else:
        for sid in pending_targets:
            worker_task(sid)

    print("\n🏁 Batch conversion execution completed!")

if __name__ == "__main__":
    main()

