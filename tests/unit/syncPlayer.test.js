import test from 'node:test';
import assert from 'node:assert/strict';
import { initSyncPlayer, updateSession } from '../../src/js/syncPlayer.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.scrollCount = 0;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(type, handlers.filter(candidate => candidate !== handler));
  }

  dispatch(type) {
    for (const handler of this.listeners.get(type) || []) {
      handler();
    }
  }

  scrollIntoView() {
    this.scrollCount += 1;
  }
}

class FakeAudioElement extends FakeElement {
  constructor() {
    super('audio-element');
    this.currentTime = 0;
    this.duration = 20;
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }
}

test('updateSession keeps one listener set when reusing the same audio element', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const audio = new FakeAudioElement();
  const sentence0 = new FakeElement('sent-0');
  const sentence1 = new FakeElement('sent-1');
  const lockIndicator = new FakeElement('scroll-lock-indicator');
  const activeSentences = [];

  globalThis.window = new FakeElement('window');
  globalThis.document = {
    getElementById(id) {
      return { 'sent-0': sentence0, 'sent-1': sentence1, 'scroll-lock-indicator': lockIndicator }[id] || null;
    },
    querySelectorAll(selector) {
      if (selector === '.sentence.active') return activeSentences;
      return [];
    },
    querySelector(selector) {
      if (selector === '.sentence.active') return activeSentences[0] || null;
      return null;
    }
  };

  try {
    initSyncPlayer();
    updateSession(audio, [{ start: 0, end: 10, text: 'A' }], () => {});
    updateSession(audio, [{ start: 0, end: 10, text: 'B' }, { start: 10, end: 20, text: 'C' }], () => {});

    assert.equal(audio.listenerCount('loadedmetadata'), 1);
    assert.equal(audio.listenerCount('durationchange'), 1);
    assert.equal(audio.listenerCount('timeupdate'), 1);
    assert.equal(audio.listenerCount('ended'), 1);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});
