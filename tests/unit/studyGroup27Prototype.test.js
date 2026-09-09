import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COURSE_ID = 'shi-liang-lun-study-group-2025';
const COURSE_PATH = 'courses/2025釋量論第二品大組共學';
const DRIVE_FILE_ID = '1H_w9wP0Gi7zpXKO8NVO95Zvm2Iy5N6Wq';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

test('27下 prototype registers an independent remote-audio course', () => {
  const catalog = readJson('courses/catalog.json');
  const course = catalog.courses.find((item) => item.id === COURSE_ID);

  assert.ok(course, 'study-group course must be registered');
  assert.equal(course.path, COURSE_PATH);
  assert.equal(course.mediaType, 'audio/mp3');
  assert.equal(course.totalSessions, 1);

  const store = fs.readFileSync(path.join(ROOT, 'src/stores/course.ts'), 'utf8');
  assert.match(store, new RegExp(COURSE_ID), 'Vue course selector must expose the prototype');
});

test('27下 prototype uses question TOC and remote Google Drive audio only', () => {
  const course = readJson(`${COURSE_PATH}/course.json`);
  const audioMap = readJson(`${COURSE_PATH}/audio_map.json`);
  const toc = readJson(`${COURSE_PATH}/toc.json`);

  assert.equal(course.courseId, COURSE_ID);
  assert.equal(course.tocMode, 'discussion-questions');
  assert.deepEqual(course.sessions.map((item) => item.sessionId), ['27B']);
  assert.equal(course.sessions[0].status, 'review-ready');
  assert.equal(audioMap['27B'].source, 'google-drive');
  assert.equal(audioMap['27B'].fileId, DRIVE_FILE_ID);
  assert.match(audioMap['27B'].url, /^https:\/\/drive(?:\.usercontent)?\.google\.com\//);
  assert.ok(!audioMap['27B'].url.startsWith('/'), 'audio must not be a local asset');

  assert.equal(toc.tocMode, 'discussion-questions');
  assert.ok(Array.isArray(toc.nodes) && toc.nodes.length > 0, 'question TOC must not be empty');
  for (const node of toc.nodes) {
    assert.equal(node.sessionId, '27B');
    assert.match(node.title, /[？?]$/, 'TOC entries must be actual questions');
    assert.ok(Number.isFinite(node.timestamp) && node.timestamp >= 0);
  }
});

test('27下 transcript is timestamped and every question ends with an unlinked teacher summary', () => {
  const session = readJson(`${COURSE_PATH}/sessions/session_27B.json`);
  assert.equal(session.sessionId, '27B');
  assert.equal(session.transcriptStatus, 'review-ready');
  assert.equal(session.alignmentStatus, 'sampled');
  assert.match(session.audioUrl, new RegExp(DRIVE_FILE_ID));
  assert.ok(Array.isArray(session.paragraphs) && session.paragraphs.length > 0);
  assert.ok(Array.isArray(session.discussionQuestions) && session.discussionQuestions.length > 0);

  const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences || []);
  assert.ok(sentences.length >= 20, 'prototype must contain a substantive transcript');
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    assert.ok(sentence.id && sentence.text.trim(), 'every sentence needs stable id and text');
    assert.ok(Number.isFinite(sentence.start) && Number.isFinite(sentence.end));
    assert.ok(sentence.end > sentence.start, 'sentence interval must be positive');
    if (index > 0) assert.ok(sentence.start >= sentences[index - 1].start, 'timestamps must be monotonic');
  }

  const sentenceIds = new Set(sentences.map((sentence) => sentence.id));
  for (const question of session.discussionQuestions) {
    assert.match(question.displayQuestion, /[？?]$/);
    assert.ok(sentenceIds.has(question.sentenceId), 'question must point to spoken transcript evidence');
    assert.equal(question.status, 'candidate');
    assert.ok(question.teacherTeaching?.startSentenceId);
    assert.ok(question.teacherTeaching?.endSentenceId);
    assert.ok(sentenceIds.has(question.teacherTeaching.startSentenceId));
    assert.ok(sentenceIds.has(question.teacherTeaching.endSentenceId));
    assert.equal(question.teacherSummary?.linkedToAudio, false);
    assert.equal(question.teacherSummary?.status, 'candidate');
    assert.ok(question.teacherSummary.items.length >= 1, 'teacher teaching needs a bullet summary');
    assert.ok(question.teacherSummary.items.every((item) => typeof item === 'string' && item.trim()));
  }
});

test('web reader renders question headings and non-seekable teacher-summary bullets', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  assert.match(app, /discussionQuestions/);
  assert.match(app, /teacher-summary/);
  assert.match(app, /法師開示摘要/);
  assert.match(app, /linkedToAudio/);
});
