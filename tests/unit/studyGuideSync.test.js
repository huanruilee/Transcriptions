import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('study-guide sync fails closed and preserves verbatim alignment', () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests/python',
    '-p', 'test_study_guide_sync.py', '-v'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
});
