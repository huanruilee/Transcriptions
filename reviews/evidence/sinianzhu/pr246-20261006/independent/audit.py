import json, subprocess, pathlib, importlib.util, tempfile, copy
root=pathlib.Path.cwd(); base='33564e3054ef9b1be18b36672ff862f2e302fd50'
spec=importlib.util.spec_from_file_location('compact',root/'scripts/compact_sinianzhu_review.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
summary=json.loads((root/'reviews/evidence/sinianzhu/review-triage-compact/20260929-071904/summary.json').read_text())
def strip(d):
 d=copy.deepcopy(d)
 for p in d['paragraphs']:
  for s in p['sentences']:
   s.pop('reviewNeeded',None);s.pop('uncertainty',None)
 for k in ('reviewTriage','candidateReviewRequired'): d.get('_meta',{}).pop(k,None)
 return d
for n in range(1,9):
 rel=f'courses/四念住/sessions/session_{n:02d}.json'; d=json.loads((root/rel).read_text()); b=json.loads(subprocess.check_output(['git','show',f'{base}:{rel}'],cwd=root))
 r=json.loads((root/f'reviews/evidence/sinianzhu/review-triage-compact/20260929-071904/session_{n:02d}.json').read_text())
 ss=[s for p in d['paragraphs'] for s in p['sentences']]; ids=[s['id'] for s in ss]; coverage=[i for batch in r['batches'] for i in batch['ids']]
 assert len(ids)==len(set(ids)) and ids==coverage
 pending=set()
 for batch in r['batches']:
  assert len(batch['ids'])==len(set(batch['ids']))
  if batch['error']:pending.update(batch['ids'])
  else: assert batch['uncertain'] is not None; assert set(batch['uncertain'])<=set(batch['ids']); pending.update(batch['uncertain'])
 assert all(s['reviewNeeded']==(s['id'] in pending) for s in ss)
 assert r['pending']==len(pending) and r['clear']==len(ss)-len(pending)
 assert r==summary['sessions'][n-1]
 assert strip(d)==strip(b), f'non-triage changes {n}'
 assert d['_meta']['reviewTriage']['pendingSentences']==len(pending)
 assert d['_meta']['reviewTriage']['clearSentences']==len(ss)-len(pending)
 assert d['_meta']['candidateReviewRequired']==bool(pending)
 print(f'session {n:02d}: exact unique coverage={len(ss)}, clear={r["clear"]}, pending={len(pending)}, failures={sum(bool(x["error"]) for x in r["batches"])}, all non-triage fields preserved')
fixture={'paragraphs':[{'sentences':[{'id':'a','text':'甲','reviewNeeded':True},{'id':'b','text':'乙','reviewNeeded':True}]}]}
fixture_dir=tempfile.TemporaryDirectory(); p=pathlib.Path(fixture_dir.name)/'fixture.json';p.write_text(json.dumps(fixture))
for label,response in [('wrong_count',{'reviewed_count':1,'uncertain_ids':[]}),('unknown',{'reviewed_count':2,'uncertain_ids':['z']}),('null',None),('list',[]),('missing',{}),('bad_ids',{'reviewed_count':2,'uncertain_ids':[{}]})]:
 m.correction.ask=lambda *a,**kw:response
 d,records,clear,pending,_=m.process(p,2,False)
 assert pending==2 and clear==0
 print('fail-closed malformed:',label,records[0]['error'])
def error(*a,**kw):raise RuntimeError('endpoint failure')
m.correction.ask=error
assert m.process(p,2,False)[3]==2
print('fail-closed endpoint failure: PASS')
m.correction.ask=lambda *a,**kw:{'reviewed_count':2,'uncertain_ids':[]}
for batch in (-1,0,True,1.0):
 try: m.process(p,batch,False)
 except ValueError: print('invalid batch rejected:',repr(batch))
 else: raise AssertionError('invalid batch accepted')

for kind in ('malformed','exception','union'):
 calls=[]
 def ask(*args,**kw):
  calls.append(kw['model'])
  if len(calls)==1:return {'reviewed_count':2,'uncertain_ids':['a'] if kind=='union' else []}
  if kind=='exception':raise TimeoutError()
  if kind=='malformed':return {'reviewed_count':0,'uncertain_ids':[]}
  return {'reviewed_count':2,'uncertain_ids':['b']}
 m.correction.ask=ask
 d,r,c,pending,_=m.process(p,2,False)
 assert len(calls)==2 and pending==2 and c==0
 print('external/union:',kind, r)
fixture_dir.cleanup()
