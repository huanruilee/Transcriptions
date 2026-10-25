#!/usr/bin/env python3
"""Bounded per-sentence acoustic alternatives. No ASR calls, text edits or time interpolation."""
import argparse,hashlib,json,re
from pathlib import Path

def sha(raw):return 'sha256:'+hashlib.sha256(raw).hexdigest()
def align_local(text,words,left,right,normalizer=None):
    if normalizer is None:
        from opencc import OpenCC
        normalizer=OpenCC('t2s').convert
    norm=lambda s:re.sub(r'[^\w\u3400-\u9fff]','',normalizer(s))
    target=norm(text); stream=''; indices=[]
    for index,w in enumerate(words):
        if w['end']<left or w['start']>right:continue
        value=norm(w['word']);stream+=value;indices.extend([index]*len(value))
    n,m=len(target),len(stream)
    empty={'start':None,'end':None,'firstWord':None,'lastWord':None,'matchedCharacters':0,'totalCharacters':n,'unmatchedPrefix':n,'unmatchedSuffix':n,'ambiguous':False,'acousticText':''}
    if not n or not m:return empty
    dp=[[0]*(m+1)for _ in range(n+1)]
    for i in range(1,n+1):
        dp[i][0]=i
        for j in range(1,m+1):dp[i][j]=min(dp[i-1][j-1]+(target[i-1]!=stream[j-1]),dp[i-1][j]+1,dp[i][j-1]+1)
    best=min(dp[n][1:]);ends=[j for j in range(1,m+1)if dp[n][j]==best]
    def trace(j):
        i=n;matches=[]
        while i and j:
            if dp[i][j]==dp[i-1][j-1]+(target[i-1]!=stream[j-1]):
                if target[i-1]==stream[j-1]:matches.append((i-1,j-1))
                i-=1;j-=1
            elif dp[i][j]==dp[i-1][j]+1:i-=1
            else:j-=1
        return list(reversed(matches))
    choices=[trace(j)for j in ends];choices=[c for c in choices if c]
    if not choices:return empty
    matched=max(choices,key=len);first=indices[matched[0][1]];last=indices[matched[-1][1]]
    alternatives={(indices[c[0][1]],indices[c[-1][1]])for c in choices if len(c)==len(matched)}
    ambiguous=len({round(words[a]['start'],2) for a,b in alternatives})>1
    return {'start':words[first]['start'],'end':words[last]['end'],'firstWord':first,'lastWord':last,'matchedCharacters':len(matched),'totalCharacters':n,'unmatchedPrefix':matched[0][0],'unmatchedSuffix':n-1-matched[-1][0],'ambiguous':ambiguous,'editDistance':best,'acousticText':''.join(w['word']for w in words[first:last+1])}

def main():
    p=argparse.ArgumentParser();p.add_argument('--session',required=True);p.add_argument('--work',required=True);p.add_argument('--output',required=True);p.add_argument('--evidence-root');a=p.parse_args();sid=a.session;root=Path(a.work)
    source_path=Path(f'courses/釋量論第二品/sessions/session_{sid}.json');raw=source_path.read_bytes();source=json.loads(raw);rows=[s for para in source['paragraphs']for s in para['sentences']]
    variants={};artifacts={};risk_ids=set()
    for label,prefix in [('first',sid),('second',sid+'.second-pass')]:
        candidate_path=root/f'{prefix}.candidate.json';candidate=json.loads(candidate_path.read_text());assert candidate['sourceDigest']==sha(raw)
        evidence_path=root/f'{prefix}.words.json';e_raw=evidence_path.read_bytes();evidence=json.loads(e_raw)
        variants[label]=candidate;artifacts[label]={'path':str(evidence_path),'sha256':sha(e_raw),'audioSha256':evidence['audioSha256']}
        audit=json.loads((root/f'{prefix}.audit.json').read_text())
        risk_ids.update(e['id']for section in ('structure','acoustic')for e in audit[section]['errors']if 'id'in e)
    for i,row in enumerate(rows):
        one,two=(variants[v]['items'][i]for v in ('first','second'))
        if one['start'] is not None and two['start']is not None and (abs(one['start']-two['start'])>1.5 or abs(one['end']-two['end'])>1.5):risk_ids.add(row['id'])
    for label in ('first','second'):
        e=json.loads(Path(artifacts[label]['path']).read_text());words=[w for seg in e['segments']for w in seg['words']];items=[]
        for i,row in enumerate(rows):
            if row['id']not in risk_ids:continue
            original=variants[label]['items'][i]
            if original['start']is not None:left,right=original['start'],original['end']
            else:
                prev=next((r for r in reversed(variants[label]['items'][:i])if r['end']is not None),None);nxt=next((r for r in variants[label]['items'][i+1:]if r['start']is not None),None)
                left=prev['end']if prev else 0;right=nxt['start']if nxt else e['duration']
            left,right=max(0,min(left,right)-15),min(e['duration'],max(left,right)+15)
            if right-left>120:continue
            matched=align_local(row['text'],words,left,right);risks=[]
            if not matched['totalCharacters']or matched['matchedCharacters']/max(1,matched['totalCharacters'])<.75:risks.append('weak-match')
            if matched['unmatchedPrefix']>2 or matched['unmatchedSuffix']>2:risks.append('unmatched-edge')
            if matched['ambiguous']:risks.append('ambiguous-local-match')
            items.append({'id':row['id'],'text':row['text'],'oldStart':row['start'],'oldEnd':row['end'],'start':matched['start'],'end':matched['end'],'status':'review'if risks else'aligned','risks':risks,'searchWindow':{'start':left,'end':right},'evidence':{**matched,'artifactSha256':artifacts[label]['sha256']}})
        variants['local-'+label]={**variants[label],'method':'bounded semi-global character alignment; actual whole-word boundaries; no interpolation','items':items}
    if a.evidence_root:
        artifacts['first']['path']=str(Path(a.evidence_root)/'first-pass'/f'session_{sid}.words.json')
        artifacts['second']['path']=str(Path(a.evidence_root)/'second-pass'/f'session_{sid}.second-pass.words.json')
    output={'schema':'calibration-review-alternatives/v1','authority':'advisory','humanListened':False,'sourceDigest':sha(raw),'session':sid,'artifacts':artifacts,'variants':variants}
    Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'session':sid,'sentences':len(rows),'locallyExamined':len(risk_ids)},ensure_ascii=False))
if __name__=='__main__':main()
