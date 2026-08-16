// M6.3 a11y tests (AGY review + 小檢 QA): verify Roving Tabindex pattern,
// safePlay rejection handling, and aria-time formatting as REAL DOM behavior
// using jsdom — not just regex on source text.
//
// 小檢 QA 發現（2026-08-17）：原測試 import 了 JSDOM 卻只用 regex 驗證原始碼，
// 沒有真的實例化 DOM。本版修正：import src/js/a11y.js 的純函式，用 jsdom 建立
// 真實 DOM 元素，驗證實際的焦點移動、tabindex 切換、rejection 捕獲行為。
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { formatAriaTime, safePlay, rovingMove } from '../../src/js/a11y.js';

// --- formatAriaTime: pure function behavior ---
test('M6.3: formatAriaTime formats seconds as human-readable Chinese', () => {
  assert.equal(formatAriaTime(0), '0 秒');
  assert.equal(formatAriaTime(45), '45 秒');
  assert.equal(formatAriaTime(65), '1 分 5 秒');
  assert.equal(formatAriaTime(330), '5 分 30 秒');
  assert.equal(formatAriaTime(-5), '0 秒'); // negative → safe default
  assert.equal(formatAriaTime(NaN), '0 秒'); // non-finite → safe default
});

// --- safePlay: real rejection capture (AGY risk #1) ---
test('M6.3: safePlay catches audio.play() rejection (no unhandled rejection)', async () => {
  const dom = new JSDOM('<audio id="a"></audio>');
  const audio = dom.window.document.getElementById('a');
  // Simulate a play() that returns a rejecting promise (e.g. 404 source)
  audio.play = () => Promise.reject(new Error('NotSupportedError: source missing'));

  let errorSinkCalled = false;
  let sinkMsg = '';
  // safePlay must NOT throw; it must route the rejection to the onError sink
  safePlay(audio, '音檔播放失敗，請確認音源存在。', (msg) => {
    errorSinkCalled = true;
    sinkMsg = msg;
  });

  // Give the microtask queue a chance to run the .catch
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(errorSinkCalled, true, 'onError sink must be called on rejection');
  assert.equal(sinkMsg, '音檔播放失敗，請確認音源存在。');
});

test('M6.3: safePlay does nothing when audio is null', () => {
  // Must not throw on null audio
  assert.doesNotThrow(() => safePlay(null, 'msg', () => {}));
});

test('M6.3: safePlay ignores non-promise play() return (sync success)', () => {
  const dom = new JSDOM('<audio id="a"></audio>');
  const audio = dom.window.document.getElementById('a');
  audio.play = () => undefined; // some browsers return undefined
  assert.doesNotThrow(() => safePlay(audio, 'msg', () => {}));
});

// --- rovingMove: real DOM focus/tabindex behavior (AGY Tab Flood fix) ---
function makeSentences(n) {
  const dom = new JSDOM('<div id="c"></div>');
  const container = dom.window.document.getElementById('c');
  const els = [];
  for (let i = 0; i < n; i++) {
    const s = dom.window.document.createElement('span');
    s.className = 'sentence';
    s.tabIndex = i === 0 ? 0 : -1; // Roving: only first is tab-focusable
    container.appendChild(s);
    els.push(s);
  }
  return { dom, els };
}

test('M6.3: rovingMove moves focus down and swaps tabindex (no Tab Flood)', () => {
  const { dom, els } = makeSentences(3);
  assert.equal(els[0].tabIndex, 0, 'first sentence starts tab-focusable');
  assert.equal(els[1].tabIndex, -1, 'others start non-focusable');

  const next = rovingMove(els, 0, 1); // ArrowDown from index 0
  assert.equal(next, 1, 'returns new focused index');
  assert.equal(els[0].tabIndex, -1, 'source loses focusability');
  assert.equal(els[1].tabIndex, 0, 'target becomes focusable');
  assert.equal(dom.window.document.activeElement, els[1], 'target receives focus');
});

test('M6.3: rovingMove moves focus up', () => {
  const { els } = makeSentences(3);
  const next = rovingMove(els, 2, -1); // ArrowUp from index 2
  assert.equal(next, 1);
  assert.equal(els[1].tabIndex, 0);
  assert.equal(els[2].tabIndex, -1);
});

test('M6.3: rovingMove does not move past boundaries', () => {
  const { els } = makeSentences(2);
  assert.equal(rovingMove(els, 0, -1), -1, 'cannot move up from first');
  assert.equal(rovingMove(els, 1, 1), -1, 'cannot move down from last');
  assert.equal(els[0].tabIndex, 0, 'first stays focusable at boundary');
});

test('M6.3: rovingMove calls onSeek with the newly focused element', () => {
  const { els } = makeSentences(2);
  let seeked = null;
  rovingMove(els, 0, 1, (el) => { seeked = el; });
  assert.equal(seeked, els[1], 'onSeek receives the target element');
});

// --- source-level contract (kept as a light guard, not the primary check) ---
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = readFileSync(path.join(__dirname, '../../src/js/app.js'), 'utf8');

test('M6.3: app.js imports a11y helpers (no duplicate local definitions)', () => {
  assert.match(APP_JS, /import \{ formatAriaTime, safePlay \} from '\.\/a11y\.js';/,
    'app.js must import a11y helpers');
  assert.doesNotMatch(APP_JS, /function formatAriaTime\(seconds\)/,
    'formatAriaTime must not be redefined in app.js');
  assert.doesNotMatch(APP_JS, /function safePlay\(audio/,
    'safePlay must not be redefined in app.js');
});
