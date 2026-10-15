#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  alignFullContextAsrEvidence,
  computeSourceDigest,
  listTranscriptSentences,
} from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const sourcePath = path.resolve(ROOT, args.get('--source') || 'courses/四念住/sessions/session_08.json');
const asrPath = path.resolve(ROOT, args.get('--asr')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.full-context-asr.json');
const outputPath = path.resolve(ROOT, args.get('--output')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.full-context-asr-all.json');
const paddingSeconds = Number(args.get('--padding-seconds') || 0.5);
for (const resolved of [sourcePath, asrPath, outputPath]) {
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error('all paths must stay inside repository');
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

const sourceRaw = readFileSync(sourcePath);
const source = JSON.parse(sourceRaw);
const asrRaw = readFileSync(asrPath);
const asr = JSON.parse(asrRaw);
if (asr.schema !== 'transcript-proofreading-full-context-asr/v1'
  || asr.sourceDigest !== computeSourceDigest(source)
  || !String(asr.audioSha256 ?? '').startsWith('sha256:')
  || !Array.isArray(asr.transcription?.segments) || asr.transcription.segments.length === 0) {
  throw new Error('full-context ASR evidence is not bound to this source');
}
const sentences = listTranscriptSentences(source);
const requests = sentences.map((sentence) => {
  if (!Number.isFinite(sentence.start) || !Number.isFinite(sentence.end) || sentence.end < sentence.start) {
    throw new Error(`invalid source timestamps for ${sentence.id}`);
  }
  return {
    id: sentence.id, sourceText: sentence.text,
    start: sentence.start, end: sentence.end,
  };
});
const items = alignFullContextAsrEvidence({
  requests,
  segments: asr.transcription.segments,
  paddingSeconds,
}).map((item, index) => ({
  ...item,
  sourceText: sentences[index].text,
  rawResponseDigest: asr.transcription.rawResponseDigest,
}));
if (items.length !== sentences.length || items.some((item, index) => item.id !== sentences[index].id)) {
  throw new Error('full transcript ASR alignment coverage mismatch');
}
const artifact = {
  schema: 'transcript-proofreading-full-context-asr-all/v1',
  authority: 'advisory',
  sourceDigest: computeSourceDigest(source),
  sourceFileDigest: digest(sourceRaw),
  parentAsrDigest: digest(asrRaw),
  audioSha256: asr.audioSha256,
  model: asr.model,
  runtimeFingerprint: asr.runtimeFingerprint,
  transcriptionRawResponseDigest: asr.transcription.rawResponseDigest,
  segmentCount: asr.transcription.segmentCount,
  paddingSeconds,
  generatedAt: new Date().toISOString(),
  itemCount: items.length,
  items,
};
mkdirSync(path.dirname(outputPath), { recursive: true });
const temporary = `${outputPath}.tmp-${process.pid}`;
writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`);
renameSync(temporary, outputPath);
console.log(JSON.stringify({ outputPath, itemCount: items.length, audioSha256: artifact.audioSha256 }, null, 2));
