import json
import os
import re
from pathlib import Path

root = Path(os.environ.get('GX10_CONTENT_TASK_ROOT', '/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation'))
output_path = root / 'output/content_review.json'
review = json.loads(output_path.read_text())
review['schema'] = 'study-group-content-review/v1'
review['status'] = 'CANDIDATE'
review.pop('qualityGates', None)
review['provenance']['questionIndexEmptyByDesign'] = False
review['provenance']['teacherSummariesAbsentByDesign'] = False
review['provenance']['contentReviewSchema'] = 'study-group-content-review/v1'
match = re.search(r'playlist-(\d+)$', str(root))
if match:
    index = int(match.group(1))
    review['provenance']['rawAsrPath'] = f'reviews/evidence/study-group-2025/playlist-{index:02d}/raw_asr.json'
    reference = Path(f'courses/釋量論第二品/source_text/session_{index:02d}_official_raw.txt')
    if reference.exists():
        review['provenance']['referencePath'] = str(reference)
    else:
        review['provenance']['referencePath'] = 'courses/釋量論第二品/source_text/session_32_official_raw.txt'
        review['provenance']['referenceFallback'] = 'shared_treatise_source: lesson-specific reference unavailable'
output_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
manifest_path = root / 'output/content_review_manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['segments'] = len(review['segments'])
manifest['questions'] = len(review['questionIndex'])
manifest['summaries'] = len(review['teacherSummaries'])
manifest['status'] = 'BLOCKED_REVIEW_REQUIRED'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with (root / 'output/remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'metadata_finalize', 'status': 'PASS', 'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}, ensure_ascii=False) + '\n')
print(json.dumps({'segments': len(review['segments']), 'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}))
