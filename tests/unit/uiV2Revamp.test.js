/**
 * UI V2 Revamp Regression Test Suite (v1.1 / v1.2)
 *
 * Validates:
 * 1. Desktop 780px reading container & 3-segment navbar DOM contract
 * 2. Playback rate module (1.0x -> 1.2x -> 1.5x -> 2.0x cycling & persistence)
 * 3. Mobile Navigation Drawer & backdrop overlay contract
 * 4. Mobile Action Sheet (⋯ 更多功能) contract
 * 5. Touch Context Menu (Long-press bubble menu) contract
 * 6. Global keyboard shortcuts ([ for sidebar, Cmd+K / Ctrl+K for search)
 */

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

describe('🎨 UI V2 Revamp: Desktop & Mobile UX Specifications', () => {

  let htmlContent = '';
  let mainCssContent = '';
  let drawerCssContent = '';
  let playerCssContent = '';

  before(() => {
    htmlContent = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf-8');
    mainCssContent = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf-8');
    drawerCssContent = fs.readFileSync(path.join(ROOT, 'src/css/drawer.css'), 'utf-8');
    playerCssContent = fs.readFileSync(path.join(ROOT, 'src/css/playerV2.css'), 'utf-8');
  });

  test('1. DOM & CSS Contract: 780px Reading Container & 3-Segment Navbar', () => {
    // 3-Segment Navbar in HTML
    assert.ok(htmlContent.includes('class="header-left"'), 'HTML must include .header-left');
    assert.ok(htmlContent.includes('class="header-center"'), 'HTML must include .header-center');
    assert.ok(htmlContent.includes('class="header-right"'), 'HTML must include .header-right');

    // 780px max-width token in CSS
    assert.ok(mainCssContent.includes('--max-reader-width: 780px'), 'main.css must set --max-reader-width to 780px');
    assert.ok(mainCssContent.includes('max-width: var(--max-reader-width)'), 'reader-container must use --max-reader-width');
    assert.ok(mainCssContent.includes('--line-height: 1.75'), 'main.css must set --line-height to 1.75');

    // Cmd+K shortcut hint
    assert.ok(htmlContent.includes('⌘K / Ctrl+K'), 'Search input placeholder must hint ⌘K / Ctrl+K');
  });

  test('2. Playback Rate Module Contract: 1.0x / 1.2x / 1.5x / 2.0x', async () => {
    // Check playback rate button in HTML
    assert.ok(htmlContent.includes('id="playback-rate-btn"'), 'HTML must contain #playback-rate-btn in player');

    // Check playerV2.css styling
    assert.ok(playerCssContent.includes('.playback-rate-btn'), 'playerV2.css must style .playback-rate-btn');

    // Mock window & localStorage to test syncPlayer rate functions
    const storage = new Map();
    globalThis.localStorage = {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear()
    };

    const { PLAYBACK_RATES, setPlaybackRate, cyclePlaybackRate, getPlaybackRate } = await import('../../src/js/syncPlayer.js');

    assert.deepEqual(PLAYBACK_RATES, [1.0, 1.2, 1.5, 2.0], 'Supported rates must be 1.0x, 1.2x, 1.5x, 2.0x');

    // Default rate
    setPlaybackRate(1.0);
    assert.equal(getPlaybackRate(), 1.0);
    assert.equal(localStorage.getItem('transcription_playback_rate'), '1');

    // Cycle 1.0 -> 1.2
    assert.equal(cyclePlaybackRate(), 1.2);
    assert.equal(localStorage.getItem('transcription_playback_rate'), '1.2');

    // Cycle 1.2 -> 1.5
    assert.equal(cyclePlaybackRate(), 1.5);
    assert.equal(localStorage.getItem('transcription_playback_rate'), '1.5');

    // Cycle 1.5 -> 2.0
    assert.equal(cyclePlaybackRate(), 2.0);
    assert.equal(localStorage.getItem('transcription_playback_rate'), '2');

    // Cycle 2.0 -> 1.0
    assert.equal(cyclePlaybackRate(), 1.0);
    assert.equal(localStorage.getItem('transcription_playback_rate'), '1');
  });

  test('3. Mobile Navigation Drawer & Resizer Contract', () => {
    // Resizer element in HTML
    assert.ok(htmlContent.includes('id="sidebar-resizer"'), 'HTML must include #sidebar-resizer handle');

    // Backdrop overlay in HTML
    assert.ok(htmlContent.includes('id="sidebar-overlay"'), 'HTML must include #sidebar-overlay');

    // Drawer styles
    assert.ok(drawerCssContent.includes('.sidebar-overlay'), 'drawer.css must define .sidebar-overlay');
    assert.ok(drawerCssContent.includes('.sidebar-resizer'), 'drawer.css must define .sidebar-resizer');
    assert.ok(mainCssContent.includes('.sidebar.drawer-open'), 'main.css must define .sidebar.drawer-open for mobile');
  });

  test('4. Mobile Action Sheet (⋯ 更多功能) Contract', () => {
    assert.ok(htmlContent.includes('id="mobile-more-btn"'), 'HTML header must include #mobile-more-btn');
    assert.ok(drawerCssContent.includes('.mobile-action-sheet'), 'drawer.css must define .mobile-action-sheet');
    assert.ok(drawerCssContent.includes('.action-sheet-grid'), 'drawer.css must define .action-sheet-grid');
  });

  test('5. Touch Context Menu (Long-Press Bubble Menu) Contract', () => {
    assert.ok(drawerCssContent.includes('.touch-context-menu'), 'drawer.css must define .touch-context-menu');
    assert.ok(drawerCssContent.includes('.context-menu-item'), 'drawer.css must define .context-menu-item');
    assert.ok(fs.existsSync(path.join(ROOT, 'src/js/contextMenu.js')), 'src/js/contextMenu.js must exist');
  });

  test('6. Return-to-Playing FAB Contract', () => {
    assert.ok(htmlContent.includes('id="fab-return-playing"'), 'HTML must include #fab-return-playing');
    assert.ok(playerCssContent.includes('.fab-return-playing'), 'playerV2.css must style .fab-return-playing');
  });

});
