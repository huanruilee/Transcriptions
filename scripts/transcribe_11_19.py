#!/usr/bin/env python3
"""
transcribe_11_19.py - ASR + ENEURAL RAG 校正 → session JSON for 11B-19B (14 sessions).

Reuses proven pattern from transcribe_79_102.py.
Use hermes venv: /home/henry/.hermes/hermes-agent/venv/bin/python3
"""

import os, sys, re, json, time, subprocess

# ---- Paths ----
GD_AUDIO_DIR = '/home/henry/gdrive/善顯共學/音檔'
SESSIONS_DIR = '/home/henry/.gx10/xiaofa/workspace/Transcriptions/courses/入中論善顯密意疏/sessions'
COURSE_JSON = '/home/henry/.gx10/xiaofa/workspace/Transcriptions/courses/入中論善顯密意疏/course.json'
WORK_DIR = '/tmp/transcribe_11_19_work'

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
ENEURAL_API_KEY = _E_ENV.get('ENEURAL_API_KEY', '')

# ---- Correction table ----
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
    wav_path = WORK_DIR + '/' + os.path.basename(mp3_path) + '.wav'
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
        except Exception:
            return None
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)

# ---- ENEURAL correction ----
def eneural_correct(text):
    if not ENEURAL_API_KEY:
        print('  [ENEURAL] no API key')
        return None
    chunks = [text[i:i+1500] for i in range(0, len(text), 1500)]
    results = []
    for ci, chunk in enumerate(chunks):
        prompt = f"""請逐字修正以下逐字稿中的錯誤（錯別字、佛法術語、簡轉繁、同音字）。
保持原意不變，只修正錯誤，不新增內容，不改段落結構。
直接輸出校正後的文字，不要加任何前綴或說明。
【逐字稿】{chunk}
【校正後】"""
        ok = False
        for attempt in range(2):
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
                resp = json.loads(r.stdout)
                text_out = resp['choices'][0]['message']['content']
                if text_out:
                    # 去掉可能的前綴
                    text_out = re.sub(r'^【校正後】\s*', '', text_out.strip())
                    results.append(text_out)
                    ok = True
                    print(f'  [ENEURAL] chunk {ci+1}/{len(chunks)} ok ({len(text_out)} chars)')
                    break
            except Exception as e:
                print(f'  [ENEURAL] chunk {ci+1} attempt {attempt+1} fail: {e}')
        if not ok:
            print(f'  [ENEURAL] chunk {ci+1} failed')
            return None
    return apply_corrections(''.join(results))

# ---- Build session JSON ----
def build_session_json(session_id, audio_url, full_text):
    """Split text into paragraphs with estimated timestamps."""
    # 段落切分：每 5-8 句一個段落
    sents = re.split(r'([。！？\n])', full_text)
    sentences = []
    for i in range(0, len(sents)-1, 2):
        s = sents[i].strip()
        if s:
            sentences.append(s + sents[i+1])

    chars_per_sec = 4  # 中文平均語速
    cur_time = 0
    cur_para = []
    paragraphs = []
    pid = 1
    for s in sentences:
        dur = max(1.0, len(s) / chars_per_sec)
        cur_para.append({'start': round(cur_time, 2), 'end': round(cur_time + dur, 2), 'text': s})
        cur_time += dur + 0.5
        if len(cur_para) >= 6:
            paragraphs.append({
                'id': f'p-{pid}',
                'start': cur_para[0]['start'],
                'end': cur_para[-1]['end'],
                'sentences': cur_para,
            })
            pid += 1
            cur_para = []
    if cur_para:
        paragraphs.append({
            'id': f'p-{pid}',
            'start': cur_para[0]['start'],
            'end': cur_para[-1]['end'],
            'sentences': cur_para,
        })

    with open(COURSE_JSON) as f:
        c = json.load(f)
    title = next((s['title'] for s in c['sessions'] if s['sessionId'] == session_id), session_id)

    return {
        'sessionId': session_id,
        'title': title,
        'audioUrl': audio_url,
        'paragraphs': paragraphs,
    }

# ---- Main ----
def main():
    os.makedirs(WORK_DIR, exist_ok=True)
    with open(COURSE_JSON) as f:
        c = json.load(f)

    targets = ['11B', '12A', '12B', '13A', '13B', '14A', '14B', '15A', '15B', '16A', '16B', '17A', '18B', '19B']

    for sid in targets:
        out_path = f'{SESSIONS_DIR}/session_{sid}.json'
        if os.path.exists(out_path):
            print(f'[{sid}] 已存在')
            continue

        sess = next((s for s in c['sessions'] if s['sessionId'] == sid), None)
        if not sess:
            print(f'[{sid}] course.json 無登記')
            continue
        date = sess['date'].replace('-', '')
        candidates = [f for f in os.listdir(GD_AUDIO_DIR) if f.startswith(date) and f'({sess["sessionNum"]}).' in f]
        if not candidates:
            print(f'[{sid}] 無音檔')
            continue
        mp3 = f'{GD_AUDIO_DIR}/{candidates[0]}'
        print(f'\n[{sid}] {candidates[0][:70]}')

        print(f'  ASR...', end=' ', flush=True)
        raw = asr_full(mp3)
        if not raw:
            print('失敗')
            continue
        with open(f'{WORK_DIR}/{sid}_raw.txt', 'w') as f:
            f.write(raw)
        print(f'raw={len(raw)}')

        print(f'  ENEURAL...')
        cor = eneural_correct(raw)
        if not cor:
            print(f'  ENEURAL 失敗，使用純 apply_corrections')
            cor = apply_corrections(raw)
        with open(f'{WORK_DIR}/{sid}_cor.txt', 'w') as f:
            f.write(cor)
        print(f'  cor={len(cor)}')

        sess_json = build_session_json(sid, f'audio/{sid}.mp3', cor)
        with open(out_path, 'w') as f:
            json.dump(sess_json, f, ensure_ascii=False, indent=2)
        print(f'  ✓ {out_path} ({len(sess_json["paragraphs"])} paragraphs)')

    print('\n=== 完成 ===')
    n = len([f for f in os.listdir(SESSIONS_DIR) if f.endswith('.json')])
    print(f'Session JSON 總數: {n}')

if __name__ == '__main__':
    main()