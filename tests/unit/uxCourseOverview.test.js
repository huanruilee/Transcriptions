// UX Course Overview tests (AGY 建議 2026-08-17)
// Verify the P0/P1/P2 UX upgrades are present and correct:
//   P0-1: Header + sidebar course count
//   P0-2: Breadcrumb navigation
//   P0-3: Prev/Next session nav + end-of-session card
//   P1:   Course overview landing page
//   P2:   Sidebar filter
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { renderSidebar } from '../../src/js/sidebar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = readFileSync(path.join(__dirname, '../../src/js/app.js'), 'utf8');
const INDEX_HTML = readFileSync(path.join(__dirname, '../../src/index.html'), 'utf8');
const MAIN_CSS = readFileSync(path.join(__dirname, '../../src/css/main.css'), 'utf8');

// --- P0-1: Header + sidebar course count ---
test('UX P0-1: index.html has header + sidebar course count elements', () => {
  assert.match(INDEX_HTML, /id="header-course-count"/, 'header course count element');
  assert.match(INDEX_HTML, /id="sidebar-course-count"/, 'sidebar course count element');
  assert.match(INDEX_HTML, /全 198 講/, 'default count text');
});

test('UX P0-1: app.js updates course count from courseData', () => {
  assert.match(APP_JS, /headerCount\.textContent = `\(全 \$\{totalSessions\} 講\)`/,
    'header count updated dynamically');
  assert.match(APP_JS, /sidebarCount\.textContent = `\(全 \$\{totalSessions\} 講\)`/,
    'sidebar count updated dynamically');
});

// --- P0-2: Breadcrumb ---
test('UX P0-2: index.html has breadcrumb navigation', () => {
  assert.match(INDEX_HTML, /class="breadcrumb"/, 'breadcrumb nav');
  assert.match(INDEX_HTML, /id="breadcrumb-home"/, 'breadcrumb home link');
  assert.match(INDEX_HTML, /id="breadcrumb-current"/, 'breadcrumb current');
});

test('UX P0-2: app.js updates breadcrumb on session switch', () => {
  assert.match(APP_JS, /function updateBreadcrumb\(session\)/, 'updateBreadcrumb defined');
  assert.match(APP_JS, /updateBreadcrumb\(session\);/, 'updateBreadcrumb called in switchSession');
  assert.match(APP_JS, /第 \$\{session\.sessionId\} 堂/, 'breadcrumb shows session id');
});

// --- P0-3: Prev/Next session nav ---
test('UX P0-3: index.html has prev/next session buttons in player', () => {
  assert.match(INDEX_HTML, /id="prev-session-btn"/, 'prev session button');
  assert.match(INDEX_HTML, /id="next-session-btn"/, 'next session button');
});

test('UX P0-3: app.js implements session navigation', () => {
  assert.match(APP_JS, /function initSessionNav\(\)/, 'initSessionNav defined');
  assert.match(APP_JS, /function navigateSession\(delta\)/, 'navigateSession defined');
  assert.match(APP_JS, /navigateSession\(-1\)/, 'prev calls navigateSession(-1)');
  assert.match(APP_JS, /navigateSession\(1\)/, 'next calls navigateSession(1)');
});

test('UX P0-3: app.js appends end-of-session card', () => {
  assert.match(APP_JS, /function appendEndSessionCard\(sessionData\)/, 'appendEndSessionCard defined');
  assert.match(APP_JS, /本講結束/, 'end-of-session heading');
  assert.match(APP_JS, /進入下一講/, 'next session button text');
  assert.match(APP_JS, /返回 198 講總目錄/, 'back to overview button text');
});

// --- P1: Course overview landing page ---
test('UX P1: index.html has course overview entry button', () => {
  assert.match(INDEX_HTML, /id="course-overview-btn"/, 'course overview button');
  assert.match(INDEX_HTML, /課程總覽/, 'button label');
});

test('UX P1: app.js implements course overview', () => {
  assert.match(APP_JS, /function showCourseOverview\(\)/, 'showCourseOverview defined');
  assert.match(APP_JS, /function hideCourseOverview\(\)/, 'hideCourseOverview defined');
  assert.match(APP_JS, /course-overview-hero/, 'hero section');
  assert.match(APP_JS, /course-overview-grid/, 'session grid');
  assert.match(APP_JS, /course-overview-card/, 'session card');
  assert.match(APP_JS, /continue-learning/, 'continue learning card');
  assert.match(APP_JS, /全部 \$\{total\} 講/, 'grid shows total count');
});

// --- P2: Sidebar filter ---
test('UX P2: index.html has sidebar filter input', () => {
  assert.match(INDEX_HTML, /id="sidebar-filter"/, 'sidebar filter input');
  assert.match(INDEX_HTML, /快速搜尋講次/, 'filter placeholder');
});

test('UX P2: app.js implements sidebar filter', () => {
  assert.match(APP_JS, /function initSidebarFilter\(\)/, 'initSidebarFilter defined');
  assert.match(APP_JS, /function getFilteredSessions\(\)/, 'getFilteredSessions defined');
  assert.match(APP_JS, /sidebarFilterValue/, 'filter state variable');
});

// --- P2: renderSidebar actually renders (real DOM behavior) ---
test('UX P2: renderSidebar renders all sessions when no filter', () => {
  const dom = new JSDOM('<div id="session-list"></div>');
  // renderSidebar uses the global `document`; point it at the jsdom instance
  const origDocument = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const container = dom.window.document.getElementById('session-list');
    const sessions = [
      { sessionId: '01', date: '2016-05-21', pageRange: 'p.63', summary: '歸敬頌' },
      { sessionId: '02A', date: '2016-05-28', pageRange: 'p.63', summary: '中觀次第' },
      { sessionId: '02B', date: '2016-05-28', pageRange: 'p.63', summary: '中觀次第' },
    ];
    renderSidebar(sessions, '01', () => {}, []);
    assert.equal(container.querySelectorAll('.session-item').length, 3, 'all sessions rendered');
  } finally {
    globalThis.document = origDocument;
  }
});

// --- CSS: new styles present ---
test('UX CSS: main.css has styles for new components', () => {
  assert.match(MAIN_CSS, /\.breadcrumb/, 'breadcrumb style');
  assert.match(MAIN_CSS, /\.course-overview/, 'course overview style');
  assert.match(MAIN_CSS, /\.session-nav-btn/, 'session nav button style');
  assert.match(MAIN_CSS, /\.sidebar-filter/, 'sidebar filter style');
  assert.match(MAIN_CSS, /\.end-session-card/, 'end session card style');
  assert.match(MAIN_CSS, /\.continue-learning/, 'continue learning style');
});
