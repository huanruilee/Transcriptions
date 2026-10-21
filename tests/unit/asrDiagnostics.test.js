import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('ASR diagnostics: independent coverage, deletion evidence and controlled ablation', () => {
  const result = spawnSync(process.env.PIPELINE_PYTHON || 'python3', ['tests/python/test_asr_diagnostics.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
