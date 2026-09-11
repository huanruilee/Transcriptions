import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COURSE_DIR = path.join(ROOT, 'courses/2025釋量論第二品大組共學');
const CATALOG_PATH = path.join(ROOT, 'courses/catalog.json');
const COURSE_STORE_PATH = path.join(ROOT, 'src/stores/course.ts');

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
