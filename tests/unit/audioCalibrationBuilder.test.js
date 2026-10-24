import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('calibration builder never interpolates unmatched audio boundaries',()=>{
  const result=spawnSync('python3',['tests/audio_calibration_builder_test.py'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
