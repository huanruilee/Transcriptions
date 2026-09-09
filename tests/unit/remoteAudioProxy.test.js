import test from 'node:test';
import assert from 'node:assert/strict';

import { toPlayableAudioUrl } from '../../src/js/remoteAudioProxy.js';
import fs from 'node:fs';

test('routes Drive usercontent through the same-origin streaming bridge', () => {
  const remote = 'https://drive.usercontent.google.com/download?id=file123&export=open';
  assert.equal(
    toPlayableAudioUrl(remote, '/Transcriptions/'),
    `/Transcriptions/remote-audio?url=${encodeURIComponent(remote)}`,
  );
});

test('leaves ordinary audio sources unchanged', () => {
  const remote = 'https://buddha.flyday.com.tw/audio/01.mp3';
  assert.equal(toPlayableAudioUrl(remote, '/Transcriptions/'), remote);
});

test('development server and production worker both serve the streaming bridge', () => {
  const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
  const worker = fs.readFileSync('public/audio-sw.js', 'utf8');
  assert.match(viteConfig, /['"]\/remote-audio['"]/);
  assert.match(viteConfig, /drive\.usercontent\.google\.com/);
  assert.match(worker, /endsWith\(['"]\/remote-audio['"]\)/);
  assert.match(worker, /event\.request\.headers\.get\(['"]range['"]\)/);
});
