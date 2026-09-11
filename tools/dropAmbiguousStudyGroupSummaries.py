import json
import pathlib

root = pathlib.Path('/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation/output')
path = root / 'content_review.json'
review = json.loads(path.read_text())
drop = {'q-21-01', 'q-21-03', 'q-23-02', 'q-23-03'}
review['questionIndex'] = [q for q in review['questionIndex'] if q['id'] not in drop]
review['teacherSummaries'] = [s for s in review['teacherSummaries'] if s['questionId'] not in drop]
review['provenance']['speakerPurityGate'] = 'ambiguous short replies and non-diarized source spans excluded'
path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
manifest_path = root / 'content_review_manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['questions'] = len(review['questionIndex'])
manifest['summaries'] = len(review['teacherSummaries'])
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with (root / 'remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'ambiguous_speaker_drop', 'status': 'PASS', 'dropped': sorted(drop), 'questions': len(review['questionIndex'])}, ensure_ascii=False) + '\n')
print(json.dumps({'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}))
