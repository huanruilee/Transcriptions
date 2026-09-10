import test from 'node:test';
import assert from 'node:assert/strict';

import { seekAndPlayAudio } from '../../src/js/audioPlayback.js';

class FakeAudio {
  constructor() {
    this.readyState = 0;
    this.currentTime = 0;
    this.loadCalls = 0;
    this.playCalls = 0;
    this.listeners = new Map();
  }

  addEventListener(type, handler, options = {}) {
    this.listeners.set(type, { handler, once: Boolean(options.once) });
  }

  removeEventListener(type, handler) {
    if (this.listeners.get(type)?.handler === handler) this.listeners.delete(type);
  }

  dispatch(type) {
    const entry = this.listeners.get(type);
    if (!entry) return;
    if (entry.once) this.listeners.delete(type);
    entry.handler();
  }

  load() { this.loadCalls += 1; }
  play() { this.playCalls += 1; return Promise.resolve(); }
}

test('waits for metadata before seeking and playing an unloaded remote audio source', async () => {
  const audio = new FakeAudio();
  const playback = seekAndPlayAudio(audio, 42.5);

  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.playCalls, 0);
  assert.equal(audio.currentTime, 0);

  audio.readyState = 1;
  audio.dispatch('loadedmetadata');
  await playback;

  assert.equal(audio.currentTime, 42.5);
  assert.equal(audio.playCalls, 1);
});

test('seeks and plays immediately when metadata is already available', async () => {
  const audio = new FakeAudio();
  audio.readyState = 1;

  await seekAndPlayAudio(audio, 7.25);

  assert.equal(audio.loadCalls, 0);
  assert.equal(audio.currentTime, 7.25);
  assert.equal(audio.playCalls, 1);
});
