import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, cpSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { validateContentOverview } from '../../scripts/content_overview_pipeline.mjs';
import { validateOverviewAmendment } from '../../scripts/lib/proofreadingOverviewAmendment.js';

const runId = 'e153a10f-c521-44b3-b300-82cd349bb207';
const base = `reviews/evidence/transcript_proofreading/production/四念住/runs/${runId}`;
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('promotion reconstructs the reviewed overview amendment from the original source', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'session08-promotion-'));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  cpSync(base, path.join(root,base), {recursive:true});
  const publishedPath = path.join(root,'courses/四念住/sessions/session_08.json');
  mkdirSync(path.dirname(publishedPath),{recursive:true});
  copyFileSync(`${base}/session_08.pre-promotion-source.json`,publishedPath);
  const command = () => spawnSync(process.execPath,['scripts/promote_session08_candidate.mjs'],{
    encoding:'utf8',env:{...process.env,TRANSCRIPT_PROOFREADING_ROOT:root},
  });
  const result = command();
  assert.equal(result.status,0,result.stderr);
  assert.equal(sha256(readFileSync(publishedPath)),sha256(readFileSync('courses/四念住/sessions/session_08.json')));
  const manifest=JSON.parse(readFileSync(path.join(root,base,'session_08.promotion-manifest.json')));
  assert.equal(manifest.promotedSourceFileDigest,sha256(readFileSync(publishedPath)));
  assert.equal(manifest.candidateDigest,sha256(readFileSync(`${base}/session_08.final-candidate.json`)));
  copyFileSync(`${base}/session_08.pre-promotion-source.json`,publishedPath);
  const amendmentPath=path.join(root,base,'session_08.overview-amendment.json');
  const amendment=JSON.parse(readFileSync(amendmentPath));
  amendment.overview.mainPoints[0].evidence[0].quote='invalid';
  writeFileSync(amendmentPath,JSON.stringify(amendment));
  const rejected=command();
  assert.notEqual(rejected.status,0);
  assert.match(rejected.stderr,/invalid overview amendment/);
  assert.equal(sha256(readFileSync(publishedPath)),sha256(readFileSync(`${base}/session_08.pre-promotion-source.json`)));
});

test('session 08 published overview cites the current proofread text', () => {
  const transcript = JSON.parse(readFileSync('courses/四念住/sessions/session_08.json'));
  assert.deepEqual(validateContentOverview(transcript.contentOverview, transcript, {
    sourceTranscriptId: 'si-nian-zhu/session_08',
  }).errors, []);
});

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
  assert.equal(manifest.promotedSourceFileDigest, sha256(candidateBytes));
  const amendment = JSON.parse(readFileSync(`${base}/session_08.overview-amendment.json`));
  assert.deepEqual(validateOverviewAmendment({candidate: candidateBytes, published: publishedBytes, manifest, amendment}), []);
  const changed = JSON.parse(publishedBytes);
  changed.paragraphs[0].sentences[0].text += '竄改';
  assert.ok(validateOverviewAmendment({candidate: candidateBytes, published: Buffer.from(JSON.stringify(changed)), manifest, amendment}).includes('approved transcript changed'));
  assert.ok(validateOverviewAmendment({candidate: candidateBytes, published: publishedBytes, manifest, amendment: {...amendment,publishedDigest:'invalid'}}).includes('amendment binding mismatch'));
});
