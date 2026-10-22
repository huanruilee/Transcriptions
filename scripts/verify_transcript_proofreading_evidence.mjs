#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateOverviewAmendment } from './lib/proofreadingOverviewAmendment.js';

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
const productionManifests = walk(EVIDENCE).filter((item) => item.endsWith('.production-manifest.json')).sort();
const promotionManifests = walk(EVIDENCE).filter((item) => item.endsWith('.promotion-manifest.json')).sort();
const suffixes = ['complete.json', ...Object.values(mappings)];
const groups = new Map();
for (const file of walk(EVIDENCE).filter((item) => item.endsWith('.json'))) {
  const suffix = suffixes.find((candidate) => file.endsWith(`.${candidate}`));
  if (!suffix) continue;
  const prefix = file.slice(0, -suffix.length - 1);
  if (!groups.has(prefix)) groups.set(prefix, new Map());
  groups.get(prefix).set(suffix, file);
}
if (groups.size === 0 && productionManifests.length === 0
  && !process.argv.includes('--allow-empty')) failures.push('no evidence manifests found');
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

for (const manifestPath of productionManifests) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const directory = path.dirname(manifestPath);
  if (manifest.schema !== 'transcript-proofreading-production-evidence-manifest/v1') {
    failures.push(`${path.relative(ROOT, manifestPath)} invalid production schema`);
    continue;
  }
  const requiredProductionArtifacts = [
    'qwen.json', 'minimax.json', 'compact-review.json', 'audio.json',
    'adjudication-qwen.json', 'adjudication-minimax.json',
    'adjudication-qwen-sentence.json', 'adjudication-minimax-sentence.json',
  ];
  if (requiredProductionArtifacts.some((name) => !manifest.artifacts?.[name])) {
    failures.push(`${path.relative(ROOT, manifestPath)} missing required production artifacts`);
  }
  for (const [name, record] of Object.entries(manifest.artifacts || {})) {
    const artifactPath = path.resolve(directory, record.file || '');
    if (path.dirname(artifactPath) !== directory || !existsSync(artifactPath)) {
      failures.push(`${path.relative(ROOT, manifestPath)} invalid production artifact path: ${name}`);
      continue;
    }
    const bytes = readFileSync(artifactPath);
    if (sha256(bytes) !== record.sha256) failures.push(`${path.relative(ROOT, artifactPath)} production byte digest mismatch`);
    const artifact = JSON.parse(bytes.toString('utf8'));
    if (artifact.sourceDigest !== manifest.sourceDigest || artifact.runId !== manifest.runId) {
      failures.push(`${path.relative(ROOT, artifactPath)} production binding mismatch`);
    }
    if (artifact.schema === 'transcript-proofreading-adjudication-candidate/v1') {
      const ids = (artifact.decisions || []).map((item) => item.id);
      if (artifact.packetDigest !== manifest.packetDigest || artifact.audioSha256 !== manifest.audioSha256
        || ids.length !== manifest.itemCount || new Set(ids).size !== manifest.itemCount
        || artifact.decisions.some((item) => !String(item.inputDigest || '').startsWith('sha256:'))) {
        failures.push(`${path.relative(ROOT, artifactPath)} invalid adjudication evidence binding`);
      }
      if (artifact.model?.provider === 'gx10-qwen' && artifact.model.attested !== true) {
        failures.push(`${path.relative(ROOT, artifactPath)} Qwen evidence is not attested`);
      }
      if (artifact.model?.provider === 'minimax-m3' && !artifact.authorization?.scope) {
        failures.push(`${path.relative(ROOT, artifactPath)} MiniMax authorization is missing`);
      }
    }
    if (artifact.schema === 'transcript-proofreading-audio-evidence/v1') {
      const command = artifact.acquisition?.downloadCommand;
      if (artifact.acquisition?.method !== 'yt-dlp-fresh-download'
        || artifact.acquisition?.freshDownload !== true
        || artifact.acquisition?.downloadedAudioSha256 !== artifact.audioSha256
        || artifact.acquisition?.videoId !== artifact.youtubeVideoId
        || artifact.acquisition?.requestedUrl !== artifact.youtubeUrl
        || !Array.isArray(command)
        || command.at(-1) !== artifact.youtubeUrl
        || !command.includes('--no-playlist')
        || !command.includes('--force-overwrites')
        || !artifact.acquisition?.metadataDigest) {
        failures.push(`${path.relative(ROOT, artifactPath)} invalid audio acquisition evidence`);
      }
    }
  }
  const packetRecord = manifest.artifacts?.['compact-review.json'];
  const audioRecord = manifest.artifacts?.['audio.json'];
  if (packetRecord && audioRecord) {
    const packet = JSON.parse(readFileSync(path.resolve(directory, packetRecord.file), 'utf8'));
    const audio = JSON.parse(readFileSync(path.resolve(directory, audioRecord.file), 'utf8'));
    const proposalIds = (packet.items || []).map((item) => item?.proposal?.id);
    const audioIds = (audio.items || []).map((item) => item?.id);
    if (proposalIds.length !== manifest.itemCount
      || audioIds.length !== proposalIds.length
      || audioIds.some((id, index) => id !== proposalIds[index])) {
      failures.push(`${path.relative(ROOT, manifestPath)} packet/audio ID coverage mismatch`);
    }
  }
}

for (const manifestPath of promotionManifests) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const directory = path.dirname(manifestPath);
  if (manifest.schema !== 'transcript-proofreading-promotion/v1'
    || manifest.runId !== path.basename(directory)
    || manifest.validation?.valid !== true) {
    failures.push(`${path.relative(ROOT, manifestPath)} invalid promotion schema or binding`);
    continue;
  }
  const records = {
    candidateDigest: 'session_08.final-candidate.json',
    ledgerDigest: 'session_08.final-ledger.json',
    reviewQueueDigest: 'session_08.final-review-queue.json',
    completionDigest: 'session_08.final-complete.json',
    independentReviewDigest: 'session_08.independent-review.json',
    preSourceFileDigest: 'session_08.pre-promotion-source.json',
  };
  for (const [field, filename] of Object.entries(records)) {
    const artifactPath = path.join(directory, filename);
    if (!existsSync(artifactPath) || sha256(readFileSync(artifactPath)) !== manifest[field]) {
      failures.push(`${path.relative(ROOT, manifestPath)} invalid promotion artifact: ${filename}`);
    }
  }
  const reviewPath = path.join(directory, records.independentReviewDigest);
  if (existsSync(reviewPath)) {
    const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
    if (review.runId !== manifest.runId || review.outcome !== 'PASS') {
      failures.push(`${path.relative(ROOT, manifestPath)} independent review is not PASS`);
    }
  }
  const promotedPath = path.resolve(ROOT, manifest.promotedPath || '');
  const amendmentPath = path.join(directory, 'session_08.overview-amendment.json');
  const safePromotedPath = promotedPath.startsWith(`${ROOT}${path.sep}`) && existsSync(promotedPath);
  const amended = existsSync(amendmentPath) && safePromotedPath
    && validateOverviewAmendment({
      candidate: readFileSync(path.join(directory, records.candidateDigest)),
      published: readFileSync(promotedPath), manifest,
      amendment: JSON.parse(readFileSync(amendmentPath)),
    }).length === 0;
  if (existsSync(amendmentPath) && !amended) {
    failures.push(`${path.relative(ROOT, manifestPath)} invalid overview amendment`);
  }
  if (!promotedPath.startsWith(`${ROOT}${path.sep}`) || !existsSync(promotedPath)
    || (!amended && sha256(readFileSync(promotedPath)) !== manifest.promotedSourceFileDigest)
    || manifest.promotedSourceFileDigest !== manifest.candidateDigest) {
    failures.push(`${path.relative(ROOT, manifestPath)} promoted source binding mismatch`);
  }
}

console.log(JSON.stringify({
  schema: 'transcript-proofreading-evidence-audit/v1',
  manifests: manifests.length,
  productionManifests: productionManifests.length,
  promotionManifests: promotionManifests.length,
  valid: failures.length === 0,
  failures,
}, null, 2));
if (failures.length > 0) process.exitCode = 1;
