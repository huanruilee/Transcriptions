import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAudioUrl } from '../../src/js/app.js';

test('resolveAudioUrl: leaves full http/https URLs unchanged', () => {
  assert.equal(
    resolveAudioUrl('https://example.com/audio/01.mp3'),
    'https://example.com/audio/01.mp3'
  );
  assert.equal(
    resolveAudioUrl('http://cdn.flyday.com.tw/01.mp3'),
    'http://cdn.flyday.com.tw/01.mp3'
  );
});

test('resolveAudioUrl: prepends custom/configured audio base URL to relative paths', () => {
  const remoteBase = 'https://gx10-2887.tail378c21.ts.net/audio';
  assert.equal(
    resolveAudioUrl('audio/01.mp3', remoteBase),
    'https://gx10-2887.tail378c21.ts.net/audio/audio/01.mp3'
  );
  assert.equal(
    resolveAudioUrl('02A.mp3', 'https://gx10-2887.tail378c21.ts.net/audio/'),
    'https://gx10-2887.tail378c21.ts.net/audio/02A.mp3'
  );
});

test('resolveAudioUrl: looks up remote URL from audio map if sessionId matches', () => {
  const map = {
    '01': 'https://buddha.flyday.com.tw/68/01.MP3',
    '02A': 'https://buddha.flyday.com.tw/68/02A.MP3'
  };
  assert.equal(
    resolveAudioUrl('audio/01.mp3', null, '01', map),
    'https://buddha.flyday.com.tw/68/01.MP3'
  );
  assert.equal(
    resolveAudioUrl('audio/02A.mp3', null, '02A', map),
    'https://buddha.flyday.com.tw/68/02A.MP3'
  );
});

test('resolveAudioUrl: returns relative URL directly if no base is configured', () => {
  assert.equal(resolveAudioUrl('audio/01.mp3'), 'audio/01.mp3');
  assert.equal(resolveAudioUrl(''), '');
  assert.equal(resolveAudioUrl(null), '');
});
