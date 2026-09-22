import json
import os
from pathlib import Path

root = Path(os.environ.get('GX10_CONTENT_TASK_ROOT', '/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation'))
path = root / 'output/content_review.json'
review = json.loads(path.read_text())
review.pop('exclusions', None)
review['provenance']['staleExclusionsCleared'] = True
path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
with (root / 'output/remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'clear_stale_exclusions', 'status': 'PASS'}, ensure_ascii=False) + '\n')
print(json.dumps({'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}))
