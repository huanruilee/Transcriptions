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

test('newly public official YouTube videos are exposed as pending without publishing empty transcripts', () => {
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
    const entry = course.pendingSessions.find((session) => session.sessionId === item.sessionId);
    assert.ok(entry, `missing course entry ${item.sessionId}`);
    assert.equal(entry.displaySessionId, item.displaySessionId);
    assert.equal(entry.title, item.title);
    assert.equal(entry.mediaType, 'video/youtube');
    assert.equal(entry.youtubeVideoId, item.videoId);
    assert.equal(entry.youtubeUrl, `https://www.youtube.com/watch?v=${item.videoId}`);
    assert.equal(entry.status, 'not-transcribed');

    assert.equal(
      fs.existsSync(path.join(COURSE_DIR, 'sessions', `session_${item.sessionId}.json`)),
      false,
      `pending session ${item.sessionId} must not have a synthetic transcript JSON`,
    );
    assert.equal(course.sessions.some((session) => session.sessionId === item.sessionId), false);
  }
});

test('current playlist inventory records only the still-private item as unavailable', () => {
  const course = readJson('courses/2025釋量論第二品大組共學/course.json');
  assert.deepEqual(course.unavailableSessions, [
    { playlistIndex: 44, videoId: 'C0yhUazs0CU', reason: 'youtube_private' },
  ]);

  const catalog = readJson('courses/catalog.json');
  const entry = catalog.courses.find((item) => item.id === 'shi-liang-lun-study-group-2025');
  assert.equal(entry.totalSessions, 42);
});

test('historical prototype-44 evidence is explicitly remapped to current playlist item 42 by video identity', () => {
  const currentInventory = readJson('reviews/evidence/study-group-2025/playlist_inventory.json');
  const historicalManifest = readJson('reviews/evidence/study-group-2025/prototype-44/run_manifest.json');
  const remap = fs.readFileSync(
    path.join(ROOT, 'reviews/evidence/study-group-2025/playlist_index_remap_2026-09-28.md'),
    'utf8',
  );
  const current = currentInventory.items.find((item) => item.videoId === historicalManifest.videoId);

  assert.equal(historicalManifest.playlistIndex, 44);
  assert.equal(current.playlistIndex, 42);
  assert.match(remap, /historical playlist index \*\*44\*\*/i);
  assert.match(remap, /current playlist index \*\*42\*\*/i);
  assert.match(remap, /`lBOiFeGQblw`/);
  assert.match(remap, /video ID is the stable identity/i);
});

test('reader has an explicit transcript-pending state for video-only sessions', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  assert.match(app, /'not-transcribed':\s*'🎬 影片已上架・逐字稿待製作'/);
  assert.match(app, /currentTranscriptStatus === 'not-transcribed'/);
  assert.match(app, /此影片已上架，逐字稿尚待製作/);
});
