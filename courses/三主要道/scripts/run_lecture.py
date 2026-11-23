#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SZYD-GDOC 管線：對既有 session JSON 做補標點＋校正＋分段 → 衍生 doc JSON。

用法：
  python3 run_lecture.py --stage all  --lecture 5     # 全階段
  python3 run_lecture.py --stage punct --lecture 5    # 單階段（可斷點續跑）

階段：
  P punct     補標點（只加標點，逐句 token 不變驗證）
  C correct   兩階段校正（propose → 機械過濾 → adjudicate → 套用）→ ledger
  S segment   段落切點（只回 sentence index，不改字）
  B build     落 sessions_doc/L{XX}.doc.json
"""
import argparse, collections, difflib, json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'http://100.113.144.100:18765'
MODEL = 'qwen3.8-flash-next-iq3_s'
WT = '/home/henry/.gx10/xiaofa/workspace/worktrees/szyd-doc'
WORK = '/home/henry/.gx10/projects/szyd-gdoc'
PUNCT_RE = re.compile(r'[，。？！：；、「」『』（）《》〈〉…—·,.\?!:;\'"』」]'
                      )
MAX_SENT_PER_BLOCK = 40
THREADS = int(os.environ.get('SZYD_THREADS', '6'))
AI_SUMMARY_RE = re.compile(r'^《三主要道》第\d+講')

# 高置信音近錯字詞庫（來源：repo learned_corrections + 抽樣實證；先於 LLM 輪確定性套用）
RULEBOOK = {
    '鼎禮': '頂禮', '力士造論': '立誓造論', '依止善之事': '依止善知識',
    '圓著': '緣著', '常識閉關': '長期閉關', '立贊文': '禮讚文',
    '具援求託': '具緣求脫', '大聖法': '大乘法', '三世道': '三士道',
    '上世道': '上士道', '文法的動機': '聞法的動機', '八賢暇': '八閒暇',
    '升起信心': '生起信心', '適量論': '釋量論', '元起讚': '緣起讚',
    '稱嘆': '稱歎', '祭誦': '偈頌', '新要義': '心要義',
    '具援': '具緣', '卜特且羅': '補特伽羅',
    '我直': '我執',  # 排除「我直接」
}
RULEBOOK_GUARDS = {'我直': re.compile(r'我直(?!接)')}


def needs_punct(text):
    """缺標點或句內用空格代替標點。"""
    core = text.strip()
    if not re.search(r'[，。？！：；、「」』）]', core):
        return True
    return bool(re.search(r'[\u4e00-\u9fff] [\u4e00-\u9fff]', core))


def norm(s: str) -> str:
    return PUNCT_RE.sub('', re.sub(r'\s', '', s))


def chat(messages, max_tokens=6000, temperature=0.2, retries=4):
    body = {"model": MODEL, "messages": messages, "max_tokens": max_tokens,
            "temperature": temperature, "chat_template_kwargs": {"enable_thinking": False}}
    last = None
    for a in range(retries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(
                BASE + '/v1/chat/completions', data=json.dumps(body).encode(),
                headers={'Content-Type': 'application/json'}), timeout=900)
            out = json.load(r)
            c = out['choices'][0]['message']['content']
            if c:
                return c
        except Exception as e:  # noqa
            last = e
            time.sleep(3 * (a + 1))
    raise RuntimeError(f'LLM failed: {last}')


def parse_json(text):
    m = re.search(r'```(?:json)?\s*(.+?)```', text, re.S)
    if m:
        text = m.group(1)
    start = min([i for i in (text.find('['), text.find('{')) if i >= 0], default=-1)
    if start < 0:
        raise ValueError('no json: ' + text[:80])
    return json.loads(text[start: text.rindex(']') + 1] if text.lstrip()[0] == '['
                      else text[start: text.rindex('}') + 1])


def load_lexicon():
    lc = json.load(open(f'{WT}/courses/三主要道/learned_corrections.json'))
    hints = [f"{k} → {v['corrected']}（{v.get('reasoning','')}）"
             for k, v in lc.get('global_terms', {}).items() if k != v['corrected']]
    return hints


LEXICON = None


def load_sentences(n):
    d = json.load(open(f'{WT}/courses/三主要道/sessions/session_{n:02d}.json'))
    sents = []
    for pi, p in enumerate(d['paragraphs']):
        for s in p['sentences']:
            sents.append({'pi': pi, 'id': s['id'], 'start': s['start'], 'end': s['end'],
                          'text': s['text'], 'raw': s.get('rawText') or ''})
    meta = {'sessionId': d['sessionId'], 'title': d['title'], 'youtubeVideoId': d.get('youtubeVideoId'),
            'youtubeUrl': d.get('youtubeUrl'), 'lastUpdated': d.get('lastUpdated'),
            'paragraphs_meta': [{'pi': i, 'heading': p.get('heading'),
                                 'n': len(p['sentences'])} for i, p in enumerate(d['paragraphs'])]}
    return d, sents, meta


def blocks_of(sents, pi):
    """一個段落切多塊，塊間共享語境：回 [(glob_i, sent_dict), ...] 清單的清單"""
    idx = [i for i, s in enumerate(sents) if s['pi'] == pi]
    return [idx[i:i + MAX_SENT_PER_BLOCK] for i in range(0, len(idx), MAX_SENT_PER_BLOCK)]


def cache_get(stage, n, key):
    p = f'{WORK}/cache/{stage}/L{n:02d}_{key}.json'
    if os.path.exists(p):
        return json.load(open(p))
    return None


def cache_put(stage, n, key, obj):
    os.makedirs(f'{WORK}/cache/{stage}', exist_ok=True)
    json.dump(obj, open(f'{WORK}/cache/{stage}/L{n:02d}_{key}.json', 'w'), ensure_ascii=False, indent=1)


# ---------------- Stage P: punctuation ----------------

P_SYS = ('你是佛教逐字稿編輯。任務：為聽寫逐字稿的每一句加上恰當中文標點。'
         '規則：1) 逐句處理，輸入幾句就輸出幾句，順序與編號不變；'
         '2) 只能【增加】標點符號，既有標點與一切漢字（包括語氣詞）一律不得增刪改；'
         '3) 每句都是講師口語的**語意片段**，多數句子在聽完 context 與 next 後'
         '才知完整意思：語意未完（後面還接著同一句話）用「，」；'
         '語意完整（自成一個意思）用「。」；疑問用「？」；'
         '4) 引用經論原文用「」；書名用《》；5) 重複、口吃、自我修正照樣保留，不加不刪。'
         '輸出：嚴格 JSON 陣列 [{"i":編號,"t":"加標點後整句"}]，不要解釋。')

PCHARS = '，。？！：；、「」《》（）『』'


def punct_ok(inp, out):
    """漢字序列完全相同，且標點總數不得減少（只准增加或等量替換，如 ，→；）。"""
    strip = lambda x: re.sub(r'[\s' + PCHARS + r']', '', x)
    if strip(inp) != strip(out):
        return False
    ni = sum(1 for c in inp if c in PCHARS)
    no = sum(1 for c in out if c in PCHARS)
    return no >= ni


def punct_block(n, blk, sents):
    key = f'p{blk[0]}_{blk[-1]}'
    hit = cache_get('punct', n, key)
    if hit is not None:
        hit['texts'] = {int(k): v for k, v in hit['texts'].items()}
        # 舊快取可能減標點或等於原文：用新規則複驗，不合格作廢重求
        if all(i in hit['texts'] and punct_ok(sents[i]['text'], hit['texts'][i])
               and not (needs_punct(sents[i]['text']) and needs_punct(hit['texts'][i]))
               for i in blk):
            return hit
    ctx = sents[max(0, blk[0] - 8): blk[0]]
    look = sents[blk[-1] + 1: blk[-1] + 4]
    body = {'context': [s['text'] for s in ctx],
            'next': [s['text'] for s in look],
            'sentences': [
        {'i': i, 't': sents[i]['text']} for i in blk]}
    out = None
    pending = list(blk)
    best = {}  # 跨嘗試累積：已驗證句的結果保留
    for attempt in range(3):
        body['sentences'] = [{'i': i, 't': sents[i]['text']} for i in pending]
        resp = chat([{'role': 'system', 'content': P_SYS},
                     {'role': 'user', 'content': json.dumps(body, ensure_ascii=False)}])
        try:
            arr = parse_json(resp)
        except Exception:
            continue
        got = {int(x['i']): x['t'] for x in arr if isinstance(x, dict) and 'i' in x and 't' in x}
        fails = []
        for i in pending:
            t = got.get(i)
            if (t is None or not punct_ok(sents[i]['text'], t)
                    or (needs_punct(sents[i]['text']) and needs_punct(t))):
                fails.append(i)  # 失敗保留原文（流程 §4.3）
            else:
                best[i] = t
        out = {'texts': {i: best.get(i, sents[i]['text']) for i in blk},
               'verified': not fails, 'attempt': attempt}
        if not fails:
            break
        pending = fails  # 只重送失敗句
    if out is None:
        out = {'texts': {i: sents[i]['text'] for i in blk}, 'verified': False, 'attempt': -1}
    cache_put('punct', n, key, out)
    return out


# ---------------- Stage C: correction ----------------

def propose_block(n, blk, sents, lex, rnd=1):
    key = f'r{rnd}_c{blk[0]}_{blk[-1]}'
    hit = cache_get('propose', n, key)
    if hit is not None:
        return hit
    focus = ('特別注意：經名／論名（《禮讚文》《緣起讚》《釋量論》等）、人名、'
             '佛教名相（我執、四諦、頂禮、偈頌、心要義等）。' if rnd == 2 else '')
    sysmsg = ('你是佛教文獻校對員。以下是如性法師《三主要道》研討課程 ASR 逐字稿（已加標點）。'
              '找出明顯的「同音／音近錯字」與「佛法名相錯字」，例如：鼎禮→頂禮、力士造論→立誓造論、'
              '依止善之事→依止善知識、圓著→緣著、常識閉關→長期閉關、立贊文→禮讚文、'
              '祭誦→偈頌、新要義→心要義、稱嘆→稱歎、四聖地→四諦、我直→我執。'
              '已知術語對照（僅供提示，須符合語境才提出）：\n' + '\n'.join(lex[:40]) +
              ('\n' + focus if focus else '') +
              '\n規則：1) 只提「音近錯字／名相錯字／簡體殘留」類修正；'
              '2) 不得改語序、不得增刪字數超過原詞、不得潤飾文句、不得刪重複；'
              '3) 沒把握就不要提；寧缺勿濫；4) before 必須是原句中的連續子字串。'
              '輸出嚴格 JSON：[{"i":句編號,"before":"原詞","after":"修正詞","reason":"音近/名相/簡體"}]，無則 []。')
    body = {'sentences': [{'i': i, 't': sents[i]['text']} for i in blk]}
    out = None
    for attempt in range(2):
        resp = chat([{'role': 'system', 'content': sysmsg},
                     {'role': 'user', 'content': json.dumps(body, ensure_ascii=False)}])
        try:
            arr = parse_json(resp)
            out = [x for x in arr if isinstance(x, dict) and {'i', 'before', 'after'} <= set(x)]
            break
        except Exception:
            continue
    out = out or []
    cache_put('propose', n, key, out)
    return out


def mechanical_filter(cands, sents):
    ok, rej = [], []
    for c in cands:
        i, b, a = int(c['i']), c['before'], c['after']
        if i not in range(len(sents)):
            rej.append((c, 'idx')); continue
        t = sents[i]['text']
        if b == a or b not in t:
            rej.append((c, 'before-not-found')); continue
        if a in t:
            rej.append((c, 'after-already-present')); continue
        sm = difflib.SequenceMatcher(None, b, a)
        ops = [o for o in sm.get_opcodes() if o[0] != 'equal']
        nch = sum((o[2] - o[1]) + (o[4] - o[3]) for o in ops)
        kinds = {o[0] for o in ops}
        if nch > 3 or 'delete' not in kinds and 'insert' in kinds:
            rej.append((c, f'edit-too-big({nch})')); continue
        if re.search(r'[们发东车问题说让语读图对头]，?', a) and a != '頭':
            if re.search(r'[们发东车问题说让语读]', a):
                rej.append((c, 'simplified-introduced')); continue
        ok.append(c)
    return ok, rej


ADJ_SYS = ('你是佛教文獻校對的複審員。逐條判斷以下「錯字修正」是否應該接受。'
           '接受條件：before 是原句中明顯的音近錯字或錯誤名相，after 是正確且語境通順的寫法，'
           '且不改變句意、不增刪語氣詞。若 after 語境不通、或 before 其實是正確用字、'
           '或修正屬於改寫句意 → 拒絕。輸出嚴格 JSON：'
           '[{"i":句編號,"before":"…","after":"…","verdict":"accept|reject","why":"…"}]。')


def adjudicate(n, blk_key, cands, sents):
    if not cands:
        return []
    key = f'a{blk_key}'
    hit = cache_get('adj', n, key)
    if hit is not None:
        return [c for c in hit if c.get('verdict') == 'accept']
    payload = [{'i': int(c['i']), 'before': c['before'], 'after': c['after'],
                'reason': c.get('reason', ''),
                'sentence': sents[int(c['i'])]['text']} for c in cands]
    resp = chat([{'role': 'system', 'content': ADJ_SYS},
                 {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}])
    try:
        arr = parse_json(resp)
    except Exception:
        arr = []
    verdicts = {(int(x['i']), x['before']): x for x in arr if isinstance(x, dict)}
    final = []
    for c in cands:
        v = verdicts.get((int(c['i']), c['before']), {})
        c2 = dict(c)
        c2['verdict'] = v.get('verdict', 'reject')
        c2['why'] = v.get('why', 'no-verdict')
        final.append(c2)
    cache_put('adj', n, key, final)
    return [c for c in final if c['verdict'] == 'accept']


# ---------------- Stage S: segmentation ----------------

SEG_SYS = ('你是佛教講記編輯。以下是一堂課逐字稿的連續句子（已編號）。'
           '請依語意單元建議「自然段」切點：新段的第一句編號。'
           '規則：1) 每段約 200–600 字；2) 語題轉換、問答交替、引書前後、科判層次變換處切；'
           '3) 第一句（編號最小者）必定是新段開頭，也要列出；4) 不得遺漏或改動任何句子。'
           '輸出嚴格 JSON：{"breaks":[編號,...]}（遞增）。')


def segment_para(n, pi, sents):
    key = f's{pi}'
    hit = cache_get('seg', n, key)
    if hit is not None:
        return hit
    idx = [i for i, s in enumerate(sents) if s['pi'] == pi]
    if len(idx) <= 3:
        out = {'breaks': [idx[0]]}
        cache_put('seg', n, key, out)
        return out
    body = [{'i': i, 't': sents[i]['text']} for i in idx]
    resp = chat([{'role': 'system', 'content': SEG_SYS},
                 {'role': 'user', 'content': json.dumps(body, ensure_ascii=False)}],
                temperature=0.1)
    breaks = None
    try:
        j = parse_json(resp)
        breaks = sorted({int(x) for x in j['breaks']})
    except Exception:
        pass
    if not breaks or breaks[0] != idx[0] or any(b not in idx for b in breaks):
        # fallback：每 ≤300 字且句尾為 。？！處切
        breaks, acc = [idx[0]], 0
        for i in idx:
            acc += len(sents[i]['text'])
            if acc >= 300 and (sents[i]['text'][-1] in '。？！'):
                breaks.append(i + 1 if i + 1 in idx else i)
                acc = 0
        breaks = sorted(set(breaks) & set(idx))
    out = {'breaks': breaks, 'fallback': False if resp else True}
    cache_put('seg', n, key, out)
    return out


# ---------------- main ----------------

def run_stage(stage, n):
    global LEXICON
    src, sents, meta = load_sentences(n)
    np_ratio = sum(1 for s in sents if needs_punct(s['text'])) / len(sents)
    t0 = time.time()
    if stage == 'punct':
        # 精準補標點：只送「含 needs_punct 句」的塊，其餘原樣保留
        dirty = [i for i, s in enumerate(sents) if needs_punct(s['text'])]
        print(f'L{n:02d} punct: 需補標點句 {len(dirty)}/{len(sents)}', flush=True)
        if not dirty:
            return
        texts = [s['text'] for s in sents]
        blk_lists = []
        for pi in range(len(src['paragraphs'])):
            for blk in blocks_of(sents, pi):
                if any(i in dirty for i in blk):
                    blk_lists.append(blk)
        with ThreadPoolExecutor(THREADS) as ex:
            results = list(ex.map(lambda b: punct_block(n, b, sents), blk_lists))
        for r in results:
            for i, t in r['texts'].items():
                texts[i] = t
        bad = sum(1 for r in results if not r['verified'])
        for i, s in enumerate(sents):
            s['text'] = texts[i]
        print(f'L{n:02d} punct done: {len(blk_lists)} 塊, 未全數驗證塊 {bad}, {time.time()-t0:.0f}s', flush=True)
        json.dump({'texts': texts}, open(f'{WORK}/cache/punct/L{n:02d}_final.json', 'w'), ensure_ascii=False)
    elif stage == 'correct':
        pf = f'{WORK}/cache/punct/L{n:02d}_final.json'
        if os.path.exists(pf):
            for i, t in enumerate(json.load(open(pf))['texts']):
                sents[i]['text'] = t
        LEXICON = LEXICON or load_lexicon()
        # rulebook 確定性替換（先於 LLM；每次套用記 ledger）
        ledger = []
        for i, s in enumerate(sents):
            for b, a in RULEBOOK.items():
                pat = RULEBOOK_GUARDS.get(b, re.compile(re.escape(b)))
                if pat.search(s['text']):
                    s['text'] = pat.sub(a, s['text'])
                    ledger.append({'id': s['id'], 'round': 0, 'before': b, 'after': a,
                                   'reason': 'rulebook', 'why': '高置信音近錯字詞庫', 'block': 'rb'})
        rb_n = len(ledger)
        blk_lists = []
        for pi in range(len(src['paragraphs'])):
            blk_lists += blocks_of(sents, pi)
        ledger = []
        for rnd in (1, 2):
            stats = {'propose': 0, 'mech_ok': 0, 'accepted': 0}
            for blk in blk_lists:
                key = f'{blk[0]}_{blk[-1]}'
                cands = propose_block(n, blk, sents, LEXICON, rnd)
                stats['propose'] += len(cands)
                ok, rej = mechanical_filter(cands, sents)
                acc = adjudicate(n, f'r{rnd}_{key}', ok, sents)
                stats['mech_ok'] += len(ok)
                stats['accepted'] += len(acc)
                for c in acc:
                    i = int(c['i'])
                    if c['before'] not in sents[i]['text']:
                        continue  # 塊文本已變（快取過期），不得記帳
                    sents[i]['text'] = sents[i]['text'].replace(c['before'], c['after'], 1)
                    ledger.append({'id': sents[i]['id'], 'round': rnd, 'before': c['before'],
                                   'after': c['after'], 'reason': c.get('reason', ''),
                                   'why': c.get('why', ''), 'block': key})
            print(f'L{n:02d} correct round{rnd}: 提案{stats["propose"]} 過{stats["mech_ok"]} 接受{stats["accepted"]}', flush=True)
        print(f'L{n:02d} rulebook: {rb_n} 處', flush=True)
        os.makedirs(f'{WORK}/ledger', exist_ok=True)
        json.dump({'lecture': n, 'stats': stats, 'items': ledger},
                  open(f'{WORK}/ledger/L{n:02d}.json', 'w'), ensure_ascii=False, indent=1)
        os.makedirs(f'{WORK}/cache/correct', exist_ok=True)
        json.dump({'texts': [s['text'] for s in sents]},
                  open(f'{WORK}/cache/correct/L{n:02d}_final.json', 'w'), ensure_ascii=False)
        print(f'L{n:02d} correct done: 提案{stats["propose"]} 機械過{stats["mech_ok"]} 接受{stats["accepted"]}, {time.time()-t0:.0f}s', flush=True)
    elif stage == 'segment':
        cf = f'{WORK}/cache/correct/L{n:02d}_final.json'
        if os.path.exists(cf):
            for i, t in enumerate(json.load(open(cf))['texts']):
                sents[i]['text'] = t
        paras = []
        for pi in range(len(src['paragraphs'])):
            r = segment_para(n, pi, sents)
            br = [i for i in r['breaks']]
            grp = []
            for i, gi in enumerate([i for i, s in enumerate(sents) if s['pi'] == pi]):
                if gi in br or not grp:
                    grp.append([])
                grp[-1].append(gi)
            for g in grp:
                paras.append({'pi': pi, 'heading': src['paragraphs'][pi].get('heading'),
                              'sent_ids': [sents[i]['id'] for i in g],
                              'chars': sum(len(sents[i]['text']) for i in g)})
        os.makedirs(f'{WORK}/cache/seg', exist_ok=True)
        json.dump({'paragraphs': paras}, open(f'{WORK}/cache/seg/L{n:02d}_final.json', 'w'), ensure_ascii=False, indent=1)
        print(f'L{n:02d} segment done: {len(paras)} 段, {time.time()-t0:.0f}s', flush=True)
    elif stage == 'build':
        from build_doc_json import build
        build(n)
    else:
        raise SystemExit('unknown stage')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage', required=True, choices=['punct', 'correct', 'segment', 'build', 'all'])
    ap.add_argument('--lecture', type=int, required=True)
    a = ap.parse_args()
    stages = ['punct', 'correct', 'segment', 'build'] if a.stage == 'all' else [a.stage]
    for st in stages:
        run_stage(st, a.lecture)
