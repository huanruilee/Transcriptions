import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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
