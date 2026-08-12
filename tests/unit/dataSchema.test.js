import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Verify course.json schema integrity', () => {
  const coursePath = path.join(process.cwd(), 'courses/入中論善顯密意疏/course.json');
  assert.equal(fs.existsSync(coursePath), true, 'course.json should exist');

  const content = JSON.parse(fs.readFileSync(coursePath, 'utf-8'));
  assert.equal(typeof content.courseId, 'string');
  assert.equal(typeof content.title, 'string');
  assert.equal(Array.isArray(content.sessions), true);
  assert.ok(content.sessions.length >= 3);

  // Check 2A / 2B formatting in session metadata
  const session2A = content.sessions.find(s => s.sessionId === '02A');
  assert.ok(session2A);
  assert.equal(session2A.sessionNum, 2);
  assert.equal(session2A.subSession, 'A');
  assert.equal(session2A.periodLabel, '上節');
});

test('Verify toc.json schema integrity', () => {
  const tocPath = path.join(process.cwd(), 'courses/入中論善顯密意疏/toc.json');
  assert.equal(fs.existsSync(tocPath), true, 'toc.json should exist');

  const content = JSON.parse(fs.readFileSync(tocPath, 'utf-8'));
  assert.equal(typeof content.courseId, 'string');
  assert.equal(Array.isArray(content.sections), true);
});

test('Verify session_02A.json schema integrity', () => {
  const sessionPath = path.join(process.cwd(), 'courses/入中論善顯密意疏/sessions/session_02A.json');
  assert.equal(fs.existsSync(sessionPath), true, 'session_02A.json should exist');

  const content = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  assert.equal(content.sessionId, '02A');
  assert.equal(Array.isArray(content.paragraphs), true);
  assert.ok(content.paragraphs[0].sentences.length > 0);
});
