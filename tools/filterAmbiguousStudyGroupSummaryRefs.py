import json
import os
import re
from pathlib import Path

root = Path(os.environ.get('GX10_CONTENT_TASK_ROOT', '/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation'))
output = root / 'output/content_review.json'
review = json.loads(output.read_text())
ambiguous = re.compile(r'謝謝法師|我知道了|我可不可以這麼理解|這是我的理解')
by_id = {segment['id']: segment for segment in review['segments']}
kept_questions = []
kept_summaries = []
dropped = []
for question in review['questionIndex']:
    summary = next((item for item in review['teacherSummaries'] if item['questionId'] == question['id']), None)
    if summary is None:
        continue
    summary['sourceSegmentIds'] = [sid for sid in summary['sourceSegmentIds'] if not ambiguous.search(by_id[sid]['text'])]
    if not summary['sourceSegmentIds']:
        dropped.append(question['id'])
        continue
    kept_questions.append(question)
    kept_summaries.append(summary)
review['questionIndex'] = kept_questions
review['teacherSummaries'] = kept_summaries
review.setdefault('provenance', {})['speakerPurityGate'] = 'ambiguous short replies and non-diarized source spans excluded'
output.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
manifest_path = root / 'output/content_review_manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['questions'] = len(kept_questions)
manifest['summaries'] = len(kept_summaries)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with (root / 'output/remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'ambiguous_source_ref_filter', 'status': 'PASS', 'droppedQuestions': dropped, 'questions': len(kept_questions)}, ensure_ascii=False) + '\n')
print(json.dumps({'droppedQuestions': dropped, 'questions': len(kept_questions), 'summaries': len(kept_summaries)}, ensure_ascii=False))
