import json
import pathlib
import re
import urllib.request
from opencc import OpenCC

ROOT = pathlib.Path('/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation')
OUT = ROOT / 'output'
URL = 'http://127.0.0.1:8001/v1/chat/completions'
MODEL = 'Qwen3.8-27B'
TARGETS = {'seg-0503', 'seg-0803', 'seg-1340', 'seg-2529', 'seg-3503'}
DROP_SUMMARIES = {'q-07-02', 'q-22-01', 'q-22-09'}
convert = OpenCC('s2twp')
review = json.loads((OUT / 'content_review.json').read_text())
segments = review['segments']
by_number = {int(s['id'][4:]): s for s in segments}

def ask(segment, context):
    prompt = '''你是臺灣繁體中文逐字稿校對員。請只校正指定的一個疑似 ASR 錯句，參考前後文；不得自行新增內容，不確定時保留原句。只輸出 JSON {"text":"..."}。'''
    body = {'model': MODEL, 'messages': [
        {'role': 'system', 'content': prompt},
        {'role': 'user', 'content': json.dumps({'target': segment, 'context': context}, ensure_ascii=False)}],
        'temperature': 0.05, 'max_tokens': 300, 'chat_template_kwargs': {'enable_thinking': False}}
    req = urllib.request.Request(URL, data=json.dumps(body, ensure_ascii=False).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=900) as response:
        text = json.loads(response.read())['choices'][0]['message']['content']
    text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip(), flags=re.S)
    return convert.convert(json.loads(text[text.find('{'):])['text']).replace('痴', '癡')

for sid in TARGETS:
    segment = next(s for s in segments if s['id'] == sid)
    number = int(sid[4:])
    context = [by_number[n] for n in range(max(1, number - 3), min(len(segments), number + 3) + 1)]
    old = segment['text']
    segment['text'] = ask(segment, context)
    print(sid, old, '=>', segment['text'])

review['questionIndex'] = [q for q in review['questionIndex'] if q['id'] not in DROP_SUMMARIES]
review['teacherSummaries'] = [s for s in review['teacherSummaries'] if s['questionId'] not in DROP_SUMMARIES]
review['provenance']['targetedCleanupModel'] = MODEL
(OUT / 'content_review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
manifest = json.loads((OUT / 'content_review_manifest.json').read_text())
manifest['questions'] = len(review['questionIndex'])
manifest['summaries'] = len(review['teacherSummaries'])
(OUT / 'content_review_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with (OUT / 'remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'targeted_cleanup', 'status': 'PASS', 'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}, ensure_ascii=False) + '\n')
print(json.dumps({'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}))
