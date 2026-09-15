import json
import pathlib
import re
import urllib.request
from opencc import OpenCC

ROOT = pathlib.Path('/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation')
OUT = ROOT / 'output'
MODEL = 'Qwen3.8-27B'
URL = 'http://127.0.0.1:8001/v1/chat/completions'
TARGETS = {'q-05-03','q-05-04','q-05-05','q-06-01','q-06-02','q-13-01','q-17-01','q-21-02','q-22-04','q-22-06','q-22-07','q-22-08','q-24-01'}
convert = OpenCC('s2twp')
review = json.loads((OUT / 'content_review.json').read_text())
segments = review['segments']
number = lambda sid: int(sid[4:])
by_id = {s['id']: s for s in segments}

def ask(payload):
    body = {'model': MODEL, 'messages': [
        {'role': 'system', 'content': '''你是逐字稿品質審核員。只判斷指定問題之後的逐字稿是否真的出現法師直接回答。學員互答、法師提問、法師只說「對／好」都不能當完整開示。若沒有可靠法師回答，輸出 {"accepted":false}。若有，輸出 {"accepted":true,"bullets":["..."],"sourceSegmentIds":[...]}。sourceSegmentIds 必須全部是提問結束後的法師回答段落，不能包含學員回答段落；摘要不可捏造。所有文字用臺灣繁體中文，只輸出 JSON。'''} ,
        {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}],
        'temperature': 0.05, 'max_tokens': 1200, 'chat_template_kwargs': {'enable_thinking': False}}
    req = urllib.request.Request(URL, data=json.dumps(body, ensure_ascii=False).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=900) as response:
        text = json.loads(response.read())['choices'][0]['message']['content']
    text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip(), flags=re.S)
    return json.loads(text[text.find('{'):])

questions = {q['id']: q for q in review['questionIndex']}
summaries = {s['questionId']: s for s in review['teacherSummaries']}
for qid in sorted(TARGETS):
    q = questions.get(qid)
    if not q:
        continue
    end = max(number(sid) for sid in q['sourceSegmentIds'])
    context = [s for s in segments if end < number(s['id']) <= end + 120]
    result = ask({'questionId': qid, 'question': q['question'], 'segments': context})
    if result.get('accepted'):
        ids = [sid for sid in result.get('sourceSegmentIds', []) if sid in by_id and number(sid) > end]
        bullets = [convert.convert(str(b)).replace('痴', '癡') for b in result.get('bullets', []) if str(b).strip()]
        if ids and bullets:
            summaries[qid] = {'localIndex': summaries[qid].get('localIndex', 1), 'bullets': bullets, 'sourceSegmentIds': ids, 'questionId': qid}
            print(qid, 'ACCEPTED', ids[0], ids[-1])
            continue
    questions.pop(qid, None)
    summaries.pop(qid, None)
    print(qid, 'DROPPED')

review['questionIndex'] = list(questions.values())
review['teacherSummaries'] = [summaries[q['id']] for q in review['questionIndex']]
for segment in review['segments']:
    segment['text'] = segment['text'].replace('痴', '癡')
review['provenance']['flaggedSummaryReviewModel'] = MODEL
(OUT / 'content_review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
with (OUT / 'remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'flagged_teacher_summary_review', 'status': 'PASS', 'questions': len(review['questionIndex'])}, ensure_ascii=False) + '\n')
print(json.dumps({'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}))
