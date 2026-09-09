import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('quality manifest is compact, hashed, and exposes session 28 rollback', () => {
  const out = path.join(os.tmpdir(), `shiliang-manifest-${process.pid}.json`);
  const run = spawnSync(process.execPath, [
    'scripts/prepare_shiliang_quality_manifest.mjs',
    '--sessions', '28',
    '--output', out,
    '--baseline', 'fixture-baseline',
  ], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const manifest = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.rmSync(out);

  assert.equal(manifest.schema, 'shiliang-quality-input/v1');
  assert.equal(manifest.baselineCommit, 'fixture-baseline');
  assert.deepEqual(manifest.sessions.map(x => x.id), ['28']);
  assert.match(manifest.sessions[0].files.session.sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.sessions[0].files.officialRaw.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(manifest.sessions[0].timestampViolations, [{
    type: 'ROLLBACK',
    previousId: 'sent-194',
    sentenceId: 'sent-195',
    previousEnd: 2359.15,
    start: 2258.83,
    delta: -100.32,
  }]);
  assert.ok(!JSON.stringify(manifest).includes('對於這個質疑'));
  assert.deepEqual(manifest.allowedPaths, [
    'courses/釋量論第二品/sessions/session_28.json',
    'reviews/evidence/shiliang_32_continuous/B7/',
  ]);
});
