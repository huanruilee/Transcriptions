import test from 'node:test';import assert from 'node:assert/strict';import{spawnSync}from'node:child_process';
test('local acoustic alternatives preserve boundaries and expose ambiguity',()=>{const r=spawnSync('python3',['tests/audio_calibration_local_test.py'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
