import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST_PATH = path.join(ROOT, 'reviews/evidence/study-group-2025/sample_manifest.json');
const INVENTORY_PATH = path.join(ROOT, 'reviews/evidence/study-group-2025/playlist_inventory.json');
const COURSE_PATH = path.join(ROOT, 'courses/2025釋量論第二品大組共學/course.json');
const ROLES = ['opening', 'middle', 'ending', 'question', 'teacher-summary'];

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha256Text = (text) => crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

function loadManifest() {
  assert.equal(fs.existsSync(MANIFEST_PATH), true, 'sample manifest is missing: run scripts/build_study_group_sample_manifest.py to generate reviews/evidence/study-group-2025/sample_manifest.json');
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function forbiddenTextKeys(node, trail, found) {
  if (Array.isArray(node)) {
    node.forEach((value, index) => forbiddenTextKeys(value, `${trail}[${index}]`, found));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'text' || key === 'rawText') found.push(`${trail}.${key}`);
      forbiddenTextKeys(value, `${trail}.${key}`, found);
    }
  }
  return found;
}

test('sample manifest exists with runner and baseline identity', () => {
  const manifest = loadManifest();
  assert.equal(manifest.schema, 'study-group-sample-manifest/v1');
  assert.equal(typeof manifest.generatedBy.runner, 'string');
  assert.match(manifest.generatedBy.runner, /build_study_group_sample_manifest\.py$/);
  assert.match(manifest.generatedBy.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.baseline.commit, /^[0-9a-f]{40}$/);
  assert.equal(typeof manifest.baseline.ref, 'string');
  assert.ok(manifest.baseline.ref.length > 0);
});

test('sample manifest covers exactly the 42 playable candidate sessions', () => {
  const manifest = loadManifest();
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  const playable = inventory.items.filter((item) => item.playable);
  assert.equal(playable.length, 42);
  assert.equal(manifest.scope.candidateCount, 42);
  assert.equal(manifest.sessions.length, 42);
  assert.deepEqual(
    manifest.sessions.map((session) => session.videoId),
    playable.map((item) => item.videoId),
    'manifest sessions must follow playable playlist order',
  );
  assert.deepEqual(
    manifest.sessions.map((session) => session.playlistIndex),
    playable.map((item) => item.playlistIndex),
  );
  const excluded = inventory.items.filter((item) => !item.playable).map((item) => item.videoId);
  assert.deepEqual(manifest.scope.excludedVideoIds, excluded);
  for (const videoId of excluded) {
    assert.equal(manifest.sessions.some((session) => session.videoId === videoId), false);
  }
});

test('sample manifest session identity comes from course data with no duplicate ids', () => {
  const manifest = loadManifest();
  const course = JSON.parse(fs.readFileSync(COURSE_PATH, 'utf8'));
  const courseByVideo = new Map(
    course.sessions.filter((session) => session.youtubeVideoId).map((session) => [session.youtubeVideoId, session]),
  );
  assert.equal(new Set(manifest.sessions.map((session) => session.sessionId)).size, 42);
  assert.equal(new Set(manifest.sessions.map((session) => session.videoId)).size, 42);
  for (const session of manifest.sessions) {
    const source = courseByVideo.get(session.videoId);
    assert.ok(source, `video ${session.videoId} must come from course data`);
    assert.equal(session.sessionId, source.sessionId);
    assert.equal(session.displaySessionId, source.displaySessionId);
  }
  assert.equal(manifest.sessions.some((session) => session.sessionId === '27B'), false);
  assert.deepEqual(manifest.retainedSeparately.map((entry) => entry.sessionId), ['27B']);
  assert.match(manifest.retainedSeparately[0].reason, /playlist|playable/i);
});

test('every sample manifest session carries exactly five valid roles grounded in content review', () => {
  const manifest = loadManifest();
  const contentReviewCache = new Map();
  const loadContentReview = (relPath) => {
    if (!contentReviewCache.has(relPath)) {
      const abs = path.join(ROOT, relPath);
      assert.equal(fs.existsSync(abs), true, `content review artifact missing: ${relPath}`);
      contentReviewCache.set(relPath, JSON.parse(fs.readFileSync(abs, 'utf8')));
    }
    return contentReviewCache.get(relPath);
  };
  for (const session of manifest.sessions) {
    assert.deepEqual(Object.keys(session.roles).sort(), [...ROLES].sort(), `session ${session.sessionId} roles`);
    const artifactByRole = {};
    for (const role of ROLES) {
      const entry = session.roles[role];
      assert.equal(entry.sessionId, session.sessionId);
      assert.equal(entry.videoId, session.videoId);
      assert.match(entry.segmentId, /^seg-\d{4,}$/);
      assert.equal(typeof entry.start, 'number');
      assert.equal(typeof entry.end, 'number');
      assert.ok(entry.start >= 0, `session ${session.sessionId} ${role}: negative start`);
      assert.ok(entry.end > entry.start, `session ${session.sessionId} ${role}: end must exceed start`);
      assert.match(entry.publishedTextSha256, /^[0-9a-f]{64}$/);
      assert.match(entry.artifacts.contentReviewPath, /^reviews\/evidence\/study-group-2025\/playlist-\d{2}\/content_review\.json$/);
      assert.match(entry.artifacts.contentReviewSha256, /^[0-9a-f]{64}$/);
      assert.match(entry.artifacts.rawAsrPath, /^reviews\/evidence\/study-group-2025\/playlist-\d{2}\/raw_asr\.json$/);
      assert.match(entry.artifacts.rawAsrSha256, /^[0-9a-f]{64}$/);
      assert.equal(sha256File(path.join(ROOT, entry.artifacts.contentReviewPath)), entry.artifacts.contentReviewSha256, `content review hash for ${session.sessionId}/${role}`);
      assert.equal(sha256File(path.join(ROOT, entry.artifacts.rawAsrPath)), entry.artifacts.rawAsrSha256, `raw ASR hash for ${session.sessionId}/${role}`);
      const review = loadContentReview(entry.artifacts.contentReviewPath);
      assert.equal(review.source.videoId, session.videoId);
      const segment = review.segments.find((item) => item.id === entry.segmentId);
      assert.ok(segment, `segment ${entry.segmentId} must resolve in ${entry.artifacts.contentReviewPath}`);
      assert.equal(segment.start, entry.start, `start mismatch ${session.sessionId}/${role}`);
      assert.equal(segment.end, entry.end, `end mismatch ${session.sessionId}/${role}`);
      assert.ok(segment.text.length > 0);
      assert.equal(sha256Text(segment.text), entry.publishedTextSha256, `published text hash mismatch ${session.sessionId}/${role}`);
      artifactByRole[role] = review;
    }
    const review = artifactByRole.opening;
    const segmentIndex = (id) => Number(id.slice(4));
    assert.equal(session.roles.opening.segmentId, review.segments[0].id, `opening must be first segment of session ${session.sessionId}`);
    assert.equal(session.roles.ending.segmentId, review.segments.at(-1).id, `ending must be last segment of session ${session.sessionId}`);
    assert.ok(
      segmentIndex(session.roles.opening.segmentId) < segmentIndex(session.roles.middle.segmentId)
        && segmentIndex(session.roles.middle.segmentId) < segmentIndex(session.roles.ending.segmentId),
      `middle must sit between opening and ending for session ${session.sessionId}`,
    );
    const questionSegments = new Set(review.questionIndex.flatMap((question) => question.sourceSegmentIds));
    assert.equal(questionSegments.has(session.roles.question.segmentId), true, `question role must cite a questionIndex segment for session ${session.sessionId}`);
    const summarySegments = new Set(review.teacherSummaries.flatMap((summary) => summary.sourceSegmentIds));
    assert.equal(summarySegments.has(session.roles['teacher-summary'].segmentId), true, `teacher-summary role must cite a teacherSummaries segment for session ${session.sessionId}`);
    assert.equal(questionSegments.has(session.roles['teacher-summary'].segmentId), false);
  }
});

test('sample manifest is hash-only: no text or rawText fields anywhere', () => {
  const manifest = loadManifest();
  assert.deepEqual(forbiddenTextKeys(manifest, '$', []), []);
});
