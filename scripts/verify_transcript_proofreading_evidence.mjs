#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = process.env.TRANSCRIPT_PROOFREADING_EVIDENCE_ROOT
  ? path.resolve(process.env.TRANSCRIPT_PROOFREADING_EVIDENCE_ROOT)
  : path.join(ROOT, 'reviews', 'evidence', 'transcript_proofreading');
const mappings = {
  ledger: 'ledger.json',
  reviewQueue: 'review-queue.json',
  modelResponses: 'model-responses.json',
};

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const failures = [];
const suffixes = ['complete.json', ...Object.values(mappings)];
const groups = new Map();
for (const file of walk(EVIDENCE).filter((item) => item.endsWith('.json'))) {
  const suffix = suffixes.find((candidate) => file.endsWith(`.${candidate}`));
  if (!suffix) continue;
  const prefix = file.slice(0, -suffix.length - 1);
  if (!groups.has(prefix)) groups.set(prefix, new Map());
  groups.get(prefix).set(suffix, file);
}
if (groups.size === 0 && !process.argv.includes('--allow-empty')) failures.push('no evidence manifests found');
for (const [prefix, files] of groups) {
  for (const suffix of suffixes) {
    if (!files.has(suffix)) failures.push(`${path.relative(ROOT, prefix)} missing ${suffix}`);
  }
}
const manifests = [...groups.values()].map((files) => files.get('complete.json')).filter(Boolean).sort();
for (const manifestPath of manifests) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const prefix = manifestPath.slice(0, -'complete.json'.length);
  for (const [name, suffix] of Object.entries(mappings)) {
    const artifactPath = `${prefix}${suffix}`;
    if (!existsSync(artifactPath)) {
      failures.push(`${path.relative(ROOT, manifestPath)} missing ${suffix}`);
      continue;
    }
    const bytes = readFileSync(artifactPath);
    const artifact = JSON.parse(bytes.toString('utf8'));
    if (artifact.runId !== manifest.runId) failures.push(`${path.relative(ROOT, artifactPath)} runId mismatch`);
    if (artifact.sourceDigest !== manifest.sourceDigest) failures.push(`${path.relative(ROOT, artifactPath)} sourceDigest mismatch`);
    if (sha256(bytes) !== manifest.artifactDigests?.[name]) failures.push(`${path.relative(ROOT, artifactPath)} byte digest mismatch`);
  }
}

console.log(JSON.stringify({
  schema: 'transcript-proofreading-evidence-audit/v1',
  manifests: manifests.length,
  valid: failures.length === 0,
  failures,
}, null, 2));
if (failures.length > 0) process.exitCode = 1;
