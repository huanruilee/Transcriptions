#!/usr/bin/env python3
"""套用 AGY 對 full-v3 複辨結果的逐句裁決到六節 session JSON。

規則：
- 只套用 verdict=CORRECT 且通過下列護欄的修正：
  * 目標句 id 存在，且原文字與封包 currentText 一致（避免套用到舊版）
  * 數字集合不變、句末標點數量不變（補全／幻覺還原例外）
  * 修訂後不含簡體字（OpenCC s2twp 恆等檢查）
  * 修訂後每句仍以句末標點收尾
- 人工否決（veto）與人工覆寫以明確清單表達，不隱含在自動規則裡。
- NEEDS_AUDIO 保持 reviewNeeded=true；KEEP 視為已裁決（文字不變）。
- 產出稽核軌跡 work/adjudication_v3.json，並更新 _meta.adjudicationRecord。
"""
import json, pathlib, re, sys, datetime

ROOT = pathlib.Path('/home/henry/.gx10/projects/chaosheng-qianxing-2026')
WT = pathlib.Path('/home/henry/.gx10/xiaofa/worktrees/chaosheng')
COURSE = '朝聖前行課程'
SESSIONS = ['01', '02', '03', '04', '05', '06']
STAMP = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

# 人工否決：這些字級改動不套用（保留原字，句中標為仍待人工確認）
VETO = {
    ('06', 'seg-0165'): ['波→缽'],          # 學員提問，專名脈絡不明
    ('06', 'seg-0399'): ['智→知'],          # 「分別智」為攝類學正名，AGY 改「分別知」有誤
}
# 人工覆寫：AGY 產出的整句文字直接覆寫（修正 AGY 漏改的同詞殘留）
OVERRIDE = {
    ('05', 'seg-0152'): '主因是喉嚨的本質就不好。像我以前跟在仁波切身邊。哇，有時候仁波切一上課，咳的時間比上課的時間還多。整堂課有30分鐘都在咳嗽。真的很不容易。',
}

END_PUNCT = '。？！'
# 與 repo gate（scripts/check_session.mjs）一致的簡體專用字集
SIMPLIFIED_ONLY = set('虽却这为体学师义论说对问题发会国经时过还进异间')


def simplified_hits(text):
    return sorted({ch for ch in text if ch in SIMPLIFIED_ONLY})


def load(p):
    return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))


def main():
    ledger = {
        'schema': 'chaosheng/adjudication-v3/v1',
        'generatedAt': STAMP,
        'method': 'AGY（Antigravity CLI）逐句裁決 currentText / rawAsrText / large-v3 複辨轉寫',
        'asrRecheck': 'faster-whisper large-v3（int8_float16, vad_filter=false）對每句前後 2–4 秒音窗複辨',
        'humanListened': False,
        'note': '本紀錄不含人工逐句聽核；成品仍為待閱校版。',
        'sessions': {},
    }
    totals = {'CORRECT_applied': 0, 'CORRECT_partial': 0, 'KEEP': 0, 'NEEDS_AUDIO': 0, 'rejected': 0}
    for s in SESSIONS:
        pkt = load(ROOT / 'recheck' / 'packets' / f'session_{s}_packet.json')
        decs = load(ROOT / 'recheck' / 'decisions' / f'session_{s}_decisions.json')
        dec_by_id = {d['id']: d for d in decs}
        spath = WT / 'courses' / COURSE / 'sessions' / f'session_{s}.json'
        sess = load(spath)
        sent_index = {}
        for p in sess['paragraphs']:
            for x in p['sentences']:
                sent_index[x['id']] = x
        entries = []
        applied = 0
        for item in pkt['items']:
            d = dec_by_id.get(item['id'])
            if not d:
                entries.append({'id': item['id'], 'verdict': 'MISSING'})
                continue
            sid = item['id']
            sent = sent_index.get(sid)
            verdict = d['verdict']
            rec = {'id': sid, 'verdict': verdict, 'reason': d.get('reason', ''), 'evidence': d.get('evidence', '')}
            if verdict != 'CORRECT':
                if verdict == 'KEEP':
                    totals['KEEP'] += 1
                    if sent is not None:
                        sent['reviewNeeded'] = False
                        sent['adjudication'] = {'by': 'agy-largev3', 'verdict': 'KEEP', 'humanListened': False}
                elif verdict == 'NEEDS_AUDIO':
                    totals['NEEDS_AUDIO'] += 1
                    if sent is not None:
                        sent['reviewNeeded'] = True
                        sent['adjudication'] = {'by': 'agy-largev3', 'verdict': 'NEEDS_AUDIO',
                                                'reason': d.get('reason', ''), 'humanListened': False}
                entries.append(rec)
                continue
            if sent is None:
                rec['applied'] = False
                rec['skipReason'] = '句 id 不存在於 session'
                totals['rejected'] += 1
                entries.append(rec)
                continue
            cur = sent['text']
            if cur.strip() != item['currentText'].strip():
                rec['applied'] = False
                rec['skipReason'] = '原文字與封包不一致（session 已改版）'
                totals['rejected'] += 1
                entries.append(rec)
                continue
            new = OVERRIDE.get((s, sid), d.get('correctedText', ''))
            if not new:
                rec['applied'] = False
                rec['skipReason'] = '無修正文字'
                totals['rejected'] += 1
                entries.append(rec)
                continue
            # 人工否決字級
            vetoes = VETO.get((s, sid), [])
            if vetoes:
                for v in vetoes:
                    old, neu = v.split('→')
                    new = new.replace(neu, old)
                rec['vetoed'] = vetoes
            # 護欄
            problems = []
            if sorted(re.findall(r'\d+', cur)) != sorted(re.findall(r'\d+', new)):
                problems.append('數字改變')
            spurious_dot = re.search(r'\d。\d', cur) is not None
            if sum(new.count(c) for c in END_PUNCT) < sum(cur.count(c) for c in END_PUNCT) and not spurious_dot:
                problems.append('句末標點數量減少')
            simp = simplified_hits(new)
            if simp:
                problems.append('含簡體字：' + ','.join(f'{a}→{b}' for a, b in simp))
            if new.strip() and new.strip()[-1] not in END_PUNCT + '」』”"':
                problems.append('句末無標點')
            if problems:
                rec['applied'] = False
                rec['skipReason'] = '；'.join(problems)
                rec['proposedText'] = new
                totals['rejected'] += 1
                entries.append(rec)
                continue
            sent['text'] = new
            if rec.get('vetoed'):
                sent['reviewNeeded'] = True
                sent['adjudication'] = {'by': 'agy-largev3', 'verdict': 'PARTIAL',
                                        'reason': d.get('reason', ''), 'evidence': d.get('evidence', ''),
                                        'vetoed': rec['vetoed'], 'humanListened': False}
                rec['applied'] = 'partial'
                rec['after'] = new
                totals['CORRECT_partial'] += 1
                entries.append(rec)
                continue
            sent['reviewNeeded'] = False
            sent['adjudication'] = {'by': 'agy-largev3', 'verdict': 'CORRECT',
                                    'reason': d.get('reason', ''), 'evidence': d.get('evidence', ''),
                                    'humanListened': False}
            rec['applied'] = True
            rec['before'] = cur
            rec['after'] = new
            applied += 1
            totals['CORRECT_applied'] += 1
            entries.append(rec)
        pending = sum(1 for p in sess['paragraphs'] for x in p['sentences'] if x.get('reviewNeeded'))
        # 內容有變更時必須更新 lastUpdated（check_session --strict 會檢查）
        if applied:
            sess['lastUpdated'] = STAMP
        meta = sess.setdefault('_meta', {})
        meta['correctionsPending'] = pending
        meta['correctionsAutoApplied'] = int(meta.get('correctionsAutoApplied', 0)) + applied
        meta['adjudicationRecord'] = {
            'reviewedAt': STAMP,
            'model': 'agy (Antigravity CLI) + faster-whisper large-v3 (int8_float16, vad_filter=false)',
            'scope': '第一輪機器層校字後之待確認句第二輪裁決；不含人工逐句聽核',
            'adjudicatedSentences': len(pkt['items']),
            'appliedCorrections': applied,
            'pendingSentences': pending,
            'pendingCategory': 'agy-largev3-needs-audio',
            'decision': '有底本或 large-v3 複辨依據者套用；僅憑語意臆測者一律不套用並保留待人工聽核。',
            'evidence': [
                f'reviews/evidence/{COURSE}/work/adjudication_v3.json',
                f'reviews/evidence/{COURSE}/lecture_{s}/correction_candidates.json',
            ],
            'humanListened': False,
            'note': '本紀錄不宣稱已完成人工校對或錄音忠實度；成品為待閱校版。',
        }
        spath.write_text(json.dumps(sess, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        ledger['sessions'][s] = {'items': len(pkt['items']), 'applied': applied, 'pending': pending,
                                 'entries': entries}
    ledger['totals'] = totals
    out = WT / 'reviews' / 'evidence' / COURSE / 'work' / 'adjudication_v3.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'totals': totals,
                      'perSession': {k: {'items': v['items'], 'applied': v['applied'], 'pending': v['pending']}
                                     for k, v in ledger['sessions'].items()},
                      'ledger': str(out)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
