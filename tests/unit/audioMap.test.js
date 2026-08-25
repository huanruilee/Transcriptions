import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveAudioUrl } from '../../src/js/app.js';

describe('Audio Map and Remote Stream Resolution Tests', () => {
  const audioMapPath = path.resolve('courses/入中論善顯密意疏/audio_map.json');
  const coursePath = path.resolve('courses/入中論善顯密意疏/course.json');
  const session29Path = path.resolve('courses/入中論善顯密意疏/sessions/session_29A.json');

  test('audio_map.json exists and contains 198 official Flyday audio mappings', () => {
    assert.ok(fs.existsSync(audioMapPath), 'audio_map.json must exist');
    const audioMap = JSON.parse(fs.readFileSync(audioMapPath, 'utf8'));
    const keys = Object.keys(audioMap);
    assert.ok(keys.length >= 198, `Expected at least 198 mapped sessions, got ${keys.length}`);
    
    // Check random samples
    assert.match(audioMap['01'], /^https:\/\/buddha\.flyday\.com\.tw\/.*\.MP3$/i);
    assert.match(audioMap['29A'], /^https:\/\/buddha\.flyday\.com\.tw\/.*\.MP3$/i);
    assert.match(audioMap['100A'], /^https:\/\/buddha\.flyday\.com\.tw\/.*\.MP3$/i);
  });

  test('resolveAudioUrl resolves session to original remote Flyday audio URL', () => {
    const audioMap = JSON.parse(fs.readFileSync(audioMapPath, 'utf8'));
    const resolved29A = resolveAudioUrl('', null, '29A', audioMap);
    assert.equal(resolved29A, audioMap['29A']);

    const resolvedDirect = resolveAudioUrl(audioMap['29A'], null, null);
    assert.equal(resolvedDirect, audioMap['29A']);
  });

  test('session_29A.json points audioUrl to original remote Flyday stream', () => {
    const session29 = JSON.parse(fs.readFileSync(session29Path, 'utf8'));
    assert.ok(session29.audioUrl.includes('flyday'), 'session_29A.json audioUrl must point to remote Flyday stream');
  });
});
