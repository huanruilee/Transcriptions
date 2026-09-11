import json, pathlib, re, urllib.request

ROOT=pathlib.Path('/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation')
IN=ROOT/'input'; OUT=ROOT/'output'; MODEL='Qwen3.8-27B'; URL='http://127.0.0.1:8001/v1/chat/completions'
SIMP_TO_TRAD=dict(zip('为这样个说体经论门从对么后变实证觉关开边过问题时间还会点现显义极胜广当无师发与见随应处观摄识别业释难车声闻缘执许计总种听讲话导读记诵传辩净谛'.replace('量',''), '為這樣個說體經論門從對麼後變實證覺關開邊過問題時間還會點現顯義極勝廣當無師發與見隨應處觀攝識別業釋難車聲聞緣執許計總種聽講話導讀記誦傳辯淨諦'.replace('量','')))
def traditional(s): return ''.join(SIMP_TO_TRAD.get(c,c) for c in s)
def call(msgs):
 p={'model':MODEL,'messages':msgs,'temperature':0.05,'max_tokens':7000,'chat_template_kwargs':{'enable_thinking':False}}
 req=urllib.request.Request(URL,data=json.dumps(p,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=900) as r: return json.loads(r.read())['choices'][0]['message']['content']
def parsed(msgs):
 for _ in range(3):
  try:
   t=re.sub(r'^```(?:json)?\s*|\s*```$','',call(msgs).strip(),flags=re.S); t=t[t.find('{'):]; return json.loads(t)
  except Exception: msgs=msgs+[{'role':'user','content':'只輸出合法 JSON 物件，不要 markdown。'}]
 raise RuntimeError('invalid json')
def log(x,**kw):
 with (OUT/'remediation_log.jsonl').open('a') as f:f.write(json.dumps({'event':x,**kw},ensure_ascii=False)+'\n')

old=json.loads((IN/'content_review.json').read_text()); segs=[{**s,'text':traditional(s['text'])} for s in old['segments']]
questions=[]; summaries=[]
for bi in range(0,len(segs),120):
 batch=segs[bi:bi+120]; ids={s['id'] for s in batch}
 msgs=[{'role':'system','content':'''你是嚴格的佛法共學整理員。只從這一批逐字稿找出實際提出的問題。每一題必須在本批中有明確提問句，並找出同一批中、且嚴格位於提問最後一個 segment 之後的法師回答/開示；不得把提問本身或提問前的討論當成法師開示。輸出 JSON：{"questions":[{"localIndex":1,"question":"...","sourceSegmentIds":[...] }],"summaries":[{"localIndex":1,"bullets":[...],"sourceSegmentIds":[...]}]}。questions 和 summaries 用相同 localIndex 配對；summary 的第一個 sourceSegmentId 必須大於同 localIndex question 的最後一個 sourceSegmentId；摘要只寫法師回答，不要自行補 doctrinal content。不要跨批引用；沒有可靠配對就不要輸出。所有文字用臺灣繁體中文。'''} , {'role':'user','content':json.dumps(batch,ensure_ascii=False)}]
 r=parsed(msgs); qs=r.get('questions',[]); ss=r.get('summaries',[]); sm={x.get('localIndex'):x for x in ss};
 for q in qs:
  idx=q.get('localIndex'); s=sm.get(idx)
  if not s or not q.get('question') or not s.get('bullets'): continue
  qid=f'q-{bi//120+1:02d}-{idx:02d}'; q['id']=qid; q['question']=traditional(q['question']); q['sourceSegmentIds']=[x for x in q.get('sourceSegmentIds',[]) if x in ids]; s['questionId']=qid; s['bullets']=[traditional(str(x)) for x in s['bullets'] if str(x).strip()]; s['sourceSegmentIds']=[x for x in s.get('sourceSegmentIds',[]) if x in ids]
  q_end=max(int(x[4:]) for x in q['sourceSegmentIds']) if q['sourceSegmentIds'] else 0
  s['sourceSegmentIds']=[x for x in s['sourceSegmentIds'] if int(x[4:]) > q_end]
  if q['sourceSegmentIds'] and s['sourceSegmentIds'] and s['bullets']: questions.append(q); summaries.append(s)
 log('question_batch',offset=bi,count=len(batch),questions=len(qs),paired=len(summaries))
out={**old,'status':'CANDIDATE','segments':segs,'questionIndex':questions,'teacherSummaries':summaries,'provenance':{**old.get('provenance',{}),'remediationModel':MODEL,'questionIdsGloballyScoped':True}}
(OUT/'content_review.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n'); (OUT/'content_review_manifest.json').write_text(json.dumps({'schema':'study-group-content-output/v1','status':'BLOCKED_REVIEW_REQUIRED','segments':len(segs),'questions':len(questions),'summaries':len(summaries)},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'segments':len(segs),'questions':len(questions),'summaries':len(summaries)}))
