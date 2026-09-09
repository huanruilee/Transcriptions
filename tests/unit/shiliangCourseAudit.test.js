import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('course audit emits compact evidence for all 8 batches and 32 sessions', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shiliang-course-audit-'));
  const baseline = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const run = spawnSync(process.execPath, [
    'scripts/audit_shiliang_course.mjs', '--output-root', out, '--baseline', baseline,
  ], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);

  const all = [];
  for (let batch = 1; batch <= 8; batch += 1) {
    const report = JSON.parse(fs.readFileSync(path.join(out, `B${batch}`, 'scan_summary.json'), 'utf8'));
    assert.equal(report.baselineCommit, baseline);
    assert.equal(report.sessions.length, 4);
    assert.deepEqual(Object.keys(report).sort(), ['baselineCommit', 'batch', 'course', 'schema', 'sessions']);
    for (const session of report.sessions) {
      assert.deepEqual(Object.keys(session).sort(), ['id', 'paragraphCount', 'sentenceCount', 'sessionSha256', 'timestampViolations']);
    }
    all.push(...report.sessions);
  }
  fs.rmSync(out, { recursive: true, force: true });
  assert.equal(all.length, 32);
  assert.deepEqual(all.map(x => x.id), Array.from({ length: 32 }, (_, i) => String(i + 1).padStart(2, '0')));
  assert.deepEqual(all.flatMap(x => x.timestampViolations), []);
});

test('course audit rejects a missing or non-ancestor baseline', () => {
  const run = spawnSync(process.execPath, [
    'scripts/audit_shiliang_course.mjs', '--output-root', os.tmpdir(), '--baseline', 'definitely-not-a-commit',
  ], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /existing ancestor/);
});
