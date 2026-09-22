import json
import os
import re
from pathlib import Path

root = Path(os.environ.get('GX10_CONTENT_TASK_ROOT', '/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation'))
path = root / 'output/content_review.json'
review = json.loads(path.read_text())
by_id = {s['id']: s for s in review['segments']}
bare = re.compile(r'^(?:對|是的|好的|好|嗯|OK)[。！!，,、 ]*$', re.I)
removed = []
for summary in review['teacherSummaries']:
    kept = []
    for sid in summary['sourceSegmentIds']:
        if bare.fullmatch(by_id[sid]['text'].strip()):
            removed.append(sid)
        else:
            kept.append(sid)
    summary['sourceSegmentIds'] = kept
summary_by_q = {s['questionId']: s for s in review['teacherSummaries'] if s['sourceSegmentIds'] and s['bullets']}
review['questionIndex'] = [q for q in review['questionIndex'] if q['id'] in summary_by_q]
review['teacherSummaries'] = [summary_by_q[q['id']] for q in review['questionIndex']]
review['provenance']['bareAcknowledgementRefGate'] = 'bare acknowledgement segments excluded from teacher summary citations'
path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
manifest_path = root / 'output/content_review_manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['questions'] = len(review['questionIndex'])
manifest['summaries'] = len(review['teacherSummaries'])
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with (root / 'output/remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'bare_acknowledgement_ref_filter', 'status': 'PASS', 'removed': removed, 'questions': len(review['questionIndex'])}, ensure_ascii=False) + '\n')
print(json.dumps({'removed': removed, 'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}, ensure_ascii=False))
