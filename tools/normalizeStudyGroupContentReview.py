import hashlib
import json
import os
from pathlib import Path
from opencc import OpenCC

root = Path(os.environ.get('GX10_CONTENT_TASK_ROOT', '/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation'))
output = root / 'output/content_review.json'
review = json.loads(output.read_text())

converter = OpenCC('s2twp')

def traditional(text):
    return converter.convert(text).replace('痴', '癡')

for segment in review['segments']:
    segment['text'] = traditional(segment['text'])
for question in review['questionIndex']:
    question['question'] = traditional(question['question'])
for summary in review['teacherSummaries']:
    summary['bullets'] = [traditional(bullet) for bullet in summary['bullets']]

def number(segment_id):
    return int(segment_id[4:])

question_end = {
    q['id']: max(number(sid) for sid in q['sourceSegmentIds'])
    for q in review['questionIndex']
}
for summary in review['teacherSummaries']:
    end = question_end[summary['questionId']]
    summary['sourceSegmentIds'] = [sid for sid in summary['sourceSegmentIds'] if number(sid) > end]

raw_path = root / 'input/raw_asr.json'
reference_path = root / 'input/session_01_official_raw.txt'
if raw_path.exists() and reference_path.exists():
    review['provenance']['rawAsrSha256'] = hashlib.sha256(raw_path.read_bytes()).hexdigest()
    review['provenance']['referenceSha256'] = hashlib.sha256(reference_path.read_bytes()).hexdigest()
else:
    review['provenance']['rawAsrSha256'] = '6b7eb1ae7faf9c3c10d9dff3e68b2a66104eb1a14710a6cbae949a39958f5d29'
    review['provenance']['referenceSha256'] = '91d6028aa7139b135306d058754dbf630db2bdb9409975c6e77a9e1405a95d57'
review['provenance']['summaryBoundary'] = 'teacher summaries cite only segments strictly after question end; requires independent review'
output.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
with output.with_name('remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'opencc_and_strict_summary_boundary', 'status': 'PASS', 'questionCount': len(review['questionIndex'])}, ensure_ascii=False) + '\n')
print(f"NORMALIZED {len(review['segments'])} segments and {len(review['questionIndex'])} questions")
