import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'verify_transcript_proofreading_evidence.mjs');

function run(directory) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, TRANSCRIPT_PROOFREADING_EVIDENCE_ROOT: directory },
  });
}

function bytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

test('evidence audit fails closed for empty, orphaned, and incomplete artifact groups', () => {
  const empty = mkdtempSync(path.join(tmpdir(), 'proofread-evidence-empty-'));
  assert.notEqual(run(empty).status, 0);

  const orphan = mkdtempSync(path.join(tmpdir(), 'proofread-evidence-orphan-'));
  mkdirSync(path.join(orphan, 'pilot', 'course'), { recursive: true });
  writeFileSync(path.join(orphan, 'pilot', 'course', 'session_01.ledger.json'), '{}\n');
  const orphanResult = run(orphan);
  assert.notEqual(orphanResult.status, 0);
  assert.match(orphanResult.stdout, /missing complete\.json/u);

  const valid = mkdtempSync(path.join(tmpdir(), 'proofread-evidence-valid-'));
  const directory = path.join(valid, 'pilot', 'course');
  mkdirSync(directory, { recursive: true });
  const runId = 'run-1';
  const sourceDigest = 'sha256:source';
  const artifacts = {
    ledger: { runId, sourceDigest },
    reviewQueue: { runId, sourceDigest },
    modelResponses: { runId, sourceDigest },
  };
  const names = { ledger: 'ledger', reviewQueue: 'review-queue', modelResponses: 'model-responses' };
  const artifactDigests = {};
  for (const [name, value] of Object.entries(artifacts)) {
    const content = bytes(value);
    writeFileSync(path.join(directory, `session_01.${names[name]}.json`), content);
    artifactDigests[name] = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  }
  writeFileSync(path.join(directory, 'session_01.complete.json'), bytes({ runId, sourceDigest, artifactDigests }));
  assert.equal(run(valid).status, 0);
});

test('production evidence audit binds byte digests, audio provenance, and adjudication inputs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'proofread-production-'));
  const directory = path.join(root, 'production', 'course');
  mkdirSync(directory, { recursive: true });
  const sourceDigest = 'sha256:source';
  const runId = 'run-1';
  const audioSha256 = 'sha256:audio';
  const packetDigest = 'sha256:packet';
  const common = { sourceDigest, runId };
  const adjudication = (provider) => ({
    ...common, schema: 'transcript-proofreading-adjudication-candidate/v1',
    packetDigest, audioSha256,
    model: { provider, ...(provider === 'gx10-qwen' ? { attested: true } : {}) },
    ...(provider === 'minimax-m3' ? { authorization: { scope: 'test-authorization' } } : {}),
    decisions: [{ id: 'seg-1', inputDigest: 'sha256:input' }],
  });
  const artifacts = {
    'qwen.json': common,
    'minimax.json': common,
    'compact-review.json': { ...common, items: [{ proposal: { id: 'seg-1' } }] },
    'audio.json': { ...common, schema: 'transcript-proofreading-audio-evidence/v1', audioSha256,
      youtubeVideoId: 'video', acquisition: { method: 'yt-dlp-fresh-download', freshDownload: true,
        downloadedAudioSha256: audioSha256, videoId: 'video', metadataDigest: 'sha256:metadata',
        requestedUrl: 'https://www.youtube.com/watch?v=video',
        downloadCommand: ['yt-dlp', '--force-overwrites', '--no-playlist', 'https://www.youtube.com/watch?v=video'] },
      youtubeUrl: 'https://www.youtube.com/watch?v=video', items: [{ id: 'seg-1' }] },
    'adjudication-qwen.json': adjudication('gx10-qwen'),
    'adjudication-minimax.json': adjudication('minimax-m3'),
    'adjudication-qwen-sentence.json': adjudication('gx10-qwen'),
    'adjudication-minimax-sentence.json': adjudication('minimax-m3'),
  };
  const records = {};
  for (const [name, value] of Object.entries(artifacts)) {
    const content = bytes(value);
    writeFileSync(path.join(directory, name), content);
    records[name] = { file: name, sha256: `sha256:${createHash('sha256').update(content).digest('hex')}` };
  }
  const manifest = {
    schema: 'transcript-proofreading-production-evidence-manifest/v1',
    sourceDigest, runId, audioSha256, packetDigest, itemCount: 1, artifacts: records,
  };
  writeFileSync(path.join(directory, 'session.production-manifest.json'), bytes(manifest));
  assert.equal(run(root).status, 0);

  const badAudio = structuredClone(artifacts['audio.json']);
  badAudio.acquisition.downloadCommand = badAudio.acquisition.downloadCommand.filter((item) => item !== '--force-overwrites');
  const badAudioBytes = bytes(badAudio);
  writeFileSync(path.join(directory, 'audio.json'), badAudioBytes);
  manifest.artifacts['audio.json'].sha256 = `sha256:${createHash('sha256').update(badAudioBytes).digest('hex')}`;
  writeFileSync(path.join(directory, 'session.production-manifest.json'), bytes(manifest));
  const unsafeAcquisition = run(root);
  assert.notEqual(unsafeAcquisition.status, 0);
  assert.match(unsafeAcquisition.stdout, /invalid audio acquisition evidence/u);

  const validAudioBytes = bytes(artifacts['audio.json']);
  writeFileSync(path.join(directory, 'audio.json'), validAudioBytes);
  manifest.artifacts['audio.json'].sha256 = `sha256:${createHash('sha256').update(validAudioBytes).digest('hex')}`;
  writeFileSync(path.join(directory, 'session.production-manifest.json'), bytes(manifest));
  writeFileSync(path.join(directory, 'qwen.json'), `${readFileSync(path.join(directory, 'qwen.json'), 'utf8')} `);
  const tampered = run(root);
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stdout, /production byte digest mismatch/u);
});
