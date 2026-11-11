import test from'node:test';import assert from'node:assert/strict';import{spawnSync}from'node:child_process';
test('review audio server supports real byte-range seeking',()=>{const r=spawnSync('python3',['tests/audio_calibration_server_test.py'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
