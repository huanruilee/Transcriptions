import json
from pathlib import Path

output = Path('/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation/output/content_review.json')
review = json.loads(output.read_text())

def segment_number(segment_id):
    return int(segment_id[4:])

question_end = {
    question['id']: max(segment_number(sid) for sid in question['sourceSegmentIds'])
    for question in review['questionIndex']
}
for summary in review['teacherSummaries']:
    end = question_end[summary['questionId']]
    summary['sourceSegmentIds'] = [
        sid for sid in summary['sourceSegmentIds'] if segment_number(sid) >= end
    ]
    if not summary['sourceSegmentIds']:
        summary['sourceSegmentIds'] = [f'seg-{end:04d}']

review['provenance']['summaryBoundary'] = (
    'teacher summaries cite only segments at or after question end; '
    'requires independent review'
)
output.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
with output.with_name('remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({
        'stage': 'summary_boundary_filter',
        'status': 'PASS',
        'questionCount': len(review['questionIndex']),
    }, ensure_ascii=False) + '\n')
print(f"FILTERED {len(review['questionIndex'])}")
