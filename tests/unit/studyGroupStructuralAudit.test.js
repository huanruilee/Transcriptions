import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COURSE_DIR = path.join(ROOT, 'courses/2025釋量論第二品大組共學');
const COURSE_PATH = path.join(COURSE_DIR, 'course.json');

test('all study-group sessions satisfy structural transcript contracts', () => {
  const course = JSON.parse(fs.readFileSync(COURSE_PATH, 'utf8'));
  const intentionallyUnbound = new Set(['34', '27B']);

  assert.equal(course.sessions.length, 42);
  for (const entry of course.sessions) {
    const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions', `session_${entry.sessionId}.json`), 'utf8'));
    const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences);
    assert.ok(session.audioUrl || session.youtubeVideoId, `missing media ${entry.sessionId}`);
    assert.ok(sentences.length > 0, `empty transcript ${entry.sessionId}`);
    for (const sentence of sentences) {
      assert.equal(typeof sentence.start, 'number', `missing start ${entry.sessionId}/${sentence.id}`);
      assert.equal(typeof sentence.end, 'number', `missing end ${entry.sessionId}/${sentence.id}`);
      assert.ok(sentence.end > sentence.start, `invalid range ${entry.sessionId}/${sentence.id}`);
    }
    assert.ok(session.discussionQuestions.length > 0, `missing questions ${entry.sessionId}`);
    assert.ok(session.paragraphs.some((paragraph) => paragraph.teacherSummary), `missing teacher summary ${entry.sessionId}`);
    const sourceOutlineId = session.sourceOutlineId ?? null;
    if (sourceOutlineId === null) {
      assert.equal(intentionallyUnbound.has(entry.sessionId), true, `unexpected unbound source ${entry.sessionId}`);
    } else {
      assert.equal(typeof sourceOutlineId, 'string');
    }
  }
});

test('question and teacher-summary counts are not treated as the same data layer', () => {
  const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions/session_24.json'), 'utf8'));
  const summaryCount = session.paragraphs.filter((paragraph) => paragraph.teacherSummary).length;
  assert.notEqual(session.discussionQuestions.length, summaryCount);
  assert.ok(summaryCount > 0);
});
