import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initSyncPlayer,
  updateSession,
  highlightSentenceByTime,
  startSimulatedPlayback,
  stopSimulatedPlayback,
  getIsSimulating
} from '../../src/js/syncPlayer.js';

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

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.scrollCount = 0;
    this.textContent = '';
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

  globalThis.window = new FakeElement('window');
  globalThis.document = {
    getElementById(id) {
      return { 'sent-0': sentence0, 'sent-1': sentence1, 'scroll-lock-indicator': lockIndicator }[id] || null;
    },
    querySelectorAll(selector) {
      if (selector === '.sentence.active') {
        const list = [];
        if (sentence0.classList.contains('active')) list.push(sentence0);
        if (sentence1.classList.contains('active')) list.push(sentence1);
        return list;
      }
      return [];
    },
    querySelector() {
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

test('highlightSentenceByTime activates the correct sentence element', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const audio = new FakeAudioElement();
  const sentence0 = new FakeElement('sent-0');
  const sentence1 = new FakeElement('sent-1');

  globalThis.window = new FakeElement('window');
  globalThis.document = {
    getElementById(id) {
      return { 'sent-0': sentence0, 'sent-1': sentence1 }[id] || null;
    },
    querySelectorAll(selector) {
      if (selector === '.sentence.active') {
        const list = [];
        if (sentence0.classList.contains('active')) list.push(sentence0);
        if (sentence1.classList.contains('active')) list.push(sentence1);
        return list;
      }
      return [];
    }
  };

  try {
    initSyncPlayer();
    audio.duration = 10.0;
    const sentences = [
      { start: 0.0, end: 5.0, text: 'A' },
      { start: 5.0, end: 10.0, text: 'B' }
    ];
    updateSession(audio, sentences, () => {});

    // Highlight at 2.0s -> sent-0
    const idx1 = highlightSentenceByTime(2.0);
    assert.equal(idx1, 0);
    assert.equal(sentence0.classList.contains('active'), true);
    assert.equal(sentence1.classList.contains('active'), false);
    assert.equal(sentence0.scrollCount, 1);

    // Highlight at 7.0s -> sent-1
    const idx2 = highlightSentenceByTime(7.0);
    assert.equal(idx2, 1);
    assert.equal(sentence0.classList.contains('active'), false);
    assert.equal(sentence1.classList.contains('active'), true);
    assert.equal(sentence1.scrollCount, 1);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

test('startSimulatedPlayback initiates simulation and stopSimulatedPlayback halts it', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const audio = new FakeAudioElement();
  const sentence0 = new FakeElement('sent-0');
  const statusEl = new FakeElement('now-playing-status');

  globalThis.window = new FakeElement('window');
  globalThis.document = {
    getElementById(id) {
      return { 'sent-0': sentence0 }[id] || null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector(selector) {
      if (selector === '.now-playing-status') return statusEl;
      return null;
    }
  };

  try {
    initSyncPlayer();
    const sentences = [{ start: 0.0, end: 10.0, text: 'A' }];
    updateSession(audio, sentences, () => {});

    assert.equal(getIsSimulating(), false);

    startSimulatedPlayback(0);
    assert.equal(getIsSimulating(), true);
    assert.match(statusEl.textContent, /模擬音訊/);

    stopSimulatedPlayback();
    assert.equal(getIsSimulating(), false);
  } finally {
    stopSimulatedPlayback();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});
