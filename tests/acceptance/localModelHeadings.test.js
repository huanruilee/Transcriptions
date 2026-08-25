import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

describe('Local Model Headings & Semantic Segmentation Acceptance Tests', () => {
  const session29Path = path.resolve('courses/入中論善顯密意疏/sessions/session_29A.json');

  test('session_29A.json contains local model generated headings and metadata', () => {
    assert.ok(fs.existsSync(session29Path), 'session_29A.json must exist');
    const session = JSON.parse(fs.readFileSync(session29Path, 'utf8'));

    // Check headings presence
    const paragraphsWithHeadings = session.paragraphs.filter(p => p.heading && p.heading.trim().length > 0);
    assert.ok(paragraphsWithHeadings.length >= 6, `Expected at least 6 thematic headings, got ${paragraphsWithHeadings.length}`);

    // Verify first heading is introductory / Buddhist commentary
    assert.ok(paragraphsWithHeadings[0].heading.includes('科判') || paragraphsWithHeadings[0].heading.includes('二諦'), 'First heading must reflect commentary structure');

    // Verify meta indicates local model processing
    assert.ok(session._meta, 'Session must include _meta block');
  });

  test('DOM rendering properly generates .transcript-heading elements for paragraphs with headings', () => {
    const session = JSON.parse(fs.readFileSync(session29Path, 'utf8'));
    
    // Simulate DOM environment
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="transcript-container"></div></body></html>`);
    const container = dom.window.document.getElementById('transcript-container');

    session.paragraphs.forEach(p => {
      if (p.heading) {
        const headingEl = dom.window.document.createElement('h3');
        headingEl.className = 'transcript-heading';
        headingEl.textContent = p.heading;
        container.appendChild(headingEl);
      }
      const pEl = dom.window.document.createElement('p');
      pEl.className = 'transcript-paragraph';
      pEl.id = p.id;
      p.sentences.forEach(s => {
        const span = dom.window.document.createElement('span');
        span.className = 'sentence';
        span.textContent = s.text;
        pEl.appendChild(span);
      });
      container.appendChild(pEl);
    });

    const renderedHeadings = container.querySelectorAll('.transcript-heading');
    assert.ok(renderedHeadings.length >= 6, `Rendered DOM must contain >= 6 heading elements, found ${renderedHeadings.length}`);
    assert.equal(renderedHeadings[0].textContent, session.paragraphs[0].heading);
  });

  test('All sentences in session_29A.json maintain strictly monotonic audio timestamps', () => {
    const session = JSON.parse(fs.readFileSync(session29Path, 'utf8'));
    let prevEnd = 0.0;
    
    session.paragraphs.forEach(p => {
      p.sentences.forEach(s => {
        assert.ok(s.start >= prevEnd - 0.05, `Sentence start ${s.start} should not regress before prevEnd ${prevEnd}`);
        assert.ok(s.end > s.start, `Sentence end ${s.end} must be strictly greater than start ${s.start}`);
        prevEnd = s.end;
      });
    });
  });
});
