#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const directory = path.resolve(ROOT, args.get('--directory')
  || 'reviews/evidence/transcript_proofreading/production/四念住');
const stem = args.get('--stem') || 'session_08';
if (!directory.startsWith(`${ROOT}${path.sep}`)) throw new Error('directory must stay inside repository');
const names = [
  'qwen.json', 'minimax.json', 'compact-review.json', 'audio.json',
  'adjudication-qwen.json', 'adjudication-minimax.json',
  'adjudication-qwen-sentence.json', 'adjudication-minimax-sentence.json',
];
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const artifacts = Object.fromEntries(names.map((suffix) => {
  const file = `${stem}.${suffix}`;
  const bytes = readFileSync(path.join(directory, file));
  return [suffix, { file, sha256: sha256(bytes) }];
}));
const packetBytes = readFileSync(path.join(directory, artifacts['compact-review.json'].file));
const packet = JSON.parse(packetBytes);
const audio = JSON.parse(readFileSync(path.join(directory, artifacts['audio.json'].file), 'utf8'));
const manifest = {
  schema: 'transcript-proofreading-production-evidence-manifest/v1',
  sourceDigest: packet.sourceDigest,
  runId: packet.runId,
  proposalDigest: packet.proposalDigest,
  packetDigest: sha256(JSON.stringify(packet)),
  audioSha256: audio.audioSha256,
  itemCount: packet.items.length,
  generatedAt: new Date().toISOString(),
  artifacts,
};
const output = path.join(directory, `${stem}.production-manifest.json`);
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, itemCount: manifest.itemCount, artifactCount: names.length }, null, 2));
