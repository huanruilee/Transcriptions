#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildValidatedModelCandidate,
  computeSourceDigest,
  listTranscriptSentences,
} from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const sourcePath = path.resolve(ROOT, args.get('--source') || 'courses/四念住/sessions/session_08.json');
const alignmentPath = path.resolve(ROOT, args.get('--alignment')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.reference-alignment.json');
const outputDir = path.resolve(ROOT, args.get('--output-dir')
  || 'reviews/evidence/transcript_proofreading/production/四念住');
const stem = args.get('--stem') || 'session_08.reference';
for (const resolved of [sourcePath, alignmentPath, outputDir]) {
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error('all paths must stay inside repository');
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(temporary, bytes);
  renameSync(temporary, filePath);
  return digest(bytes);
}

const sourceBytes = readFileSync(sourcePath);
const source = JSON.parse(sourceBytes);
const alignmentBytes = readFileSync(alignmentPath);
const alignment = JSON.parse(alignmentBytes);
if (alignment?.schema !== 'transcript-reference-alignment/v1'
  || alignment.sourceFileDigest !== digest(sourceBytes)
  || !String(alignment.referencePdfDigest ?? '').startsWith('sha256:')
  || !String(alignment.referenceTextDigest ?? '').startsWith('sha256:')) {
  throw new Error('reference alignment is not bound to source and reference digests');
}
const sentences = listTranscriptSentences(source);
if (!Array.isArray(alignment.items) || alignment.items.length !== sentences.length) {
  throw new Error('reference alignment coverage mismatch');
}
for (let index = 0; index < sentences.length; index += 1) {
  const sentence = sentences[index];
  const item = alignment.items[index];
  if (item?.id !== sentence.id || item.before !== sentence.text) {
    throw new Error(`reference alignment binding mismatch at ${sentence.id}`);
  }
}
const proposals = alignment.items.filter((item) => !item.boundaryRisk && item.after !== item.before)
  .map((item) => ({
    id: item.id,
    after: item.after,
    change_class: 'reference-transcript',
    reason: '公開正式講記與全域順序對齊',
    evidence: [
      `reference-url:${alignment.referenceUrl}`,
      `reference-pdf:${alignment.referencePdfDigest}`,
      `reference-text:${alignment.referenceTextDigest}`,
      `reference-span:${item.referenceStart}-${item.referenceEnd}`,
    ],
    confidence: Math.max(0, Math.min(1, item.similarity)),
  }));
const uncertain = alignment.items.filter((item) => item.boundaryRisk).map((item) => ({
  id: item.id,
  reason: `reference-boundary-risk similarity=${item.similarity} lengthRatio=${item.lengthRatio}`,
}));
const review = {
  batch_id: `reference:${alignment.referencePdfDigest}`,
  reviewed_count: sentences.length,
  reviewed_ids: sentences.map((item) => item.id),
  proposals,
  uncertain,
};
const result = buildValidatedModelCandidate({
  source,
  reviews: [review],
  model: {
    provider: 'public-reference-transcript',
    model: alignment.referenceUrl,
    referencePdfDigest: alignment.referencePdfDigest,
    referenceTextDigest: alignment.referenceTextDigest,
    alignmentDigest: digest(alignmentBytes),
  },
});
if (!result.validation.valid) {
  throw new Error(`reference candidate validation failed: ${JSON.stringify(result.validation.errors)}`);
}
const runId = randomUUID();
const ledger = {
  ...result.ledger,
  runId,
  reference: {
    url: alignment.referenceUrl,
    pdfDigest: alignment.referencePdfDigest,
    textDigest: alignment.referenceTextDigest,
    alignmentDigest: digest(alignmentBytes),
  },
};
const queue = {
  schema: 'transcript-proofreading-reference-review-queue/v1',
  runId,
  sourceDigest: computeSourceDigest(source),
  itemCount: result.reviewQueue.length,
  items: result.reviewQueue,
};
const candidate = {
  ...result.candidate,
  publicationState: 'candidate-review-required',
  referenceProofreading: {
    runId,
    sourceDigest: computeSourceDigest(source),
    appliedCount: ledger.entries.length,
    reviewQueueCount: queue.itemCount,
    referencePdfDigest: alignment.referencePdfDigest,
  },
};
const paths = {
  candidate: path.join(outputDir, `${stem}-candidate.json`),
  ledger: path.join(outputDir, `${stem}-ledger.json`),
  reviewQueue: path.join(outputDir, `${stem}-review-queue.json`),
  complete: path.join(outputDir, `${stem}-complete.json`),
};
const artifactDigests = {
  candidate: writeJsonAtomic(paths.candidate, candidate),
  ledger: writeJsonAtomic(paths.ledger, ledger),
  reviewQueue: writeJsonAtomic(paths.reviewQueue, queue),
};
writeJsonAtomic(paths.complete, {
  schema: 'transcript-proofreading-reference-candidate-completion/v1',
  runId,
  sourceDigest: computeSourceDigest(source),
  alignmentDigest: digest(alignmentBytes),
  artifactDigests,
});
console.log(JSON.stringify({
  runId,
  proposedCount: proposals.length,
  appliedCount: ledger.entries.length,
  quarantinedCount: result.quarantined.length,
  reviewQueueCount: queue.itemCount,
  paths,
}, null, 2));
