import test from 'node:test';
import assert from 'node:assert/strict';
import { initSearch } from '../../src/js/search.js';

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
  constructor(id, textContent = '', className = 'sentence') {
    this.id = id;
    this.textContent = textContent;
    this.value = '';
    this.hidden = false;
    this.classList = new FakeClassList();
    if (className) {
      className.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    this.listeners = new Map();
    this.scrolledIntoView = false;
    this.blurred = false;
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

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler(event);
    }
  }

  scrollIntoView() {
    this.scrolledIntoView = true;
  }

  blur() {
    this.blurred = true;
  }
}

let activeSentences = [];
let searchInput = new FakeElement('search-input', '', '');
let searchStatus = new FakeElement('search-status', '', '');

const mockDocument = {
  getElementById(id) {
    if (id === 'search-input') return searchInput;
    if (id === 'search-status') return searchStatus;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === '.sentence') {
      return activeSentences;
    }
    if (selector === '.sentence.search-hit') {
      return activeSentences.filter(s => s.classList.contains('search-hit'));
    }
    if (selector === '.sentence.search-current') {
      return activeSentences.filter(s => s.classList.contains('search-current'));
    }
    return [];
  }
};

globalThis.document = mockDocument;

function setMockSentences(texts) {
  activeSentences = texts.map((t, idx) => new FakeElement(`s-${idx}`, t, 'sentence'));
  searchInput.value = '';
  searchStatus.textContent = '';
  searchStatus.hidden = true;
}

test('search: initSearch does not throw when search-input is null', () => {
  const orig = searchInput;
  searchInput = null;
  try {
    assert.doesNotThrow(() => initSearch());
  } finally {
    searchInput = orig;
  }
});

test('search: finds matching sentences, marks hits, and sets current match', () => {
  setMockSentences([
    '此處說明世俗諦的法相',
    '勝義諦即是諸法實相',
    '世俗諦與勝義諦二者無二',
    '其他無關的文本段落'
  ]);
  initSearch();

  searchInput.value = '世俗';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });

  const hits = mockDocument.querySelectorAll('.sentence.search-hit');
  assert.equal(hits.length, 2, 'should match 2 sentences containing 世俗');
  assert.equal(searchStatus.hidden, false);
  assert.equal(searchStatus.textContent, '1/2 筆');

  const currentHits = mockDocument.querySelectorAll('.sentence.search-current');
  assert.equal(currentHits.length, 1);
  assert.equal(currentHits[0].id, 's-0', 'first hit should be search-current');
  assert.equal(currentHits[0].scrolledIntoView, true);
});

test('search: shows "無相符結果" when query has no matches', () => {
  setMockSentences(['諸行無常', '諸法無我']);
  initSearch();

  searchInput.value = '涅槃寂靜';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });

  assert.equal(mockDocument.querySelectorAll('.sentence.search-hit').length, 0);
  assert.equal(searchStatus.hidden, false);
  assert.equal(searchStatus.textContent, '無相符結果');
});

test('search: clearing input resets hits and hides status', () => {
  setMockSentences(['世俗諦', '勝義諦']);
  initSearch();

  searchInput.value = '諦';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });
  assert.equal(mockDocument.querySelectorAll('.sentence.search-hit').length, 2);

  // Clear input
  searchInput.value = '';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });
  assert.equal(mockDocument.querySelectorAll('.sentence.search-hit').length, 0);
  assert.equal(mockDocument.querySelectorAll('.sentence.search-current').length, 0);
  assert.equal(searchStatus.hidden, true);
  assert.equal(searchStatus.textContent, '');
});

test('search: Enter and Shift+Enter cycles through matches', () => {
  setMockSentences(['段落 A', '段落 B', '段落 C']);
  initSearch();

  searchInput.value = '段落';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });
  assert.equal(searchStatus.textContent, '1/3 筆');

  // Press Enter -> advance to 2/3
  searchInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false, preventDefault() {} });
  assert.equal(searchStatus.textContent, '2/3 筆');
  assert.equal(activeSentences[1].classList.contains('search-current'), true);

  // Press Enter again -> advance to 3/3
  searchInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false, preventDefault() {} });
  assert.equal(searchStatus.textContent, '3/3 筆');
  assert.equal(activeSentences[2].classList.contains('search-current'), true);

  // Press Enter again -> wrap around to 1/3
  searchInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: false, preventDefault() {} });
  assert.equal(searchStatus.textContent, '1/3 筆');
  assert.equal(activeSentences[0].classList.contains('search-current'), true);

  // Press Shift+Enter -> cycle backward to 3/3
  searchInput.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: true, preventDefault() {} });
  assert.equal(searchStatus.textContent, '3/3 筆');
  assert.equal(activeSentences[2].classList.contains('search-current'), true);
});

test('search: Escape key clears query and blurs input', () => {
  setMockSentences(['菩提心', '大悲心']);
  initSearch();

  searchInput.value = '心';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });
  assert.equal(mockDocument.querySelectorAll('.sentence.search-hit').length, 2);

  // Press Escape
  searchInput.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });

  assert.equal(searchInput.value, '');
  assert.equal(mockDocument.querySelectorAll('.sentence.search-hit').length, 0);
  assert.equal(searchInput.blurred, true);
});
