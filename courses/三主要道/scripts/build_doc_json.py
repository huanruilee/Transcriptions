#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""組衍生的 doc JSON：原文 session + 管線快取 → sessions_doc/L{XX}.doc.json

衍生檔不回寫 repo；原始 session JSON 是不可變來源，此處記錄其 sha256。
"""
import hashlib, json, os

WT = '/home/henry/.gx10/xiaofa/workspace/worktrees/szyd-doc'
WORK = '/home/henry/.gx10/projects/szyd-gdoc'


def build(n):
    srcp = f'{WT}/courses/三主要道/sessions/session_{n:02d}.json'
    src = open(srcp, 'rb').read()
    digest = 'sha256:' + hashlib.sha256(src).hexdigest()
    d = json.loads(src)
    sents = []
    for p in d['paragraphs']:
        for s in p['sentences']:
            sents.append({'id': s['id'], 'start': s['start'], 'end': s['end'],
                          'text': s['text']})
    # 套用 punct → correct 快取（若存在）
    for st in ('punct', 'correct'):
        f = f'{WORK}/cache/{st}/L{n:02d}_final.json'
        if os.path.exists(f):
            for i, t in enumerate(json.load(open(f))['texts']):
                sents[i]['text'] = t
    # 段落
    segf = f'{WORK}/cache/seg/L{n:02d}_final.json'
    if os.path.exists(segf):
        paras = json.load(open(segf))['paragraphs']
    else:
        paras = [{'pi': 0, 'heading': None, 'sent_ids': [s['id'] for s in sents],
                  'chars': sum(len(s['text']) for s in sents)}]
    # AI 摘要句（非原話）抽出正文
    import re
    AI_SUMMARY_RE = re.compile(r'^《三主要道》第\d+講')
    ai = [s for s in sents if AI_SUMMARY_RE.match(s['text'])]
    ai_ids = {a['id'] for a in ai}
    idset = {s['id'] for s in sents}
    used = [sid for p in paras for sid in p['sent_ids'] if sid not in ai_ids]
    assert len(used) == len(set(used)), '重複句'
    missing = (idset - ai_ids) - set(used)
    assert not missing, f'缺 {len(missing)} 句未入段: {list(missing)[:3]}'
    order = {s['id']: k for k, s in enumerate(sents)}
    assert all(order[used[i]] <= order[used[i + 1]] for i in range(len(used) - 1)), '段落順序亂'
    doc = {'n': n, 'title': d['title'], 'courseId': 'san-zhu-yao-dao',
           'master': d.get('instructor') or '如性法師',
           'youtubeVideoId': d.get('youtubeVideoId'), 'youtubeUrl': d.get('youtubeUrl'),
           'lastUpdated': d.get('lastUpdated'),
           'publicationState': d.get('publicationState'),
           'qualityReview': d.get('qualityReview'),
           'sourcePath': f'courses/三主要道/sessions/session_{n:02d}.json',
           'sourceDigest': digest, 'nSentences': len(sents),
           'extractedAiSummary': ai,
           'sentences': sents, 'paragraphs': paras}
    os.makedirs(f'{WORK}/sessions_doc', exist_ok=True)
    out = f'{WORK}/sessions_doc/L{n:02d}.doc.json'
    json.dump(doc, open(out, 'w'), ensure_ascii=False, indent=1)
    print('built', out, len(sents), '句 /', len(paras), '段')
    return out


if __name__ == '__main__':
    import sys
    build(int(sys.argv[1]))
