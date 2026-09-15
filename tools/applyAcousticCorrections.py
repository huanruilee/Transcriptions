import hashlib
import json
import pathlib

root = pathlib.Path('/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation/output')
review_path = root / 'content_review.json'
acoustic_path = root / 'acoustic_verification.json'
review = json.loads(review_path.read_text())
acoustic = json.loads(acoustic_path.read_text())

corrections = {
    'seg-0503': '賜於我們是一個',
    'seg-0803': '若是從資糧上的話來說的話',
    'seg-1340': '這應該也是',
    'seg-2529': '這個果，',
    'seg-3503': '您當時有一個，他們有截圖嗎？',
}
for segment in review['segments']:
    if segment['id'] in corrections:
        segment['text'] = corrections[segment['id']]

drop = {'q-17-02', 'q-22-08', 'q-23-01'}
review['questionIndex'] = [q for q in review['questionIndex'] if q['id'] not in drop]
review['teacherSummaries'] = [s for s in review['teacherSummaries'] if s['questionId'] not in drop]
review['provenance']['acousticVerification'] = 'acoustic_verification.json'
review['provenance']['acousticVerificationSha256'] = hashlib.sha256(acoustic_path.read_bytes()).hexdigest()
review['provenance']['acousticEngine'] = acoustic['engine']
review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')

manifest_path = root / 'content_review_manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['questions'] = len(review['questionIndex'])
manifest['summaries'] = len(review['teacherSummaries'])
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with (root / 'remediation_log.jsonl').open('a') as log:
    log.write(json.dumps({'stage': 'acoustic_correction', 'status': 'PASS', 'questions': len(review['questionIndex']), 'dropped': sorted(drop)}, ensure_ascii=False) + '\n')
print(json.dumps({'questions': len(review['questionIndex']), 'summaries': len(review['teacherSummaries'])}))
