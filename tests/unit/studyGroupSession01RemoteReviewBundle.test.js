import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BUNDLE_PATH = 'reviews/evidence/study-group-2025/playlist-01/remote_reviewer_bundle.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sha256(relativePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, relativePath)))
    .digest('hex');
}

test('session 01 remote-review bundle is public-safe, pinned, and reproducible', () => {
  const bundle = readJson(BUNDLE_PATH);

  assert.equal(bundle.schema, 'study-group-remote-review-bundle/v1');
  assert.equal(bundle.reviewedCommit, '8b33793bc9e7079990defb90dfd8924efaa2487d');
  assert.equal(bundle.scope.sessionId, '01');
  assert.equal(bundle.scope.videoId, '7QA1k4uxxV0');
  assert.equal(bundle.scope.operationalEvidenceOnly, true);
  assert.equal(bundle.scope.editorialQualityVerdict, 'NOT_ASSESSED');
  assert.deepEqual(bundle.excludedArtifacts, [
    'reviews/evidence/study-group-2025/playlist-01/raw_asr.json',
    'reviews/evidence/study-group-2025/playlist-01/acoustic_verification.json',
  ]);

  assert.ok(bundle.requiredArtifacts.length >= 2);
  for (const artifact of bundle.requiredArtifacts) {
    assert.match(artifact.path, /^(courses|reviews|tests)\//);
    assert.doesNotMatch(artifact.path, /raw_asr|acoustic_verification/);
    assert.equal(artifact.sha256, sha256(artifact.path));
  }
});

test('session 01 review states the same question-summary count as its machine manifest', () => {
  const review = fs.readFileSync(
    path.join(ROOT, 'reviews/evidence/study-group-2025/playlist-01/review.md'),
    'utf8',
  );
  const manifest = readJson(
    'reviews/evidence/study-group-2025/playlist-01/content_review_manifest.json',
  );

  assert.match(
    review,
    new RegExp(`${manifest.questions} question/teacher-summary pairs`),
    'human-readable review count must agree with the machine manifest',
  );
  assert.equal(manifest.questions, manifest.summaries);
});
