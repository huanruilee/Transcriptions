import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const COURSE_DIR = path.join(process.cwd(), 'courses/入中論善顯密意疏');
const COURSE_PATH = path.join(COURSE_DIR, 'course.json');
const TOC_PATH = path.join(COURSE_DIR, 'toc.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function numericSessionPart(sessionId) {
  const match = String(sessionId).match(/^(\d{1,3})/);
  return match ? Number(match[1]) : null;
}

function getNodeSessions(node) {
  if (Array.isArray(node.sessionIds) && node.sessionIds.length > 0) return node.sessionIds;
  return node.sessionId ? [node.sessionId] : [];
}

function walkToc(nodes, visit, parents = []) {
  for (const node of nodes || []) {
    visit(node, parents);
    walkToc(node.children, visit, [...parents, node]);
  }
}

async function renderTocForTest(sections, options = {}) {
  const dom = new JSDOM('<div id="toc-container"></div>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

  const modulePath = `../../src/js/toc.js?test=${Date.now()}-${Math.random()}`;
  const { renderTOC } = await import(modulePath);
  renderTOC(sections, () => {}, options);
  return dom.window.document;
}

test('TOC remediation: nested children render inside their parent list item', async () => {
  const document = await renderTocForTest([
    {
      title: 'Parent Section',
      sessionId: '01',
      timestamp: 12,
      children: [
        { title: 'Child Section', sessionId: '01', timestamp: 18 }
      ]
    }
  ]);

  const parentLink = [...document.querySelectorAll('.toc-link')]
    .find(link => link.firstChild.textContent === 'Parent Section');
  assert.ok(parentLink, 'parent link should render');

  const parentLi = parentLink.closest('li');
  const nestedList = parentLi.querySelector(':scope > ul.toc-tree');
  assert.ok(nestedList, 'child TOC list must be nested inside the parent <li>');
  assert.ok(nestedList.textContent.includes('Child Section'), 'nested child should remain under its parent');
});

test('TOC remediation: initial course scope can render only the active session', async () => {
  const toc = readJson(TOC_PATH);
  const document = await renderTocForTest(toc.sections, { activeSessionId: '01', scope: 'course' });
  const links = [...document.querySelectorAll('.toc-link')];

  assert.ok(links.length > 0, 'active session should have visible TOC entries');
  assert.ok(links.length < 60, `course scope should not render the full book outline; got ${links.length} links`);
  assert.equal(
    links.some(link => link.dataset.sessionId === '85B'),
    false,
    'initial 01 course scope should not start from unrelated 85B book-frontmatter nodes'
  );
});

test('TOC remediation: timestamp=0 nodes are pending anchors, not precise seek links', async () => {
  const toc = readJson(TOC_PATH);
  const document = await renderTocForTest(toc.sections, { activeSessionId: '87A', scope: 'course' });
  const zeroTimestampLinks = [...document.querySelectorAll('.toc-link[data-timestamp="0"]')];

  assert.ok(zeroTimestampLinks.length > 0, 'fixture should include pending timestamp nodes');
  for (const link of zeroTimestampLinks) {
    assert.equal(link.getAttribute('aria-disabled'), 'true', `${link.textContent} should be exposed as pending`);
    assert.doesNotMatch(link.getAttribute('href') || '', /-t0(?:\.0)?$/, `${link.textContent} must not advertise precise seek`);
  }
});

test('TOC remediation: broad sessionIds spans must be marked for review', () => {
  const toc = readJson(TOC_PATH);
  const broadNodes = [];

  walkToc(toc.sections, (node, parents) => {
    const numbers = getNodeSessions(node)
      .map(numericSessionPart)
      .filter(Number.isFinite);
    if (numbers.length < 2) return;

    const span = Math.max(...numbers) - Math.min(...numbers);
    const reviewStatus = node.reviewStatus || node.status;
    const isMarkedForReview = reviewStatus === 'needs_review' || node.needsReview === true;
    if (span > 20 && !isMarkedForReview) {
      broadNodes.push(`${parents.map(p => p.title).concat(node.title).join(' > ')} [${getNodeSessions(node).join(', ')}]`);
    }
  });

  assert.deepEqual(broadNodes, [], `broad TOC session spans must be marked needs_review:\n${broadNodes.join('\n')}`);
});

test('TOC remediation: published sessions without TOC anchors require explicit coverage status', () => {
  const course = readJson(COURSE_PATH);
  const toc = readJson(TOC_PATH);
  const covered = new Set();

  walkToc(toc.sections, (node) => {
    if (node.sessionId && typeof node.timestamp === 'number' && node.timestamp > 0) {
      covered.add(node.sessionId);
    }
  });

  const coverage = toc.coverage || {};
  const explicit = new Set([
    ...(coverage.exemptions || []),
    ...(coverage.needsReview || []),
    ...(coverage.missingAnchors || [])
  ]);

  const unaccounted = course.sessions
    .map(session => session.sessionId)
    .filter(sessionId => !covered.has(sessionId) && !explicit.has(sessionId));

  assert.deepEqual(unaccounted, [], `published sessions without precise TOC anchors need explicit coverage status:\n${unaccounted.join(' ')}`);
});


test('TOC remediation M4: toc.json separates book outline from session anchors', () => {
  const toc = readJson(TOC_PATH);

  assert.equal(toc.modelVersion, 'toc-v2');
  assert.equal(Array.isArray(toc.sections), true, 'sections should remain the book outline tree');
  assert.equal(Array.isArray(toc.sessionAnchors), true, 'sessionAnchors should provide playback/navigation anchors');
  assert.ok(toc.sessionAnchors.length >= 390, 'sessionAnchors should cover the generated TOC anchor model');

  for (const anchor of toc.sessionAnchors) {
    assert.equal(typeof anchor.anchorId, 'string', 'anchorId should be stable and explicit');
    assert.equal(typeof anchor.sessionId, 'string', `${anchor.anchorId} should have one primary sessionId`);
    assert.equal(Array.isArray(anchor.sessionIds), false, `${anchor.anchorId} must not carry legacy sessionIds fan-out`);
    assert.equal(typeof anchor.timestamp, 'number', `${anchor.anchorId} should carry timestamp state`);
    assert.equal(Array.isArray(anchor.outlinePath), true, `${anchor.anchorId} should point back to the book outline path`);
    assert.ok(anchor.outlinePath.length > 0, `${anchor.anchorId} should include a non-empty outline path`);
    assert.match(anchor.status, /^(inferred|missing_timestamp|needs_review)$/, `${anchor.anchorId} should carry explicit review status`);
  }
});

test('TOC remediation M4: course scope uses sessionAnchors instead of legacy sessionIds fan-out', async () => {
  const toc = readJson(TOC_PATH);
  const document = await renderTocForTest(toc, { activeSessionId: '01', scope: 'course' });
  const links = [...document.querySelectorAll('.toc-link')];

  assert.ok(links.length > 0, 'session 01 should render from sessionAnchors');
  assert.equal(
    links.every(link => link.dataset.sessionId === '01'),
    true,
    'course-scope anchor links should target only the active session'
  );
  assert.equal(
    [...document.querySelectorAll('.toc-session-badge')].length,
    0,
    'sessionAnchors course scope should not show legacy multi-session fan-out badges'
  );
});

test('TOC remediation M5: review package records web review OK while content flags remain open', () => {
  const reviewPath = path.join(process.cwd(), 'docs/TOC_REVIEW_ACCEPTANCE.md');
  const review = fs.readFileSync(reviewPath, 'utf8');

  assert.match(review, /Acceptance status:\s+WEB_REVIEW_OK_CONTENT_ACCEPTANCE_OPEN/);
  assert.match(review, /Henry web review OK recorded on 2026-08-27/);
  assert.match(review, /Published sessions:\s+198/);
  assert.match(review, /Precise positive TOC anchor sessions:\s+82/);
  assert.match(review, /Broad sessionIds spans needing review:\s+15/);
  assert.match(review, /Pending timestamp nodes:\s+180/);
  assert.match(review, /Coverage needs-review sessions:\s+116/);
  assert.match(review, /domain\/content review flags remain open/i);
});
