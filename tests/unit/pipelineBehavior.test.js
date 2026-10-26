import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('pipeline Python behavior contracts', () => {
  const python = process.env.PIPELINE_PYTHON || 'python3';
  const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests/python',
    '-p', 'test_pipeline_behavior.py', '-v'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
});
