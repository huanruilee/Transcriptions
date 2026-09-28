import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COURSE_DIR = path.join(ROOT, 'courses/2025釋量論第二品大組共學');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

test('newly public official YouTube videos are exposed without inventing transcripts', () => {
  const course = readJson('courses/2025釋量論第二品大組共學/course.json');
  const expected = [
    {
      sessionId: '42',
      displaySessionId: '26下',
      videoId: 'lBOiFeGQblw',
      title: '第26講 集諦與滅諦的行相（下）｜2025《釋量論・第二品》大組共學',
    },
    {
      sessionId: '43',
      displaySessionId: '27上',
      videoId: '8sDCFUj5E_c',
      title: '第27講 空與無我的差異（上）｜2025《釋量論・第二品》大組共學',
    },
  ];

  for (const item of expected) {
    const entry = course.sessions.find((session) => session.sessionId === item.sessionId);
    assert.ok(entry, `missing course entry ${item.sessionId}`);
    assert.equal(entry.displaySessionId, item.displaySessionId);
    assert.equal(entry.title, item.title);
    assert.equal(entry.mediaType, 'video/youtube');
    assert.equal(entry.youtubeVideoId, item.videoId);
    assert.equal(entry.youtubeUrl, `https://www.youtube.com/watch?v=${item.videoId}`);
    assert.equal(entry.status, 'not-transcribed');

    const session = JSON.parse(
      fs.readFileSync(path.join(COURSE_DIR, 'sessions', `session_${item.sessionId}.json`), 'utf8'),
    );
    assert.equal(session.youtubeVideoId, item.videoId);
    assert.equal(session.transcriptStatus, 'not-transcribed');
    assert.deepEqual(session.paragraphs, []);
    assert.deepEqual(session.discussionQuestions, []);
  }
});

test('current playlist inventory records only the still-private item as unavailable', () => {
  const course = readJson('courses/2025釋量論第二品大組共學/course.json');
  assert.deepEqual(course.unavailableSessions, [
    { playlistIndex: 44, videoId: 'C0yhUazs0CU', reason: 'youtube_private' },
  ]);

  const catalog = readJson('courses/catalog.json');
  const entry = catalog.courses.find((item) => item.id === 'shi-liang-lun-study-group-2025');
  assert.equal(entry.totalSessions, 44);
});

test('reader has an explicit transcript-pending state for video-only sessions', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  assert.match(app, /'not-transcribed':\s*'🎬 影片已上架・逐字稿待製作'/);
  assert.match(app, /currentTranscriptStatus === 'not-transcribed'/);
  assert.match(app, /此影片已上架，逐字稿尚待製作/);
});
