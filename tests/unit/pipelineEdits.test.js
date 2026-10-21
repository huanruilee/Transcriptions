import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Pipeline edits: partial acceptance, source phonetics, normalization and evidence', () => {
  const result = spawnSync(process.env.PIPELINE_PYTHON || 'python3', ['tests/python/test_pipeline_edits.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
