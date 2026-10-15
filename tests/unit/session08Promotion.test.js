import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runId = 'e153a10f-c521-44b3-b300-82cd349bb207';
const base = `reviews/evidence/transcript_proofreading/production/四念住/runs/${runId}`;
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('session 08 promotion is bound to the independently approved immutable run', () => {
  const reviewBytes = readFileSync(`${base}/session_08.independent-review.json`);
  const review = JSON.parse(reviewBytes);
  const manifest = JSON.parse(readFileSync(`${base}/session_08.promotion-manifest.json`, 'utf8'));
  const candidateBytes = readFileSync(`${base}/session_08.final-candidate.json`);
  const publishedBytes = readFileSync('courses/四念住/sessions/session_08.json');

  assert.equal(review.runId, runId);
  assert.equal(review.outcome, 'PASS');
  assert.equal(manifest.schema, 'transcript-proofreading-promotion/v1');
  assert.equal(manifest.runId, runId);
  assert.equal(manifest.independentReviewDigest, sha256(reviewBytes));
  assert.equal(manifest.candidateDigest, sha256(candidateBytes));
  assert.equal(manifest.promotedSourceFileDigest, sha256(publishedBytes));
  assert.deepEqual(JSON.parse(publishedBytes), JSON.parse(candidateBytes));
});
