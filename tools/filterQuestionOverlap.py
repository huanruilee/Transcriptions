import json
import os
from pathlib import Path

root = Path(os.environ.get('GX10_CONTENT_TASK_ROOT', '/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation'))
path = root / 'output/content_review.json'
review = json.loads(path.read_text())
question_refs = {sid for q in review['questionIndex'] for sid in q['sourceSegmentIds']}
for summary in review['teacherSummaries']:
    summary['sourceSegmentIds'] = [sid for sid in summary['sourceSegmentIds'] if sid not in question_refs]
summary_by_q = {s['questionId']: s for s in review['teacherSummaries'] if s['sourceSegmentIds'] and s['bullets']}
review['questionIndex'] = [q for q in review['questionIndex'] if q['id'] in summary_by_q]
review['teacherSummaries'] = [summary_by_q[q['id']] for q in review['questionIndex']]
review['provenance']['questionOverlapGate'] = 'teacher summary references cannot overlap any question source range'
path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
manifest_path = root / 'output/content_review_manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['questions'] = len(review['questionIndex'])
manifest['summaries'] = len(review['teacherSummaries'])
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with (root / 'output/remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'question_overlap_filter', 'status': 'PASS', 'questions': len(review['questionIndex'])}, ensure_ascii=False) + '\n')
print(json.dumps({'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}))
