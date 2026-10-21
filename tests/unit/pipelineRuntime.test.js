import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Pipeline runtime: faithful content, protected outputs, boundary coverage and CER', () => {
  const result = spawnSync(process.env.PIPELINE_PYTHON || 'python3', ['tests/python/test_pipeline_runtime.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
