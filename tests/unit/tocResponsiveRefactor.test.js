/**
 * tests/unit/tocResponsiveRefactor.test.js
 *
 * Comprehensive UI test patterns for:
 * 1. Desktop Tag Collapse & Popover Navigation
 * 2. Mobile Bottom Sheet Trigger & Seek Dispatch
 * 3. Touch Ergonomics (WCAG 44x44px minimum touch targets)
 * 4. Mobile First-Screen Space Optimization (inline accordion suppression)
 * 5. Keyboard Accessibility & Escape Key Dismissal
 */

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

describe('📱 TOC Responsive Refactor & Cross-Session Tag De-noising', () => {
  let dom;
  let document;
  let window;
  let tocModule;
  let drawerCss;
  let mainCss;

  before(async () => {
    drawerCss = fs.readFileSync(path.join(ROOT, 'src/css/drawer.css'), 'utf-8');
    mainCss = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf-8');
  });

  beforeEach(async () => {
    dom = new JSDOM(`<!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <div class="session-header-row">
            <h1 id="active-session-title">第 101A 堂</h1>
            <button id="mobile-toc-drawer-btn" class="mobile-toc-drawer-btn">📑 本課科判</button>
          </div>
          <div id="toc-container"></div>
          <div id="toc-breadcrumb"></div>
          <footer class="player-bar">
            <button id="toc-drawer-trigger" class="toc-drawer-trigger-btn">📖 科判</button>
          </footer>
          <div id="toc-sheet-backdrop" class="toc-sheet-backdrop"></div>
          <div id="toc-bottom-sheet" class="toc-bottom-sheet"></div>
        </body>
      </html>`, {
      url: 'http://localhost/',
    });

    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;
    global.HTMLElement = window.HTMLElement;

    // Cache-bust import of toc.js into current jsdom environment
    tocModule = await import(`../../src/js/toc.js?test=${Date.now()}-${Math.random()}`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Pattern 1: Desktop Tag Collapse & Popover Navigation
  // ───────────────────────────────────────────────────────────────────────────
  test('Pattern 1: Desktop Tag Collapse pins active session and collapses remaining sessions into +N ghost badge', () => {
    const link = document.createElement('a');
    link.className = 'toc-link';
    const sessions = ['100A', '100B', '101A', '101B', '102A', '102B', '103A', '103B'];

    // Render with '101A' as active session
    tocModule.renderSessionBadges(link, sessions, '101A');

    // Exactly 1 pinned session badge for active session
    const badges = link.querySelectorAll('.toc-session-badge');
    assert.equal(badges.length, 1, 'Must render exactly 1 pinned badge');
    assert.equal(badges[0].textContent, '101A', 'Pinned badge must be the active session');
    assert.ok(badges[0].classList.contains('active'), 'Pinned active session badge must have .active class');

    // Exactly 1 ghost collapsed badge for the 7 other sessions
    const collapsedBtn = link.querySelector('.toc-badge-collapsed');
    assert.ok(collapsedBtn, 'Must render .toc-badge-collapsed button');
    assert.equal(collapsedBtn.textContent, '+7 講 ▾', 'Must display +7 講 ▾');
    assert.equal(collapsedBtn.getAttribute('aria-expanded'), 'false');

    // Click to open popover
    collapsedBtn.click();
    assert.equal(collapsedBtn.getAttribute('aria-expanded'), 'true');

    const popover = document.querySelector('.toc-popover');
    assert.ok(popover, 'Floating popover must exist in DOM after click');
    const sessionItems = popover.querySelectorAll('.popover-session-item');
    assert.equal(sessionItems.length, 8, 'Popover must contain all 8 sessions');

    // Active session item in popover has .active
    const activeItem = popover.querySelector('.popover-session-item.active');
    assert.ok(activeItem, 'Active session item in popover must have .active');
    assert.equal(activeItem.textContent, '101A');

    // Close popover
    tocModule.closeActivePopover();
    assert.equal(document.querySelector('.toc-popover'), null, 'Popover must be removed from DOM after close');
    assert.equal(collapsedBtn.getAttribute('aria-expanded'), 'false');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Pattern 2: Mobile Bottom Sheet Trigger & Seek Dispatch
  // ───────────────────────────────────────────────────────────────────────────
  test('Pattern 2: Mobile Bottom Sheet displays current session outline and dispatches seek callback', () => {
    let seekCalled = null;
    const onSeekTo = (sid, ts) => {
      seekCalled = { sid, ts };
    };

    const mockSections = [
      {
        title: '甲一、總敘義理',
        sessionId: '101A',
        timestamp: 45,
        page: 210,
      },
      {
        title: '甲二、廣釋其義',
        sessionIds: ['101A', '101B'],
        timestamp: 120,
        page: 211,
      },
      {
        title: '乙一、別釋他處',
        sessionId: '102A',
        timestamp: 10,
        page: 215,
      }
    ];

    tocModule.initTOCBottomSheet(mockSections, onSeekTo, '101A');

    // Check button label count: exactly 2 sections belong to 101A
    const drawerBtn = document.getElementById('mobile-toc-drawer-btn');
    assert.equal(drawerBtn.textContent, '📑 本課科判 (2)');

    // Bottom sheet is closed initially
    assert.equal(tocModule.isBottomSheetOpen(), false);

    // Open sheet
    tocModule.openTOCBottomSheet();
    assert.equal(tocModule.isBottomSheetOpen(), true);
    const sheet = document.getElementById('toc-bottom-sheet');
    assert.ok(sheet.classList.contains('open'));

    // Check rendered nodes in sheet
    const items = sheet.querySelectorAll('.sheet-node-item');
    assert.equal(items.length, 2, 'Must render 2 nodes matching 101A');

    // Trigger timestamp seek
    const tsBtn = sheet.querySelector('.sheet-timestamp-btn');
    assert.ok(tsBtn, 'Must have .sheet-timestamp-btn for seekable node');
    tsBtn.click();

    // Verify seek callback was dispatched
    assert.deepEqual(seekCalled, { sid: '101A', ts: 45 });
    // Verify sheet was auto-closed on seek
    assert.equal(tocModule.isBottomSheetOpen(), false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Pattern 3: Touch Ergonomics 44x44px Verification
  // ───────────────────────────────────────────────────────────────────────────
  test('Pattern 3: Touch Ergonomics - seek and close buttons satisfy WCAG 44x44px target', () => {
    // Check .sheet-timestamp-btn in drawer.css
    assert.ok(drawerCss.includes('.sheet-timestamp-btn {'), 'drawer.css must define .sheet-timestamp-btn');
    assert.match(drawerCss, /\.sheet-timestamp-btn\s*\{[^}]*min-width:\s*44px/s, 'Must have min-width: 44px');
    assert.match(drawerCss, /\.sheet-timestamp-btn\s*\{[^}]*min-height:\s*44px/s, 'Must have min-height: 44px');

    // Check .sheet-close-btn in drawer.css
    assert.ok(drawerCss.includes('.sheet-close-btn {'), 'drawer.css must define .sheet-close-btn');
    assert.match(drawerCss, /\.sheet-close-btn\s*\{[^}]*min-width:\s*44px/s, 'Close button must have min-width: 44px');
    assert.match(drawerCss, /\.sheet-close-btn\s*\{[^}]*min-height:\s*44px/s, 'Close button must have min-height: 44px');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Pattern 4: Mobile First-Screen Space Optimization
  // ───────────────────────────────────────────────────────────────────────────
  test('Pattern 4: Mobile First-Screen Space - hides inline accordion and presents drawer trigger', () => {
    // drawer.css must hide #toc-container under mobile breakpoint
    assert.ok(drawerCss.includes('@media (max-width: 768px)'), 'drawer.css must contain mobile media query');
    assert.match(drawerCss, /#toc-container\s*\{[^}]*display:\s*none\s*!important/s, '#toc-container must be hidden on mobile');
    assert.match(drawerCss, /\.mobile-toc-drawer-btn\s*\{[^}]*display:\s*inline-flex/s, '.mobile-toc-drawer-btn must be visible on mobile');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Pattern 5: Keyboard Accessibility & Escape Key Dismissal
  // ───────────────────────────────────────────────────────────────────────────
  test('Pattern 5: Keyboard Accessibility - Escape dismisses bottom sheet and popover', () => {
    // 1. Bottom Sheet Escape
    tocModule.openTOCBottomSheet();
    assert.equal(tocModule.isBottomSheetOpen(), true);

    const escEvent = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escEvent);
    assert.equal(tocModule.isBottomSheetOpen(), false, 'Escape key must close bottom sheet');

    // 2. Popover Escape
    const link = document.createElement('a');
    tocModule.renderSessionBadges(link, ['101A', '101B'], '101A');
    const collapsedBtn = link.querySelector('.toc-badge-collapsed');
    collapsedBtn.click();
    assert.ok(document.querySelector('.toc-popover'), 'Popover should be open');

    document.dispatchEvent(escEvent);
    assert.equal(document.querySelector('.toc-popover'), null, 'Escape key must close popover');
  });
});
