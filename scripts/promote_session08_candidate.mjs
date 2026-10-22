#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateProofreadingCandidate } from './lib/transcriptProofreadingPipeline.js';
import { validateContentOverview, finalizeOverviewReview } from './content_overview_pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = process.argv[2] || 'e153a10f-c521-44b3-b300-82cd349bb207';
if (!/^[0-9a-f-]{36}$/u.test(runId)) throw new Error('invalid runId');
const runRoot = path.join(
  ROOT, 'reviews/evidence/transcript_proofreading/production/四念住/runs', runId,
);
const sourcePath = path.join(ROOT, 'courses/四念住/sessions/session_08.json');
const paths = {
  candidate: path.join(runRoot, 'session_08.final-candidate.json'),
  ledger: path.join(runRoot, 'session_08.final-ledger.json'),
  queue: path.join(runRoot, 'session_08.final-review-queue.json'),
  complete: path.join(runRoot, 'session_08.final-complete.json'),
  review: path.join(runRoot, 'session_08.independent-review.json'),
  preSource: path.join(runRoot, 'session_08.pre-promotion-source.json'),
  manifest: path.join(runRoot, 'session_08.promotion-manifest.json'),
};
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const readBound = (filePath) => {
  const bytes = readFileSync(filePath);
  return { bytes, value: JSON.parse(bytes), digest: sha256(bytes) };
};
const writeAtomic = (filePath, bytes) => {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporary, bytes);
  renameSync(temporary, filePath);
};

const candidate = readBound(paths.candidate);
const ledger = readBound(paths.ledger);
const queue = readBound(paths.queue);
const complete = readBound(paths.complete);
const review = readBound(paths.review);
const source = readBound(sourcePath);

if (complete.value.runId !== runId || ledger.value.runId !== runId || queue.value.runId !== runId) {
  throw new Error('runId binding mismatch');
}
if (complete.value.artifactDigests?.candidate !== candidate.digest
  || complete.value.artifactDigests?.ledger !== ledger.digest
  || complete.value.artifactDigests?.reviewQueue !== queue.digest) {
  throw new Error('immutable artifact digest mismatch');
}
if (review.value.runId !== runId || review.value.outcome !== 'PASS') {
  throw new Error('independent PASS is required');
}
if (source.digest !== complete.value.sourceFileDigest) {
  throw new Error('current source no longer matches the reviewed pre-promotion source');
}
const validation = validateProofreadingCandidate({
  source: source.value,
  candidate: candidate.value,
  ledger: ledger.value,
});
if (!validation.valid || JSON.stringify(validation) !== JSON.stringify(complete.value.validation)) {
  throw new Error(`candidate validation mismatch: ${JSON.stringify(validation.errors)}`);
}
const overview = candidate.value.contentOverview;
const overviewValidation = validateContentOverview(overview, candidate.value, {
  sourceTranscriptId: 'si-nian-zhu/session_08',
});
if (overviewValidation.errors.length || finalizeOverviewReview(overview, overview?.review).status !== 'ai-reviewed') {
  throw new Error('candidate overview must be reviewed against the proofread transcript before promotion');
}

writeAtomic(paths.preSource, source.bytes);
writeAtomic(sourcePath, candidate.bytes);
const promotedBytes = readFileSync(sourcePath);
if (sha256(promotedBytes) !== candidate.digest) throw new Error('promotion write verification failed');
const manifest = {
  schema: 'transcript-proofreading-promotion/v1',
  runId,
  state: 'promoted-local-verification-required',
  promotedPath: path.relative(ROOT, sourcePath),
  preSourceFileDigest: source.digest,
  candidateDigest: candidate.digest,
  ledgerDigest: ledger.digest,
  reviewQueueDigest: queue.digest,
  completionDigest: complete.digest,
  independentReviewDigest: review.digest,
  promotedSourceFileDigest: sha256(promotedBytes),
  validation,
  promotedAt: new Date().toISOString(),
};
writeAtomic(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifest: paths.manifest, ...manifest }, null, 2));
