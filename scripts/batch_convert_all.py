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
import hashlib
import math
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests
from build_verbatim_track import clean_verbatim_text, load_learned_corrections, validate_output_path
from lib.pipeline_evaluation import normalize_text

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

    # 30B Doctrinal & Outline phonetics
    (r"這個是物[意一]嗎", "這個是戌一嗎"),
    (r"物[意一]嗎", "戌一嗎"),
    (r"民[語语]何世俗", "明於何世俗"),
    (r"名言何世俗前為諦", "明於何世俗前為諦"),
    (r"真意[爲為]有自[信性]", "增益為有自性"),
    (r"無自[信性]真意[爲為]有自[信性]", "無自性增益為有自性"),
    (r"障[必畢]為體", "障蔽為體"),
    (r"來人所[為名]", "能仁說為"),
    (r"人人說為世俗[諦帝地]", "能仁說為世俗諦"),
    (r"人人說名世俗[諦帝地]", "能仁說名世俗諦"),
    (r"無[信信]而迷亂", "無性而迷亂"),
    (r"[虛虚]為真世俗", "許為真世俗"),
    (r"影像自行空", "影像自性空"),
    (r"執連面", "執臉面"),
    (r"現連面", "現臉面"),
    (r"古[生神]", "谷響"),
    (r"行止", "形質"),

    # 31B Doctrinal & Outline phonetics
    (r"明眼識", "名言識"),
    (r"佔物無明", "染污無明"),
    (r"十二元[緊緊]", "十二緣起"),
    (r"有之所設", "有支所攝"),
    (r"實子無明", "實執無明"),
    (r"憑[子衣]老", "瓶衣等"),
    (r"慧解太初", "慧解太粗"),
    (r"精進地菩薩", "清淨地菩薩"),
    (r"心跟敬", "心境二義"),
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
        try:
            from prepare_session_manifest import MISSING_SESSIONS_CATALOG
            page_range = MISSING_SESSIONS_CATALOG.get(session_id, {}).get("pageRange", "")
        except Exception:
            try:
                from scripts.prepare_session_manifest import MISSING_SESSIONS_CATALOG
                page_range = MISSING_SESSIONS_CATALOG.get(session_id, {}).get("pageRange", "")
            except Exception:
                pass

    if not page_range:
        return "", []

    # T2：擴大視窗（前 10 頁、後 3 頁），主頁優先
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from lib.session_prompt import build_source_context
        combined_text = build_source_context(page_range)
        if combined_text:
            found_terms = set(re.findall(r'[「『《〈]([\u4e00-\u9fff]{2,8})[」』》〉]', combined_text))
            return combined_text, list(found_terms)
    except Exception as e:
        print(f"  ⚠️ wide source window fallback: {e}")
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

BUDDHIST_WHISPER_INITIAL_PROMPT = (
    "以下是見悲青增格西講授《入中論善顯密意疏》的開示錄音。包含專有名相：見悲青增格西、月稱菩薩、宗喀巴大師、"
    "中觀應成派、自續派、唯識、經部、有部、世俗諦、勝義諦、二諦、無自性、中觀應成、"
    "阿賴耶識、空性、現觀、菩提心、見行、遮遣、所破、因明量論、名言有、勝義無、七相推求。"
)

# T2：VAD 與模型可設定（以 36A 實測比較 600/900/1200）
VAD_MIN_SILENCE_MS = int(os.environ.get("WHISPER_VAD_MIN_SILENCE_MS", "900"))
WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3")


def build_whisper_prompt(page_range):
    """T2：依當講頁碼動態產生 initial_prompt；失敗時退回通用 prompt。"""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from lib.session_prompt import build_initial_prompt
        p = build_initial_prompt(page_range or "")
        if p and len(p) > 40:
            return p
    except Exception as e:
        print(f"  ⚠️ dynamic prompt fallback: {e}")
    return BUDDHIST_WHISPER_INITIAL_PROMPT


def step1_asr_transcribe(session_id, audio_path, whisper_model=None, page_range=""):
    print(f"\n[Step 1/5] 🎙️ Running Whisper ({WHISPER_MODEL_NAME}) ASR on GPU (Port 8010 CUDA) for {session_id}...")
    whisper_prompt = build_whisper_prompt(page_range)
    print(f"  🧾 initial_prompt ({len(whisper_prompt)} chars): {whisper_prompt[:80]}…")

    # 1. First Priority: Dedicated GPU Whisper Microservice on Port 8010 (59x Realtime, CUDA int8 on GB10)
    try:
        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f, "audio/mpeg")}
            data = {
                "language": "zh",
                "response_format": "verbose_json",
                "model": WHISPER_MODEL_NAME,
                "beam_size": "5",
                "initial_prompt": whisper_prompt,
                "patience": "1.2",
                "repetition_penalty": "1.08",
                "condition_on_previous_text": "false",
                "word_timestamps": "true",
                "vad_min_silence_duration_ms": str(VAD_MIN_SILENCE_MS),
                "vad_speech_pad_ms": "400"
            }
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
                        "text": text,
                        **({"words": seg["words"]} if seg.get("words") else {})
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
            initial_prompt=whisper_prompt,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=VAD_MIN_SILENCE_MS, speech_pad_ms=400),
            beam_size=5,
            patience=1.2,
            condition_on_previous_text=False,
            repetition_penalty=1.08,
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
                "text": text,
                **({"words": [{"start": w.start, "end": w.end, "word": w.word,
                               "probability": w.probability} for w in seg.words]} if seg.words else {})
            })
            prev_end = end

        print(f"  ✅ Extracted {len(raw_sentences)} raw spoken sentences (Local Fallback).")
        return raw_sentences, info.duration
    
    raise RuntimeError("Neither GPU Whisper Service nor local model is available.")

SENTENCE_END_RE = re.compile(r'[。？！?!]$|(嗎|呢|吧|對不對|是不是|這樣|大概這樣|對吧)$')
SOFT_PAUSE_RE = re.compile(r'[，、,；;]$')
GAP_SPLIT_SEC = 1.1
SOFT_MAX_CHARS = 60
HARD_MAX_CHARS = 120


def should_split(chunk_text, last_text, gap, is_last):
    """T3：以語意停頓斷句，取代舊的 28 字硬切。"""
    if is_last or gap >= GAP_SPLIT_SEC:
        return True
    t = last_text.strip()
    if SENTENCE_END_RE.search(t):
        return True
    n = len(chunk_text)
    if n >= SOFT_MAX_CHARS and (SOFT_PAUSE_RE.search(t) or gap >= 0.4):
        return True
    return n >= HARD_MAX_CHARS


def step2_pre_polish(raw_sentences, dynamic_terms=None):
    # 只採用文字完整吻合且時間單調的詞級結果；不以不完整 words 覆蓋原段。
    units = []
    for segment in raw_sentences:
        words = segment.get("words") or []
        joined = "".join(word.get("word", "") for word in words)
        times_valid = all(isinstance(w.get("start"), (int, float)) and isinstance(w.get("end"), (int, float))
                          and w["end"] >= w["start"] for w in words)
        monotonic = times_valid and all(words[i]["start"] >= words[i - 1]["end"] - .05 for i in range(1, len(words)))
        if words and monotonic and normalize_text(joined) == normalize_text(segment["text"]):
            units.extend({"start": w["start"], "end": w["end"], "text": w["word"]} for w in words)
        else:
            units.append(segment)
    raw_sentences = units
    print(f"\n[Step 2/5] 📝 Pre-polishing, merging clauses & punctuation (terms: {len(dynamic_terms or [])})...")
    merged_sents = []
    curr_chunk = []
    from lib.guarded_edits import canonical_text
    learned = load_learned_corrections()

    for i, s in enumerate(raw_sentences):
        curr_chunk.append(s)
        is_last = (i == len(raw_sentences) - 1)
        next_s = raw_sentences[i+1] if not is_last else None
        gap = (next_s["start"] - s["end"]) if next_s else 999.0
        combined_text = "".join(x["text"] for x in curr_chunk)

        if should_split(combined_text, s["text"], gap, is_last):
            raw_text = "".join(x["text"].strip() for x in curr_chunk if x["text"].strip())
            # 僅套用已驗證的同音詞庫與允許的語氣詞清理。
            raw_text = clean_verbatim_text(canonical_text(raw_text), learned)

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

def dynamic_max_tokens(texts):
    """T4：依輸入字數動態估算輸出 token（約 ×2.5，介於 1024–8000）。"""
    chars = sum(len(t) for t in texts)
    return max(1024, min(8000, int(chars * 2.5) + 256))


def call_llm_completion(messages, temperature=0.05, timeout=60, max_tokens=2048):
    """Call LLM via local vLLM (Qwen3.8-27B on GB10 GPU) with fallback to Smart Router."""
    # 1. First priority: Direct Local vLLM Qwen3.8-27B on GB10 GPU (Fast & Reliable)
    try:
        payload = {
            "model": "Qwen3.8-27B",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
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
        "max_tokens": max_tokens
    }
    r = requests.post(ROUTER_URL, json=payload, headers=ROUTER_HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def step3_llm_proofread(sentences, session_id, source_text=""):
    """逐筆同音修正；繁簡統一後比較，保留所有非核准變動及實體時間。"""
    from lib.guarded_edits import canonical_text, apply_patches, propose_diff
    from lib.source_alignment import SourceAligner
    print(f"\n[Step 3/5] 🧠 局部同音校對 {session_id}（底本 {len(source_text)} 字）...")
    learned = load_learned_corrections()
    outline_context = ""
    toc_path = Path("courses/入中論善顯密意疏/toc.json")
    if toc_path.exists():
        matching_titles = []
        def search_sections(sections):
            for section in sections:
                if session_id in section.get("sessionIds", []) or section.get("sessionId") == session_id:
                    matching_titles.append(section.get("title", ""))
                search_sections(section.get("children", []))
        search_sections(json.loads(toc_path.read_text(encoding="utf-8")).get("sections", []))
        if matching_titles:
            outline_context = "\n當前講次宗喀巴大師科判綱目（僅作名相參考，不得補寫）：\n" + "\n".join(matching_titles)
    aligner = SourceAligner.from_context(canonical_text(source_text))
    prepared = []
    for sentence in sentences:
        text = clean_verbatim_text(canonical_text(sentence["text"]), learned)
        hits = aligner.retrieve(text)
        auto = apply_patches(text, aligner.propose_patches(text, hits), learned, hits)
        prepared.append(dict(sentence, rawText=sentence.get("rawText", sentence["text"]),
                             text=auto["text"], sourceMatches=hits, editAudit=auto["edits"]))

    system_prompt = """你是佛典錄音的逐字稿同音校對員。只提出局部修改，不重寫整句。
嚴禁刪減實詞、重複、口頭禪、自我修正；不得根據底本補上沒有讀出的句子。
只提同音錯字、獨立的嗯／啊／呃或標點修正。證據不足時不修改。
輸入每句附有底本候選與實體頁碼行號；底本只是參考，不是可直接覆蓋的逐字稿。
只輸出 JSON 物件：{"sentences":[{"index":0,"patches":[{"before":"隨意處","after":"隨一處","occurrence":0,"evidence":"若得隨一處"}]}]}。
before 必須是輸入原文的精確子字串；occurrence 是該字串第幾次出現（從 0 開始）。
evidence 必須逐字摘錄所附底本候選；沒有修改時 patches 為空陣列。
輸出每個 index 恰好一次，繁體中文。""" + outline_context

    def llm_fix(batch):
        inputs = [{"index": i, "text": s["text"], "sourceCandidates": s["sourceMatches"]}
                  for i, s in enumerate(batch)]
        messages = [{"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(inputs, ensure_ascii=False)}]
        try:
            content = call_llm_completion(messages, temperature=0.0, timeout=120,
                                          max_tokens=dynamic_max_tokens([s["text"] for s in batch]))
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
            data = json.loads(content)
            # 相容歷史整句提案，亦逐筆拆解審查，不整句退回。
            if isinstance(data, list) and len(data) == len(batch) and all(isinstance(t, str) and t.strip() for t in data):
                return [propose_diff(s["text"], t) for s, t in zip(batch, data)]
            items = data.get("sentences") if isinstance(data, dict) else None
            if (not isinstance(items, list) or len(items) != len(batch)
                    or any(not isinstance(item, dict) or type(item.get("index")) is not int
                           or not isinstance(item.get("patches"), list) for item in items)
                    or sorted(item["index"] for item in items) != list(range(len(batch)))):
                return None
            return [item["patches"] for item in sorted(items, key=lambda item: item["index"])]
        except Exception as error:
            print(f"  ⚠️ 局部提案解析失敗：{error}")
            return None

    def proofread_with_retry(batch):
        patches = llm_fix(batch)
        if patches is None:
            if len(batch) > 1:
                middle = len(batch) // 2
                return proofread_with_retry(batch[:middle]) + proofread_with_retry(batch[middle:])
            return [dict(batch[0], reviewNeeded=True, uncertainty="LLM 句數不符，未校對")]
        result = []
        for sentence, proposals in zip(batch, patches):
            checked = apply_patches(sentence["text"], proposals, learned, sentence["sourceMatches"])
            row = dict(sentence, text=checked["text"], editAudit=sentence["editAudit"] + checked["edits"])
            if checked["reviewNeeded"]:
                row.update(reviewNeeded=True, uncertainty="部分局部修改無足夠依據，已保留原話待核對")
            result.append(row)
        return result

    batches = [prepared[i:i + 8] for i in range(0, len(prepared), 8)]
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(proofread_with_retry, batches))
    return [row for result in results for row in result]


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

def load_asr_result(path, audio_path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    actual = hashlib.sha256(Path(audio_path).read_bytes()).hexdigest()
    if data.get("provenance", {}).get("audio_sha256") != actual:
        raise ValueError("ASR 快取與指定音檔雜湊不符")
    duration = data.get("duration")
    segments = data.get("segments")
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0 or not isinstance(segments, list) or not segments:
        raise ValueError("ASR 快取缺少有效的時長與句段")
    previous = 0
    for row in segments:
        if (not isinstance(row.get("text"), str) or not row["text"].strip()
                or not all(isinstance(row.get(key), (int, float)) and math.isfinite(row[key]) for key in ("start", "end"))
                or row["start"] < previous - .05 or row["end"] < row["start"]
                or row["end"] > duration + .1):
            raise ValueError("ASR 快取含無效文字或聲學時間")
        previous = row["end"]
    return data


def process_single_session(session_id, audio_map, whisper_model=None, session_map=None,
                           output_dir=None, audio_path=None, asr_json=None):
    root = Path(__file__).resolve().parent.parent
    json_path = (Path(output_dir) if output_dir else SESSIONS_DIR) / f"session_{session_id}.json"
    protected = [(root / SESSIONS_DIR / f"session_{sid}.json").resolve() for sid in ("36A", "36B")]
    if json_path.resolve() in protected:
        raise ValueError("36A/36B 已發佈檔案不得覆寫，請使用 --output-dir")
    validate_output_path(json_path)
    if output_dir:
        resolved = Path(output_dir).resolve()
        courses = (root / "courses").resolve()
        if resolved == courses or courses in resolved.parents:
            raise ValueError("實驗輸出不得放入正式 courses 目錄")
    json_path.parent.mkdir(parents=True, exist_ok=True)
    def checkpoint(name, data):
        if output_dir:
            target = validate_output_path(Path(output_dir) / name)
            if (root / "courses").resolve() in target.parents:
                raise ValueError("沙盒檔案不得連結至正式 courses 目錄")
            target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if session_id not in audio_map:
        raise ValueError(f"Session {session_id} not found in audio_map.json")

    audio_url = audio_map[session_id]
    session_title_info = (session_map or {}).get(session_id, {})
    title = session_title_info.get("title", f"第 {session_id} 堂")
    grounding_data = get_session_source_text(session_id, session_map or {})
    grounding_text = grounding_data[0]
    grounding_terms = grounding_data[1]

    print(f"\n=======================================================")
    print(f"🚀 PROCESSING SESSION {session_id} — Grounded Pipeline Standard")
    print(f"=======================================================")

    asr_health = {}
    cached = load_asr_result(asr_json, audio_path) if asr_json and audio_path else None
    if asr_json and cached is None:
        raise ValueError("ASR 快取必須提供原始音檔")
    if cached is None:
        try:
            health = requests.get(WHISPER_GPU_URL.replace("/v1/audio/transcriptions", "/health"), timeout=5)
            health.raise_for_status()
            asr_health = health.json()
        except Exception:
            pass
    checkpoint("asr_service_health.json", asr_health)

    page_range = session_title_info.get("pageRange", "")
    if cached is not None:
        raw_sentences, duration = cached["segments"], cached["duration"]
        checkpoint("asr_provenance.json", cached["provenance"])
    else:
        raw_sentences, duration = step1_asr_transcribe(session_id, (Path(audio_path) if audio_path else download_audio_if_needed(session_id, audio_url)), whisper_model, page_range=page_range)

    checkpoint("01_asr.json", {"duration": duration, "segments": raw_sentences})

    # Step 2: Pre-polish
    pre_polished = step2_pre_polish(raw_sentences, dynamic_terms=grounding_terms)

    checkpoint("02_prepolished.json", pre_polished)

    # Step 3: LLM Proofreading
    proofread_sentences = step3_llm_proofread(pre_polished, session_id, source_text=grounding_text)

    checkpoint("03_proofread.json", proofread_sentences)

    # Step 4: Semantic Structuring & Headings
    paragraphs = step4_llm_structure(proofread_sentences, session_id, title)

    # Calculate precise start and end for paragraphs
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
            "engine": "whisper-isolated" if cached else ("whisper-service" if asr_health else f"whisper-{WHISPER_MODEL_NAME}-unverified"),
            "asr_provenance": cached["provenance"] if cached else None,
            "asr_requested_model": WHISPER_MODEL_NAME,
            "asr_service_health": asr_health,
            "vad_requested_ms": VAD_MIN_SILENCE_MS,
            "llm_proofread": "Qwen3.8-27B Grounded（模型修改另列待審）",
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
    except ImportError as e:
        raise RuntimeError("必須安裝 OpenCC 才能輸出正體中文") from e

    if output_dir:
        from build_verbatim_track import build_verbatim_payload
        # 使用已轉正體的句子，保留聲學時間及待審標記。
        rows = [s for p in payload["paragraphs"] for s in p["sentences"]]
        checkpoint(f"verbatim_{session_id}.json", build_verbatim_payload(session_id, rows, payload["paragraphs"]))

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
    parser.add_argument("--output-dir", type=Path, help="沙盒輸出根目錄，每講建立子目錄")
    parser.add_argument("--audio-path", type=Path, help="單一講次使用本機音檔或切片")
    parser.add_argument("--asr-json", type=Path, help="由同音檔產生且具雜湊的獨立 ASR 結果")
    args = parser.parse_args()
    if args.asr_json and not args.audio_path:
        parser.error("--asr-json 必須搭配 --audio-path")
    if args.audio_path and (not args.sessions or len(args.sessions) != 1):
        parser.error("--audio-path 必須搭配單一 --sessions")

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

    global PROGRESS_FILE
    if args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        PROGRESS_FILE = args.output_dir / "conversion_progress.json"

    # Check for Whisper Model (Optional local fallback)
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

    import threading
    _local = threading.local()

    def get_thread_model():
        if not hasattr(_local, "model"):
            try:
                from faster_whisper import WhisperModel
                _local.model = WhisperModel(WHISPER_MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=8)
            except Exception:
                _local.model = None
        return _local.model

    def worker_task(sid):
        try:
            t0 = time.time()
            model = None if args.asr_json else get_thread_model()
            process_single_session(sid, audio_map, model, session_map=session_map,
                                   output_dir=args.output_dir / sid if args.output_dir else None,
                                   audio_path=args.audio_path, asr_json=args.asr_json)
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
    if any(progress.get(sid, {}).get("status") == "FAILED" for sid in pending_targets):
        sys.exit(1)

if __name__ == "__main__":
    main()

