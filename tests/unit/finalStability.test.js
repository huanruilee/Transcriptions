import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Final ASR + LLM acceptance permits small stable gains with verified paired evidence', () => {
  const result = spawnSync(process.env.PIPELINE_PYTHON || 'python3', ['tests/python/test_final_stability.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
