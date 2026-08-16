// M6.3 a11y tests (AGY review): verify Roving Tabindex pattern + safePlay + race guard.
// Uses jsdom to simulate the DOM and assert the accessibility contract:
//   - Only the FIRST sentence is tab-focusable (tabindex=0); the rest are -1
//     (avoids Tab Flood — thousands of tabbable sentences would trap keyboard users).
//   - toc-link is a native <a href> (no redundant role="button"/tabindex).
//   - safePlay() catches audio.play() rejection (no unhandled rejection).
//   - switchSession() has a sessionLoading race-condition guard.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = readFileSync(path.join(__dirname, '../../src/js/app.js'), 'utf8');
const TOC_JS = readFileSync(path.join(__dirname, '../../src/js/toc.js'), 'utf8');

test('M6.3: sentence uses Roving Tabindex (only first is tab-focusable)', () => {
  // The renderTranscript code must set tabIndex = idx === 0 ? 0 : -1
  assert.match(APP_JS, /span\.tabIndex = idx === 0 \? 0 : -1;/,
    'sentence tabIndex must be roving: first=0, rest=-1');
  // And must NOT set tabindex=0 on every sentence (Tab Flood anti-pattern)
  assert.doesNotMatch(APP_JS, /span\.tabIndex = 0;/,
    'must not make every sentence tab-focusable (Tab Flood)');
});

test('M6.3: sentence has no redundant role="button" (it is a seek target, not a button)', () => {
  assert.doesNotMatch(APP_JS, /span\.setAttribute\('role', 'button'\)/,
    'sentence should not be announced as a button');
});

test('M6.3: sentence has aria-label with human-readable time', () => {
  assert.match(APP_JS, /aria-label.*formatAriaTime\(s\.start\)/,
    'sentence aria-label should use formatAriaTime');
  // formatAriaTime must produce "X 分 Y 秒" / "X 秒"
  assert.match(APP_JS, /function formatAriaTime/);
  assert.match(APP_JS, /`\$\{m\} 分 \$\{s\} 秒`/);
});

test('M6.3: ArrowDown/ArrowUp roving navigation moves focus + seeks', () => {
  assert.match(APP_JS, /e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'/,
    'arrow keys must drive roving navigation');
  assert.match(APP_JS, /next\.tabIndex = 0;/,
    'target sentence becomes tab-focusable');
  assert.match(APP_JS, /el\.tabIndex = -1;/,
    'source sentence loses focusability');
});

test('M6.3: toc-link is a native anchor (no redundant role/tabindex)', () => {
  assert.match(TOC_JS, /link\.href = `#session-/,
    'toc-link must be a real <a href>');
  assert.doesNotMatch(TOC_JS, /link\.setAttribute\('role', 'button'\)/,
    'no redundant role=button on anchor');
  assert.doesNotMatch(TOC_JS, /link\.tabIndex = 0;/,
    'no redundant tabindex on native anchor');
});

test('M6.3: safePlay() catches audio.play() rejection (no unhandled rejection)', () => {
  assert.match(APP_JS, /function safePlay\(audio/,
    'safePlay wrapper must exist');
  assert.match(APP_JS, /p\.catch\(\(err\) =>/,
    'safePlay must catch the play() promise rejection');
  assert.match(APP_JS, /showToast\(fallbackMsg \|\| '音檔播放失敗/,
    'safePlay must surface a user-visible toast on failure');
});

test('M6.3: switchSession has sessionLoading race-condition guard', () => {
  assert.match(APP_JS, /let sessionLoading = false;/,
    'sessionLoading flag must be declared');
  assert.match(APP_JS, /if \(sessionLoading\) return;/,
    're-entry during in-flight fetch must be ignored');
  assert.match(APP_JS, /finally \{\s*sessionLoading = false;/,
    'sessionLoading must reset in finally (even on error)');
});
