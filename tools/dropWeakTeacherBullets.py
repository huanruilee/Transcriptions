import json
import pathlib

root = pathlib.Path('/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation/output')
path = root / 'content_review.json'
review = json.loads(path.read_text())
removed = []
for summary in review['teacherSummaries']:
    kept = [b for b in summary['bullets'] if b.strip('。.!！ ') not in {'對', '是的', '法師確認：對', '法師確認：是的'}]
    removed.extend(set(summary['bullets']) - set(kept))
    summary['bullets'] = kept
valid = {s['questionId'] for s in review['teacherSummaries'] if s['bullets']}
review['questionIndex'] = [q for q in review['questionIndex'] if q['id'] in valid]
review['teacherSummaries'] = [s for s in review['teacherSummaries'] if s['questionId'] in valid]
review['provenance']['weakBulletGate'] = 'bare acknowledgements excluded'
path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
manifest_path = root / 'content_review_manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['questions'] = len(review['questionIndex'])
manifest['summaries'] = len(review['teacherSummaries'])
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with (root / 'remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'weak_bullet_filter', 'status': 'PASS', 'removed': removed, 'questions': len(review['questionIndex'])}, ensure_ascii=False) + '\n')
print(json.dumps({'removed': removed, 'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}, ensure_ascii=False))
