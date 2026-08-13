#!/usr/bin/env python3
"""
transcribe_79_102.py - ASR + RAG 校正 → Transcriptions session JSON for sessions 79-102.

Reads /tmp/flyday_79_102.txt (format: N\tname\turl), for each audio file:
  1. ffmpeg → WAV → qwen3-asr API (audio-cpp :8002)
  2. agy RAG-grounded correction (fallback: eneural DeepSeek → MiniMax)
  3. Convert corrected text into Transcriptions session.json schema:
     {sessionId, title, audioUrl, paragraphs[{id, start, end, sentences[]}]}

Output: courses/入中論善顯密意疏/sessions/session_{sessionId}.json
Use hermes venv python: /home/henry/.hermes/hermes-agent/venv/bin/python3
"""

import os, sys, re, json, time, subprocess, glob

# ---- Paths ----
AUDIO_DIR = '/home/henry/audio_files'
SESSIONS_DIR = '/home/henry/.gx10/xiaofa/workspace/Transcriptions/courses/入中論善顯密意疏/sessions'
FLYDAY_LIST = '/tmp/flyday_79_102.txt'
RAG_GROUND_TRUTH = '/home/henry/gdrive/KnowledgeSources/入中論善顯密意疏 2016.md'

# ---- ASR ----
ASR_URL = 'http://localhost:8002/v1/audio/transcriptions'
ASR_MODEL = 'qwen3-asr'

# ---- API keys ----
def _load_env(path):
    env = {}
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env

_E_ENV = _load_env(os.path.expanduser('~/.gx10/litellm-spike/.env'))
_M_ENV = _load_env(os.path.expanduser('~/.hermes/.env'))
ENEURAL_API_KEY = _E_ENV.get('ENEURAL_API_KEY', '')
MINIMAX_API_KEY = _M_ENV.get('MINIMAX_CN_API_KEY', '')

# ---- Correction table (s→t common ASR errors, longest first) ----
CORRECTION_TABLE = {
    "龙树菩萨": "龍樹菩薩",
    "李赞文": "禮讚文",
    "龙树": "龍樹",
    "波若": "般若",
    "印澄": "月稱",
    "月生": "月稱",
    "秩序派": "應成派",
    "自逆": "自續",
    "自力": "自續",
    "四帝": "四諦",
    "他身": "他生",
    "全无自性身": "全無自性生",
}
try:
    from opencc import OpenCC
    _CC = OpenCC('s2t')
except ImportError:
    _CC = None

def apply_corrections(text):
    result = text
    for old, new in sorted(CORRECTION_TABLE.items(), key=lambda x: -len(x[0])):
        result = result.replace(old, new)
    if _CC:
        result = _CC.convert(result)
    return result

# ---- ASR ----
def asr_full(mp3_path):
    wav_path = mp3_path + '.wav'
    try:
        r = subprocess.run(
            ['ffmpeg', '-y', '-i', mp3_path, '-ar', '16000', '-ac', '1',
             '-c:a', 'pcm_s16le', wav_path],
            capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            print(f'  [ASR] ffmpeg failed: {r.stderr[-200:]}')
            return None
        r = subprocess.run(
            ['curl', '-s', '-X', 'POST', ASR_URL,
             '-F', f'file=@{wav_path}',
             '-F', f'model={ASR_MODEL}',
             '-F', 'language=zh',
             '-F', 'response_format=json'],
            capture_output=True, text=True, timeout=600)
        try:
            return json.loads(r.stdout).get('text', '')
        except json.JSONDecodeError:
            print(f'  [ASR] JSON parse failed: {r.stdout[:200]}')
            return None
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)

# ---- agy RAG correction ----
AGY_PROMPT = """你是《入中論善顯密意疏》的領域校正專家（中觀應成派、藏傳格魯派格西講授）。

## 你的兩個檔案：
1. 逐字稿（要校正）：{transcript_path}
2. 原典（ground truth）：{rag_path}

## 校正原則：
- 簡轉繁、佛法術語、同音錯字
- 【最重要】原典引用必須對照原典
  - 講者念的偈頌、人名、術語引用，如果原典有寫，必須用原典版本
  - 不要憑模型記憶重建偈頌
- 【禁止】不要從原典新增任何內容到逐字稿
  - 只校正 ASR 既有文字（簡轉繁、術語修正、同音錯字）
  - 不可從 RAG 知識庫插入原典段落、偈頌、引文到逐字稿
- 保留規則：時間標記 [MM:SS] 不變、口語風格不變、不要過度詮釋
- 不要把講者重複詞去除（這是逐字稿非摘要）
- 不要在檔尾加任何提示或註解

請閱讀逐字稿並校正後，把完整校正結果輸出到 stdout，不要寫到任何檔案。"""

def agy_correct(raw_path, agy_path):
    prompt = AGY_PROMPT.format(transcript_path=raw_path, rag_path=RAG_GROUND_TRUTH)
    try:
        r = subprocess.run(
            ['agy', '--dangerously-skip-permissions', '-p', prompt],
            capture_output=True, text=True, timeout=600)
        output = r.stdout
        if not output or len(output.strip()) < 100:
            return False
        m = re.search(r'(\[\d{2}:\d{2}\]|好。|嗯。|從|敬禮|皈依|今天|各位)', output)
        if m:
            output = output[m.start():]
        output = re.sub(r'^以上為依據.*校正完畢.*$', '', output, flags=re.M)
        with open(agy_path, 'w') as f:
            f.write(output)
        return True
    except (subprocess.TimeoutExpired, Exception) as e:
        print(f'  [AGY] {type(e).__name__}: {e}')
        return False

# ---- eneural fallback ----
def eneural_correct(raw_path, agy_path):
    if not ENEURAL_API_KEY:
        return False
    with open(raw_path) as f:
        content = f.read()
    if not content.strip():
        return False
    chunks = [content[i:i+1500] for i in range(0, len(content), 1500)]
    results = []
    for chunk in chunks:
        prompt = f"""請逐字修正以下逐字稿中的錯誤（錯別字、佛法術語、簡轉繁、同音字）。
保持原意不變，只修正錯誤，不新增內容，不改段落結構。
【逐字稿】{chunk}【校正後】"""
        ok = False
        for _ in range(2):
            try:
                r = subprocess.run(
                    ['curl', '-s', '-X', 'POST',
                     'https://agents.eneural.ai/v1/chat/completions',
                     '-H', 'Content-Type: application/json',
                     '-H', f'Authorization: Bearer {ENEURAL_API_KEY}',
                     '-d', json.dumps({
                         "model": "DeepSeek-V4-Flash-0731",
                         "messages": [{"role": "user", "content": prompt}],
                         "max_tokens": 2048
                     })],
                    capture_output=True, text=True, timeout=120)
                text = json.loads(r.stdout)['choices'][0]['message']['content']
                if text:
                    results.append(text)
                    ok = True
                    break
            except Exception:
                pass
        if not ok:
            return False
    with open(agy_path, 'w') as f:
        f.write(apply_corrections(''.join(results)))
    return True

# ---- MiniMax fallback ----
def minimax_correct(raw_path, agy_path):
    if not MINIMAX_API_KEY:
        return False
    with open(raw_path) as f:
        content = f.read()
    if not content.strip():
        return False
    chunks = [content[i:i+3000] for i in range(0, len(content), 3000)]
    results = []
    for chunk in chunks:
        prompt = f"""請校正以下逐字稿的錯別字、佛法術語。
1. 保持原意不變，只修正錯誤 2. 佛法術語保持正確 3. 不新增內容 4. 保持段落結構
【逐字稿】{chunk}【校正後】"""
        try:
            r = subprocess.run(
                ['curl', '-s', '-X', 'POST',
                 'https://api.minimaxi.com/v1/chat/completions',
                 '-H', 'Content-Type: application/json',
                 '-H', f'Authorization: Bearer {MINIMAX_API_KEY}',
                 '-d', json.dumps({
                     "model": "MiniMax-M3",
                     "messages": [{"role": "user", "content": prompt}],
                     "max_tokens": 4096,
                     "thinking": {"type": "disabled"}
                 })],
                capture_output=True, text=True, timeout=120)
            text = json.loads(r.stdout)['choices'][0]['message']['content']
            if '【校正後】' in text:
                text = text.split('【校正後】')[-1]
            results.append(text)
        except Exception:
            return False
    with open(agy_path, 'w') as f:
        f.write(''.join(results))
    return True

def correct_with_fallback(raw_path, agy_path):
    if agy_correct(raw_path, agy_path):
        return 'AGY'
    if eneural_correct(raw_path, agy_path):
        return 'ENEURAL'
    if minimax_correct(raw_path, agy_path):
        return 'MINIMAX'
    return None

# ---- Convert text → session JSON ----
def parse_meta(filename):
    """Parse flyday filename → sessionId, date, page, section, sub."""
    name = os.path.basename(filename)
    m = re.match(r'(\d{4})(\d{2})(\d{2})-([AB])\s+(.*?)-(.*?)(?:p|頁)(\d+)\((\d+)\)', name)
    if not m:
        return None
    yyyy, mm, dd, sub, course, section, page, num = m.groups()
    session_id = f'{int(num):02d}{sub}'
    return {
        'date': f'{yyyy}-{mm}-{dd}',
        'sub': sub,
        'num': int(num),
        'sessionId': session_id,
        'page': int(page),
        'section': section.strip(),
        'course': course.strip(),
        'title': f'第 {int(num)}{sub} 堂 ({"上節" if sub=="A" else "下節"}) | {yyyy}-{mm}-{dd} | p.{page}',
    }

def text_to_session_json(raw_text, meta, audio_duration=None):
    """Convert raw ASR text → session JSON with synthetic timestamps.
    Splits by Chinese punctuation; assigns 120s paragraphs + 8s sentence steps."""
    paragraphs_raw = re.split(r'[。|\n]+', raw_text)
    paragraphs_raw = [p.strip() for p in paragraphs_raw if p.strip()]
    paragraphs = []
    p_secs = 120.0
    for pi, ptext in enumerate(paragraphs_raw):
        sentences_raw = re.split(r'[，；！？]+', ptext)
        sentences_raw = [s.strip() for s in sentences_raw if s.strip()]
        n = max(len(sentences_raw), 1)
        sentences = []
        for si, stext in enumerate(sentences_raw):
            start = round(pi * p_secs + si * (p_secs / n), 2)
            end = round(pi * p_secs + (si + 1) * (p_secs / n), 2)
            sentences.append({'start': start, 'end': end, 'text': stext})
        if not sentences:
            continue
        paragraphs.append({
            'id': f'p-{pi+1}',
            'start': sentences[0]['start'],
            'end': sentences[-1]['end'],
            'sentences': sentences,
        })
    # Rescale to actual duration if known
    if audio_duration and paragraphs:
        synthetic_total = len(paragraphs) * p_secs
        if synthetic_total > 0:
            scale = audio_duration / synthetic_total
            for para in paragraphs:
                para['start'] = round(para['start'] * scale, 2)
                para['end'] = round(para['end'] * scale, 2)
                for s in para['sentences']:
                    s['start'] = round(s['start'] * scale, 2)
                    s['end'] = round(s['end'] * scale, 2)
    return {
        'sessionId': meta['sessionId'],
        'title': meta['title'],
        'audioUrl': f'audio/{meta["sessionId"]}.mp3',
        'paragraphs': paragraphs,
    }

def get_audio_duration(mp3_path):
    try:
        r = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', mp3_path],
            capture_output=True, text=True, timeout=10)
        if r.returncode == 0 and r.stdout.strip():
            return float(r.stdout.strip())
    except Exception:
        pass
    return None

def process_one(audio_path, work_dir):
    meta = parse_meta(audio_path)
    if not meta:
        print(f'  [SKIP] cannot parse: {os.path.basename(audio_path)}')
        return False
    session_id = meta['sessionId']
    out_json = os.path.join(SESSIONS_DIR, f'session_{session_id}.json')
    if os.path.exists(out_json):
        print(f'  [SKIP] {session_id} already exists')
        return True
    raw_path = os.path.join(work_dir, f'{session_id}_raw.txt')
    cor_path = os.path.join(work_dir, f'{session_id}_cor.txt')
    if not os.path.exists(raw_path):
        print(f'  [ASR] {session_id}...')
        text = asr_full(audio_path)
        if not text or len(text.strip()) < 50:
            print(f'  [ASR-FAIL] {session_id} empty output')
            return False
        with open(raw_path, 'w') as f:
            f.write(text)
    if not os.path.exists(cor_path):
        print(f'  [COR] {session_id}...')
        engine = correct_with_fallback(raw_path, cor_path)
        if not engine:
            print(f'  [COR-FAIL] {session_id}')
            return False
        print(f'  [COR-OK] {session_id} via {engine}')
    with open(cor_path) as f:
        cor_text = f.read()
    dur = get_audio_duration(audio_path)
    session_json = text_to_session_json(cor_text, meta, dur)
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(session_json, f, ensure_ascii=False, indent=2)
    print(f'  [OK] {session_id} → {out_json}')
    return True

def main():
    if not os.path.exists(FLYDAY_LIST):
        print(f'Missing {FLYDAY_LIST}')
        sys.exit(1)
    work_dir = '/tmp/transcribe_79_102_work'
    os.makedirs(work_dir, exist_ok=True)
    items = []
    with open(FLYDAY_LIST) as f:
        for line in f:
            parts = line.strip().split('\t')
            if len(parts) >= 2:
                items.append(parts)
    print(f'Total {len(items)} audio files to process')
    ok = 0
    for i, parts in enumerate(items, 1):
        name = parts[1]
        audio_path = os.path.join(AUDIO_DIR, name)
        if not os.path.exists(audio_path):
            print(f'[{i}/{len(items)}] MISSING: {name}')
            continue
        print(f'[{i}/{len(items)}] {name}')
        if process_one(audio_path, work_dir):
            ok += 1
    print(f'\nDone: {ok}/{len(items)} sessions generated')

if __name__ == '__main__':
    main()
