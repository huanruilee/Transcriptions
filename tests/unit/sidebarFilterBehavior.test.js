// Issue #9 — Sidebar search filter behavior test.
//
// Verifies the P2 sidebar filter actually narrows the visible list, by driving
// the real `initSidebarFilter` registered inside `src/js/app.js` and observing
// the rendered `.session-item` count in a jsdom-backed DOM.
//
// Acceptance criteria (from the issue body):
//   - Sidebar search visibly narrows the list.
//   - Clearing the search restores all sessions.
//   - Active session and unavailable-session behavior remain intact.
//   - Additional scenarios: case-insensitive, Chinese summary, exact subSession.
//
// strategy
// 1. Build a jsdom window from src/index.html so #sidebar-filter and
//    #session-list exist.
// 2. Stub the global fetch so the DOMContentLoaded handler in app.js finds
//    a real course.json / toc.json without leaving the test environment.
// 3. Import app.js — the module attaches a DOMContentLoaded listener that
//    calls loadCourseData() and then initSidebarFilter(). Fire the event
//    ourselves and wait for the async chain to settle.
// 4. Once the sidebar is rendered, set the input value and dispatch an
//    `input` event. After each change, count `.session-item` in the DOM
//    and inspect which sessions are present.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const INDEX_HTML = readFileSync(path.join(PROJECT_ROOT, 'src/index.html'), 'utf8');
const COURSE_JSON_PATH = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/course.json');
const TOC_JSON_PATH = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/toc.json');
const COURSE_JSON = JSON.parse(readFileSync(COURSE_JSON_PATH, 'utf8'));
const TOC_JSON = JSON.parse(readFileSync(TOC_JSON_PATH, 'utf8'));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function buildAppDom() {
  // 1. Build real DOM from index.html
  const dom = new JSDOM(INDEX_HTML, {
    url: 'https://gx10-2887.tail378c21.ts.net/transcriptions/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  // Make jsdom the global environment so app.js's `document.addEventListener`
  // reaches our DOM and the module's `document.getElementById` calls
  // resolve against ours.
  global.window = window;
  global.document = window.document;
  global.HTMLElement = window.HTMLElement;
  global.Event = window.Event;
  global.CustomEvent = window.CustomEvent;
  // jsdom provides localStorage on the window but Node's global doesn't have
  // one. app.js (initSidebarToggle) reads localStorage directly.
  global.localStorage = window.localStorage;
  global.sessionStorage = window.sessionStorage;
  // app.js initSidebarToggle uses a MutationObserver; expose jsdom's.
  global.MutationObserver = window.MutationObserver;
  global.Node = window.Node;
  global.Element = window.Element;
  global.DOMRect = window.DOMRect;
  global.DOMRectReadOnly = window.DOMRectReadOnly;
  // app.js uses location.hash / history directly; expose both.
  global.location = window.location;
  global.history = window.history;
  // jsdom does not implement scrollIntoView on elements; app.js calls it
  // through toc.js's applyActiveHighlight after a session switch, so polyfill
  // a no-op so the chain reaches renderSidebar.
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = function () {};
  }

  // 2. Mock fetch — return course.json / toc.json from disk for any URL
  global.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('/course.json')) {
      return { ok: true, status: 200, async json() { return COURSE_JSON; } };
    }
    if (typeof url === 'string' && url.includes('/toc.json')) {
      return { ok: true, status: 200, async json() { return TOC_JSON; } };
    }
    if (typeof url === 'string' && url.endsWith('.json')) {
      // session JSON files — return a stub
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            sessionId: '00',
            paragraphs: [{ sentences: [{ text: 'stub', start: 0, end: 1 }] }],
          };
        },
      };
    }
    return { ok: false, status: 404, async json() { return {}; } };
  };

  // 3. Import app.js after the globals are wired so its DOMContentLoaded
  // listener registers against our jsdom document.
  await import('../../src/js/app.js?isolation=' + Date.now());

  // 4. Fire DOMContentLoaded to trigger the init chain.
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

  // 5. Wait for loadCourseData → renderSidebar to complete.
  // The handler awaits multiple fetches; settle for a generous but bounded
  // window so a regression fails fast instead of hanging forever.
  await wait(800);

  return { dom, window };
}

function countSessionItems(window) {
  return window.document.querySelectorAll('.session-item').length;
}

function visibleSessionTitles(window) {
  return Array.from(window.document.querySelectorAll('.session-item:not(.session-unavailable)'))
    .map((li) => li.querySelector('.session-title')?.textContent || '')
    .filter(Boolean);
}

function setFilter(window, value) {
  const input = window.document.getElementById('sidebar-filter');
  if (!input) throw new Error('#sidebar-filter not present');
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

test('Issue #9: sidebar filter behavior — Course Overview bulk render', async (t) => {
  const { window } = await buildAppDom();

  const totalSessions = COURSE_JSON.sessions.length;
  const totalUnavailable = (COURSE_JSON.unavailableSessions || []).length;
  // 198 published + 1 unavailable (99B) = 199 list items.
  const totalItems = totalSessions + totalUnavailable;

  await t.test('baseline: all 199 items render (198 + 99B unavailable)', () => {
    const count = countSessionItems(window);
    assert.equal(count, totalItems, `baseline should render all ${totalItems} items (got ${count})`);
  });

  await t.test('filter "02A" narrows the list (substring match across all 2A sessions)', () => {
    setFilter(window, '02A');
    const items = visibleSessionTitles(window);
    assert.ok(items.length >= 1 && items.length < totalItems,
      `filter "02A" should narrow the list to 1..<${totalItems}, got ${items.length}`);
    for (const item of items) {
      assert.match(item, /2A/, `match should contain 2A, got ${item}`);
    }
  });

  await t.test('filter "歸敬頌" finds the first session (summary match)', () => {
    setFilter(window, '歸敬頌');
    const items = visibleSessionTitles(window);
    assert.ok(items.length >= 1, `expected at least 1 match for 歸敬頌, got ${items.length}`);
    assert.match(items[0], /第 01 堂/, `first match should be 第 01 堂, got ${items[0]}`);
  });

  await t.test('clearing the filter restores the complete list', () => {
    setFilter(window, '');
    const count = countSessionItems(window);
    assert.equal(count, totalItems, `clearing should restore all ${totalItems} items, got ${count}`);
  });

  await t.test('filter "99B" excludes the unavailable session from the session list', () => {
    // 99B is in `unavailableSessions` (not in `sessions`). The filter searches
    // `courseData.sessions`, so 99B should not appear in results; the rendered
    // gap marker for 99B only appears next to 99A when the filter is empty.
    setFilter(window, '99B');
    const items = visibleSessionTitles(window);
    assert.equal(items.length, 0,
      `filter "99B" should match no published sessions, got ${items.length}: ${JSON.stringify(items)}`);
  });

  await t.test('filter "99A" finds the 99A session', () => {
    setFilter(window, '99A');
    const items = visibleSessionTitles(window);
    assert.equal(items.length, 1, `expected 1 match for 99A, got ${items.length}: ${JSON.stringify(items)}`);
    assert.match(items[0], /99A/, `match should be 第 99A 堂, got ${items[0]}`);
  });

  await t.test('filter "甲二 造論宗旨" (multi-character Chinese summary) locates 02A', () => {
    setFilter(window, '甲二 造論宗旨');
    const items = visibleSessionTitles(window);
    assert.equal(items.length, 1, `expected 1 match for 甲二 造論宗旨, got ${items.length}: ${JSON.stringify(items)}`);
    assert.match(items[0], /2A/, `first match should be 第 2A 堂, got ${items[0]}`);
  });

  await t.test('case-insensitive filter ("02a" narrows the same way as "02A")', () => {
    setFilter(window, '02a');
    const items = visibleSessionTitles(window);
    assert.ok(items.length >= 1 && items.length < totalItems,
      `case-insensitive: expected 1..<${totalItems} matches for 02a, got ${items.length}`);
    for (const item of items) {
      assert.match(item, /2A/i, `match should contain 2A (case-insensitive), got ${item}`);
    }
  });

  await t.test('filter "p.63" (pageRange) matches multiple sessions', () => {
    setFilter(window, 'p.63');
    const items = visibleSessionTitles(window);
    assert.ok(items.length >= 2, `expected multiple matches for p.63, got ${items.length}`);
  });

  await t.test('unavailable session behavior intact: clearing shows the 99B gap marker', () => {
    setFilter(window, '');
    const container = window.document.getElementById('session-list');
    const gaps = container.querySelectorAll('.session-item.session-unavailable');
    assert.equal(gaps.length, totalUnavailable, `expected ${totalUnavailable} unavailable gap marker(s), got ${gaps.length}`);
    if (gaps.length > 0) {
      assert.match(gaps[0].querySelector('.session-title')?.textContent || '', /99B/);
    }
  });

  await t.test('active session highlight survives a filter empty->empty round trip', () => {
    const initialActive = window.document.querySelector('.session-item.active');
    assert.ok(initialActive, 'should have an active session-item at baseline');
    assert.match(initialActive.querySelector('.session-title')?.textContent || '',
      /第 01 堂/, `active session should be 第 01 堂, got ${initialActive.querySelector('.session-title')?.textContent}`);
    setFilter(window, '歸敬頌');
    setFilter(window, '');
    const restoredActive = window.document.querySelector('.session-item.active');
    assert.ok(restoredActive, 'active session should be restored after clearing filter');
    assert.match(restoredActive.querySelector('.session-title')?.textContent || '',
      /第 01 堂/, `active session should still be 第 01 堂 after round trip, got ${restoredActive.querySelector('.session-title')?.textContent}`);
  });
});
