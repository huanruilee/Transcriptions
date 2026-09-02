/**
 * tests/unit/session30BUnavailable.test.js
 *
 * RED-gate for the session 30B "audio missing" UX entry.
 *
 * Background:
 *   The official Flyday index lists 20170121-B as the (30)th session's 下節 (B 段),
 *   matching the sidebar's `nextSessionId('30A') === '30B'` slot. The local ASR
 *   pipeline has no transcript yet for this slot, so the platform must surface
 *   it as an "audio pending" gap marker in the sidebar instead of silently
 *   dropping it from the visible index.
 *
 * Acceptance criteria (minimal):
 *   1. course.json → unavailableSessions[] contains an entry with sessionId "30B".
 *   2. After the sidebar renders, exactly one .session-item.session-unavailable
 *      appears immediately after the published 30A entry, and its label contains
 *      "30B" (so users can find the gap).
 *
 * Note: this test intentionally does not assert officialAudioUrl content (the
 *       sidebar marker renders even without an audio_url), and it does not
 *       require session_30B.json to be present — the gap marker exists precisely
 *       because the session_30B.json is not yet shipped.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const COURSE_JSON_PATH = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/course.json');
const TOC_JSON_PATH = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/toc.json');
const COURSE_JSON = JSON.parse(readFileSync(COURSE_JSON_PATH, 'utf8'));
const TOC_JSON = JSON.parse(readFileSync(TOC_JSON_PATH, 'utf8'));

test('session 30B is registered as audio-pending in unavailableSessions', () => {
  const unavailable = COURSE_JSON.unavailableSessions || [];
  const entry = unavailable.find((u) => u && u.sessionId === '30B');

  assert.ok(
    entry,
    'course.json → unavailableSessions[] must contain an entry with sessionId "30B" ' +
      '(Flyday official 20170121-B is the B 段 of session 30 and the sidebar relies on ' +
      'unavailableSessions to render the gap marker after 30A).'
  );
});

test('session 30B does not appear in published sessions[] (single source of truth)', () => {
  const published = COURSE_JSON.sessions || [];
  const dup = published.find((s) => s && s.sessionId === '30B');
  assert.equal(
    dup,
    undefined,
    '30B must NOT also be listed in published sessions[] (double-publish would break the sidebar gap renderer and the ASR integrity gate).'
  );
});

test('sidebar renders the 30B gap marker immediately after the published 30A item', async () => {
  const indexHtml = readFileSync(path.join(PROJECT_ROOT, 'src/index.html'), 'utf8');

  const dom = new JSDOM(indexHtml, {
    url: 'https://gx10-2887.tail378c21.ts.net/transcriptions/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  global.window = window;
  global.document = window.document;
  global.HTMLElement = window.HTMLElement;
  global.Event = window.Event;
  global.CustomEvent = window.CustomEvent;
  global.localStorage = window.localStorage;
  global.sessionStorage = window.sessionStorage;
  global.MutationObserver = window.MutationObserver;
  global.Node = window.Node;
  global.Element = window.Element;
  global.DOMRect = window.DOMRect;
  global.DOMRectReadOnly = window.DOMRectReadOnly;
  global.location = window.location;
  global.history = window.history;

  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = function () {};
  }

  global.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('/course.json')) {
      return { ok: true, status: 200, async json() { return COURSE_JSON; } };
    }
    if (typeof url === 'string' && url.includes('/toc.json')) {
      return { ok: true, status: 200, async json() { return TOC_JSON; } };
    }
    if (typeof url === 'string' && url.endsWith('.json')) {
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

  await import('../../src/js/app.js?isolation=' + Date.now());
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 800));

  const items = Array.from(window.document.querySelectorAll('#session-list .session-item'));
  const idx30A = items.findIndex((el) => el.dataset && el.dataset.sessionId === '30A');
  assert.ok(idx30A >= 0, 'sidebar must contain the published 30A item');

  const next = items[idx30A + 1];
  assert.ok(next, 'sidebar must have a sibling item rendered directly after the 30A entry');
  assert.equal(
    next.classList.contains('session-unavailable'),
    true,
    'the sibling rendered immediately after 30A must be the .session-unavailable gap marker'
  );

  const titleText = next.querySelector('.session-title')?.textContent || '';
  assert.match(
    titleText,
    /30B/,
    `gap marker title must reference "30B" so users can identify the missing slot, got: ${titleText}`
  );

  const metaText = next.querySelector('.session-meta')?.textContent || '';
  assert.match(
    metaText,
    /30B/,
    `gap marker meta badge must also reference "30B", got: ${metaText}`
  );
});