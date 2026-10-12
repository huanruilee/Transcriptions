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

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJson(value[key])]),
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function artifactDigest(artifact) {
  if (!artifact.hashScope || artifact.hashScope === 'full-file') {
    return sha256(fs.readFileSync(path.join(ROOT, artifact.path)));
  }

  assert.equal(
    artifact.hashScope,
    'transcript-evidence/v1',
    `unsupported hash scope for ${artifact.path}`,
  );
  const transcript = readJson(artifact.path);
  delete transcript.contentOverview;
  delete transcript.last_updated;
  if (transcript._meta) delete transcript._meta.processed_at;
  return sha256(JSON.stringify(stableJson(transcript)));
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
    assert.equal(artifact.sha256, artifactDigest(artifact));
  }

  const transcriptArtifact = bundle.requiredArtifacts.find(({ path: artifactPath }) =>
    artifactPath.endsWith('/sessions/session_01.json'),
  );
  assert.equal(transcriptArtifact?.hashScope, 'transcript-evidence/v1');
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
