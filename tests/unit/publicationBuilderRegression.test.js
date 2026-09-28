import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('publication builder boundary and CLI runtime contracts', () => {
  const result = spawnSync('python3', [fileURLToPath(new URL('./publication_builder_regression.py', import.meta.url))], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
