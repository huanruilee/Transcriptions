import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COURSE_DIR = path.join(ROOT, 'courses/四念住');
const COURSE_PATH = path.join(COURSE_DIR, 'course.json');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const SESSION_IDS = Array.from({ length: 8 }, (_, i) => 'session_' + String(i + 1).padStart(2, '0'));
const RELEASE_MODE = process.env.REQUIRE_SINIANZHU_RELEASE === '1';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadSessions() {
  return SESSION_IDS.map((id) => ({
    id,
    file: path.join(SESSIONS_DIR, id + '.json'),
    data: readJson(path.join(SESSIONS_DIR, id + '.json')),
  }));
}

test('四念住 candidate inventory keeps session identity and candidate provenance explicit', () => {
  const course = readJson(COURSE_PATH);
  assert.equal(course.courseId, 'si-nian-zhu');
  assert.equal(course.totalSessions, 8);
  assert.equal(course.publicationState, 'candidate-review-required');

  for (const { id, data } of loadSessions()) {
    assert.equal(data.sessionId, id, id + ' sessionId must match its filename');
    assert.equal(data.publicationState, 'candidate-review-required',
      id + ' must remain candidate-review-required until release gates pass');
    assert.equal(data.audioAvailable, false,
      id + ' must not claim audio availability while source audio is absent');
    assert.match(data.candidatePath, new RegExp('sessions/' + id + '/candidate\\.json$'));
    assert.ok(data._meta?.candidateReviewRequired, id + ' must retain review-required provenance');
  }
});

test('四念住 release gate: every session has a stable playable audio source', { skip: !RELEASE_MODE }, () => {
  const failures = [];
  for (const { id, data } of loadSessions()) {
    const playable = data.audioAvailable === true
      && typeof data.audioUrl === 'string'
      && new RegExp('^(audio/[-\\w]+\\.mp3|https?://.+\\.mp3)$', 'i').test(data.audioUrl)
      && data._meta?.audioDeleted !== true;
    if (!playable) failures.push(id + ': missing stable playable audioUrl/provenance');
  }
  assert.deepEqual(failures, [], 'Audio release blockers:\\n' + failures.join('\\n'));
});

test('四念住 release gate: semantic review is complete and structure is usable', { skip: !RELEASE_MODE }, () => {
  const failures = [];
  for (const { id, data } of loadSessions()) {
    const headings = data.paragraphs.filter((p) => typeof p.heading === 'string' && p.heading.trim());
    const pending = data.paragraphs.flatMap((p) => p.sentences || [])
      .filter((s) => s.reviewNeeded === true);
    if (data.publicationState !== 'published') failures.push(id + ': publicationState=' + data.publicationState);
    if (headings.length < 6) failures.push(id + ': only ' + headings.length + ' headings; minimum is 6');
    if (pending.length > 0) failures.push(id + ': ' + pending.length + ' sentences still require review');
  }
  assert.deepEqual(failures, [], 'Semantic release blockers:\\n' + failures.join('\\n'));
});
