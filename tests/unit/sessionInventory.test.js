import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const COURSE_DIR = path.join(process.cwd(), 'courses/入中論善顯密意疏');
const COURSE_PATH = path.join(COURSE_DIR, 'course.json');
const AUDIO_MAP_PATH = path.join(COURSE_DIR, 'audio_map.json');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');

// Independent expected IDs catch omissions from course.json itself.
// Extend this list only from an authoritative course inventory.
const REQUIRED_SESSION_IDS = ['30B'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('session inventory: required sessions are represented across all artifacts', () => {
  const course = readJson(COURSE_PATH);
  const audioMap = readJson(AUDIO_MAP_PATH);
  const indexedIds = new Set(course.sessions.map(session => session.sessionId));
  const missing = [];

  for (const sessionId of REQUIRED_SESSION_IDS) {
    const sessionEntry = course.sessions.find(session => session.sessionId === sessionId);
    const sessionPath = path.join(SESSIONS_DIR, `session_${sessionId}.json`);

    if (!indexedIds.has(sessionId)) missing.push(`${sessionId}:course.json`);
    if (!fs.existsSync(sessionPath)) missing.push(`${sessionId}:session JSON`);
    if (!Object.prototype.hasOwnProperty.call(audioMap, sessionId)) {
      missing.push(`${sessionId}:audio_map.json`);
    }
    if (sessionEntry && typeof sessionEntry.audioUrl !== 'string') {
      missing.push(`${sessionId}:course audioUrl`);
    }
  }

  assert.deepEqual(missing, [],
    'required sessions must not disappear from the published artifact set');
});

test('session inventory: every indexed session has a matching session file', () => {
  const course = readJson(COURSE_PATH);
  const files = new Set(fs.readdirSync(SESSIONS_DIR)
    .filter(file => /^session_.*\.json$/.test(file))
    .map(file => file.replace(/^session_|\.json$/g, '')));
  const missingFiles = course.sessions
    .map(session => session.sessionId)
    .filter(sessionId => !files.has(sessionId));

  assert.deepEqual(missingFiles, [], 'indexed sessions must have session JSON files');
});

test('session inventory: 30B published transcript is non-empty and timestamped', () => {
  const course = readJson(COURSE_PATH);
  const sessionEntry = course.sessions.find(session => session.sessionId === '30B');
  assert.ok(sessionEntry, '30B must be published before content acceptance');

  const sessionPath = path.join(SESSIONS_DIR, 'session_30B.json');
  assert.ok(fs.existsSync(sessionPath), '30B transcript file must exist');
  const session = readJson(sessionPath);
  assert.ok(Array.isArray(session.paragraphs) && session.paragraphs.length > 0,
    '30B transcript must contain paragraphs');

  const sentences = session.paragraphs.flatMap(paragraph => paragraph.sentences || []);
  assert.ok(sentences.length > 0, '30B transcript must contain sentences');
  let previousEnd = 0;
  for (const sentence of sentences) {
    assert.equal(typeof sentence.text, 'string');
    assert.ok(sentence.text.trim().length > 0, '30B sentence text must be non-empty');
    assert.equal(typeof sentence.start, 'number');
    assert.equal(typeof sentence.end, 'number');
    assert.ok(sentence.start >= previousEnd - 0.05, '30B timestamps must be monotonic');
    assert.ok(sentence.end >= sentence.start, '30B sentence end must follow start');
    previousEnd = sentence.end;
  }

  assert.equal(session._meta?.engine, 'whisper-large-v3-turbo',
    '30B must record the accepted ASR engine');
  assert.ok(session._meta?.sourceAudioUrl, '30B must record source audio provenance');
});
