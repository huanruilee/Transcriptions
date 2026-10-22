#!/usr/bin/env python3
"""Produce full-coverage advisory acoustic comparisons; never certify human listening."""
import difflib
import hashlib
import json
from pathlib import Path
import re
from opencc import OpenCC

ROOT=Path(__file__).resolve().parent.parent
DIR=ROOT/'reviews/evidence/session36a-quality'
transcript=json.loads((ROOT/'courses/入中論善顯密意疏/sessions/session_36A.json').read_text())
asr=json.loads((DIR/'full-asr.json').read_text())
source=json.loads((DIR/'audio-source.json').read_text())
cc=OpenCC('s2twp')
def norm(s): return ''.join(re.findall(r'[\u3400-\u9fffA-Za-z0-9]',cc.convert(s)))
def sha(p): return 'sha256:'+hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for p in transcript['paragraphs']:
    for s in p['verbatimSentences']:
        segments=[x for x in asr['segments'] if x['end']>s['start']-0.75 and x['start']<s['end']+0.75]
        observed=''.join(cc.convert(x['text']) for x in segments)
        a,b=norm(s['text']),norm(observed)
        # Coverage is advisory: ASR may itself mishear terms and preserve different repetitions.
        matching=sum(x.size for x in difflib.SequenceMatcher(None,a,b,autojunk=False).get_matching_blocks())
        coverage=round(matching/max(1,len(a)),4)
        rows.append({'id':s['id'],'paragraphId':p['id'],'start':s['start'],'end':s['end'],
                     'publishedText':s['text'],'asrSegmentIds':[x['id'] for x in segments],
                     'asrText':observed,'characterCoverage':coverage,
                     'status':'asr-corroborated-advisory' if coverage>=.65 else 'listening-review-required',
                     'humanListened':False})
samples=sorted(set([round(i*(len(rows)-1)/11) for i in range(12)]+[next(i for i,r in enumerate(rows) if r['id']==id) for id in ['p4-v4','p18-v3','p29-v7','p29-v10']]))
result={'schema':'session36a-acoustic-audit/v1','authority':'ASR comparison only; not human listening certification',
        'sourceFileDigest':sha(ROOT/'courses/入中論善顯密意疏/sessions/session_36A.json'),
        'audioSha256':source['sha256'],'asrDigest':sha(DIR/'full-asr.json'),
        'duration':source['duration'],'asrSegments':len(asr['segments']),
        'totalVerbatim':len(rows),'corroborated':sum(r['status']=='asr-corroborated-advisory' for r in rows),
        'needsListening':sum(r['status']=='listening-review-required' for r in rows),
        'representativeSampleIds':[rows[i]['id'] for i in samples],
        'timingPolicy':{'lecture':'estimated-within-paragraph','verbatim':'existing time anchors compared against full ASR; not forced aligned'},
        'items':rows}
(DIR/'audio-alignment.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='items'},ensure_ascii=False,indent=2))
