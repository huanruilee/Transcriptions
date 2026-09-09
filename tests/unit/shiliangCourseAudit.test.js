import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('course audit emits compact evidence for all 8 batches and 32 sessions', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shiliang-course-audit-'));
  const run = spawnSync(process.execPath, [
    'scripts/audit_shiliang_course.mjs', '--output-root', out, '--baseline', 'fixture-baseline',
  ], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);

  const all = [];
  for (let batch = 1; batch <= 8; batch += 1) {
    const report = JSON.parse(fs.readFileSync(path.join(out, `B${batch}`, 'scan_summary.json'), 'utf8'));
    assert.equal(report.baselineCommit, 'fixture-baseline');
    assert.equal(report.sessions.length, 4);
    assert.ok(!JSON.stringify(report).includes('對於這個質疑'));
    all.push(...report.sessions);
  }
  fs.rmSync(out, { recursive: true, force: true });
  assert.equal(all.length, 32);
  assert.deepEqual(all.flatMap(x => x.timestampViolations), []);
});
