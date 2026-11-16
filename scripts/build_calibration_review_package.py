#!/usr/bin/env python3
"""Portable local-only audio review package. Never promotes timestamps or modifies source."""
import argparse,hashlib,json,shutil,subprocess
from pathlib import Path

def sha(raw):return 'sha256:'+hashlib.sha256(raw).hexdigest()
def package(work,output,template):
    work,output=Path(work),Path(output);output.mkdir(parents=True,exist_ok=True);(output/'audio').mkdir(exist_ok=True)
    sessions=[]
    for sid in ('30','31'):
        ledger_raw=(work/f'{sid}.adjudication.json').read_bytes();ledger=json.loads(ledger_raw)
        source_raw=Path(f'courses/釋量論第二品/sessions/session_{sid}.json').read_bytes();source=json.loads(source_raw)
        if sha(source_raw)!=ledger['sourceDigest']:raise ValueError('Stale source')
        original=[s for p in source['paragraphs']for s in p['sentences']]
        if len(original)!=len(ledger['items'])or any(a['id']!=b['id']or a['text']!=b['text']for a,b in zip(original,ledger['items'])):raise ValueError('Source coverage mismatch')
        audio=work/f'{sid}-gpu.mp3'
        if sha(audio.read_bytes())!=ledger['audio']['sha256']:raise ValueError('Wrong audio source')
        dest=output/'audio'/f'session_{sid}.mp3'
        if not dest.exists()or sha(dest.read_bytes())!=ledger['audio']['sha256']:shutil.copyfile(audio,dest)
        publication_path=Path(f'courses/釋量論第二品/publications/lecture_{sid}_verbatim_rebuild.json')
        subprocess.run(['node',str(Path(__file__).with_name('validate_calibration_reading.mjs')),f'courses/釋量論第二品/sessions/session_{sid}.json',str(publication_path)],check=True)
        publication_raw=publication_path.read_bytes();approval=json.loads(publication_raw)
        reading={s['id']:s['text']for section in approval['sections']for s in section['sentences']}
        items=[]
        for index,row in enumerate(ledger['items']):
            proposal=row['proposal']or{};start=proposal.get('start');end=proposal.get('end')
            if start is None or end is None:
                prev=next((r for r in reversed(ledger['items'][:index])if r['end']is not None),None)
                nxt=next((r for r in ledger['items'][index+1:]if r['start']is not None),None)
                start=prev['end']if prev else max(0,row['oldStart']-15);end=nxt['start']if nxt else min(ledger['audio']['duration'],row['oldEnd']+15)
            left=max(0,min(start,end)-6);right=min(ledger['audio']['duration'],max(start,end)+6)
            items.append({**row,'readingText':reading[row['id']],'contextStart':left,'contextEnd':right,'audioSha256':ledger['audio']['sha256'],'humanListened':False})
        sessions.append({'id':sid,'title':source.get('title',sid),'sourceDigest':ledger['sourceDigest'],'readingPublicationDigest':sha(publication_raw),'readingContentDigest':approval['readingApproval']['contentDigest'],'ledgerDigest':sha(ledger_raw),'audioSha256':ledger['audio']['sha256'],'duration':ledger['audio']['duration'],'clock':'source-audio','videoOffsetSeconds':ledger['audio']['videoOffsetSeconds'],'audioPath':f'audio/session_{sid}.mp3','summary':ledger['summary'],'items':items})
        (output/f'session_{sid}.adjudication.json').write_bytes(ledger_raw)
    data={'schema':'calibration-listening-package/v1','authority':'machine-review-candidate','humanListened':False,'publicationAccepted':False,'sessions':sessions}
    data['version']=sha(json.dumps(data,ensure_ascii=False,sort_keys=True).encode())
    (output/'manifest.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    payload=json.dumps(data,ensure_ascii=False).replace('<','\\u003c')
    html=Path(template).read_text().replace('__REVIEW_DATA__',payload)
    (output/'index.html').write_text(html)
    print(json.dumps({'output':str(output),'summary':{s['id']:s['summary']for s in sessions}},ensure_ascii=False))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--work',required=True);p.add_argument('--output',required=True);p.add_argument('--template',default='scripts/templates/calibration_review.html');a=p.parse_args();package(a.work,a.output,a.template)
