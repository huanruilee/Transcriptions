import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COURSE_DIR = path.join(ROOT, 'courses/2025釋量論第二品大組共學');
const CATALOG_PATH = path.join(ROOT, 'courses/catalog.json');
const COURSE_STORE_PATH = path.join(ROOT, 'src/stores/course.ts');
const APP_PATH = path.join(ROOT, 'src/App.vue');
const SOURCE_OUTLINE_PATH = path.join(COURSE_DIR, 'source_outlines/32-08.json');

test('study-group publication exposes every processed playlist entry', () => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const entry = catalog.courses.find((course) => course.id === 'shi-liang-lun-study-group-2025');
  assert.ok(entry, 'study-group course must be registered in the catalog');
  assert.equal(entry.path, 'courses/2025釋量論第二品大組共學');
  assert.equal(entry.totalSessions, 42);

  const course = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'course.json'), 'utf8'));
  assert.equal(course.sessions.length, 42);
  assert.deepEqual(
    course.sessions.map((session) => session.sessionId),
    [...Array.from({ length: 41 }, (_, index) => String(index + 1).padStart(2, '0')), '27B'],
  );

  for (const session of course.sessions) {
    const sessionPath = path.join(COURSE_DIR, 'sessions', `session_${session.sessionId}.json`);
    assert.equal(fs.existsSync(sessionPath), true, `missing published session ${session.sessionId}`);
    const payload = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    assert.equal(payload.sessionId, session.sessionId);
    assert.ok(['candidate', 'review-ready'].includes(payload.transcriptStatus));
    assert.ok(payload.paragraphs.length > 0, `empty transcript ${session.sessionId}`);
    assert.ok(payload.audioUrl || payload.youtubeVideoId, `missing media source ${session.sessionId}`);
    if (session.sessionId !== '27B') {
      const sentences = payload.paragraphs.flatMap((paragraph) => paragraph.sentences);
      assert.ok(sentences.some((sentence) => sentence.reviewNeeded === false), `all sentences incorrectly flagged ${session.sessionId}`);
    }
  }

  assert.equal(course.sessions.find((session) => session.sessionId === '14').displaySessionId, '8上');
  assert.equal(course.sessions.find((session) => session.sessionId === '27').displaySessionId, '14下');
  assert.equal(course.sessions.find((session) => session.sessionId === '27B').displaySessionId, '27下');
});

test('study-group publication records unavailable playlist entries instead of hiding them', () => {
  const course = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'course.json'), 'utf8'));
  assert.deepEqual(course.unavailableSessions, [
    { playlistIndex: 42, reason: 'youtube_unavailable' },
    { playlistIndex: 43, reason: 'youtube_private' },
    { playlistIndex: 44, reason: 'source_audio_silent' },
  ]);
});

test('Vue course selector knows the published study-group course', () => {
  const source = fs.readFileSync(COURSE_STORE_PATH, 'utf8');
  assert.match(source, /shi-liang-lun-study-group-2025/);
  assert.match(source, /2025釋量論第二品大組共學/);
});

test('study-group presentation exposes quote and teacher-summary contracts', () => {
  const app = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(app, /displaySessionId/);
  assert.match(app, /treatise-quote/);
  assert.match(app, /teacher-summary-heading/);

  const session14 = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'sessions/session_14.json'), 'utf8'));
  const summaries = session14.paragraphs.map((paragraph) => paragraph.teacherSummary).filter(Boolean);
  assert.ok(summaries.length > 0, 'session 14 should contain teacher summaries');
  assert.ok(summaries.every((summary) => summary.heading === '法師開示摘要'));
});

test('session 14 source outline is preserved as a separate, traceable index', () => {
  assert.equal(fs.existsSync(SOURCE_OUTLINE_PATH), true, 'source outline artifact must exist');
  const outline = JSON.parse(fs.readFileSync(SOURCE_OUTLINE_PATH, 'utf8'));
  assert.equal(outline.sourceId, '32-08');
  assert.deepEqual(outline.sessionIds, ['14', '15']);
  assert.equal(outline.courseOutline.length, 7);
  assert.equal(outline.discussionOutline.length, 13);
  assert.equal(outline.provenance.type, 'curated-source-outline');
  assert.match(fs.readFileSync(APP_PATH, 'utf8'), /sourceOutline/);
  assert.match(fs.readFileSync(APP_PATH, 'utf8'), /source-outline-questions/);
});

test('session 16 and 17 share the next source outline index', () => {
  const outline = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'source_outlines/32-09.json'), 'utf8'));
  assert.equal(outline.sourceId, '32-09');
  assert.deepEqual(outline.sessionIds, ['16', '17']);
  assert.equal(outline.courseOutline.length, 6);
  assert.equal(outline.discussionOutline.length, 13);
  for (const sessionId of ['16', '17']) {
    const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, `sessions/session_${sessionId}.json`), 'utf8'));
    assert.equal(session.sourceOutlineId, '32-09');
  }
});

test('session 18 and 19 share the 32-10 source outline index', () => {
  const outline = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'source_outlines/32-10.json'), 'utf8'));
  assert.equal(outline.sourceId, '32-10');
  assert.deepEqual(outline.sessionIds, ['18', '19']);
  assert.equal(outline.courseOutline.length, 9);
  assert.equal(outline.discussionOutline.length, 10);
  for (const sessionId of ['18', '19']) {
    const session = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, `sessions/session_${sessionId}.json`), 'utf8'));
    assert.equal(session.sourceOutlineId, '32-10');
  }
});

test('session 20 and 21 share the 32-11 source outline index', () => {
  const outline = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'source_outlines/32-11.json'), 'utf8'));
  assert.equal(outline.sourceId, '32-11');
  assert.deepEqual(outline.sessionIds, ['20', '21']);
  assert.equal(outline.courseOutline.length, 10);
  assert.equal(outline.discussionOutline.length, 13);
  for (const sessionId of ['20', '21']) {
    const session = JSON.parse(fs.readFileSync(COURSE_DIR + `/sessions/session_${sessionId}.json`, 'utf8'));
    assert.equal(session.sourceOutlineId, '32-11');
  }
});

test('session 22 and 23 share the 32-28 source outline index', () => {
  const outline = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'source_outlines/32-28.json'), 'utf8'));
  assert.equal(outline.sourceId, '32-28');
  assert.deepEqual(outline.sessionIds, ['22', '23']);
  assert.equal(outline.discussionOutline.length, 9);
  for (const sessionId of ['22', '23']) {
    const session = JSON.parse(fs.readFileSync(COURSE_DIR + `/sessions/session_${sessionId}.json`, 'utf8'));
    assert.equal(session.sourceOutlineId, '32-28');
  }
});

test('session 24 and 25 share the 32-13 source outline index', () => {
  const outline = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'source_outlines/32-13.json'), 'utf8'));
  assert.equal(outline.sourceId, '32-13');
  assert.deepEqual(outline.sessionIds, ['24', '25']);
  assert.equal(outline.courseOutline.length, 9);
  assert.equal(outline.discussionOutline.length, 14);
  for (const sessionId of ['24', '25']) {
    const session = JSON.parse(fs.readFileSync(COURSE_DIR + `/sessions/session_${sessionId}.json`, 'utf8'));
    assert.equal(session.sourceOutlineId, '32-13');
  }
});

test('session 26 and 27 share the 32-14 source outline index', () => {
  const outline = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'source_outlines/32-14.json'), 'utf8'));
  assert.equal(outline.sourceId, '32-14');
  assert.deepEqual(outline.sessionIds, ['26', '27']);
  assert.equal(outline.courseOutline.length, 5);
  assert.equal(outline.discussionOutline.length, 8);
  for (const sessionId of ['26', '27']) {
    const session = JSON.parse(fs.readFileSync(COURSE_DIR + `/sessions/session_${sessionId}.json`, 'utf8'));
    assert.equal(session.sourceOutlineId, '32-14');
  }
});

test('session 28 and 29 share the 32-15 source outline index', () => {
  const outline = JSON.parse(fs.readFileSync(path.join(COURSE_DIR, 'source_outlines/32-15.json'), 'utf8'));
  assert.equal(outline.sourceId, '32-15');
  assert.deepEqual(outline.sessionIds, ['28', '29']);
  assert.equal(outline.courseOutline.length, 10);
  assert.equal(outline.discussionOutline.length, 12);
  for (const sessionId of ['28', '29']) {
    const session = JSON.parse(fs.readFileSync(COURSE_DIR + `/sessions/session_${sessionId}.json`, 'utf8'));
    assert.equal(session.sourceOutlineId, '32-15');
  }
});
