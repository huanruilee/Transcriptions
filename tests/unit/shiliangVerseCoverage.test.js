import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { selectVerseAnnotations } from '../../src/utils/verseAnnotations.js';

// Contract for 釋量論第二品 verse annotation coverage across all 32 sessions.
// Source of truth: verse_annotations.json manifest + session JSON sentence ids.
// The manifest is source-grounded; sessions without exact source matches remain explicitly UNVERIFIED.

const COURSE_DIR = path.join(process.cwd(), 'courses/釋量論第二品');
const COURSE_PATH = path.join(COURSE_DIR, 'course.json');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const ANNOTATIONS_PATH = path.join(COURSE_DIR, 'verse_annotations.json');
const EXPECTED_SESSION_COUNT = 32;
const ALLOWED_STATUSES = new Set(['source_match', 'partial_match', 'UNVERIFIED']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// "01", "27", 27 -> "1" style canonical id so manifest/session agree.
function canonicalSessionId(rawId) {
  return String(rawId).trim().replace(/^0+(?=\d)/, '');
}

function loadSessionSentenceIds(sessionId) {
  const padded = String(sessionId).padStart(2, '0');
  const sessionPath = path.join(SESSIONS_DIR, `session_${padded}.json`);
  if (!fs.existsSync(sessionPath)) return null;
  const session = readJson(sessionPath);
  const sentences = (session.paragraphs || []).flatMap(p => p.sentences || []);
  return new Set(sentences.map(s => s.id));
}

test('contract: course declares exactly 32 sessions', () => {
  const course = readJson(COURSE_PATH);
  assert.equal(course.sessions.length, EXPECTED_SESSION_COUNT,
    'course.json must declare all 32 sessions');
});

test('contract: every one of the 32 sessions has an annotation manifest entry with sessionId', () => {
  const course = readJson(COURSE_PATH);
  const annotationsDoc = readJson(ANNOTATIONS_PATH);

  // Manifest shape expected by this contract:
  //   { manifests: [ { sessionId, annotations: [...] }, ... ] }
  // A single top-level sessionId (legacy v1 shape) covers exactly one session.
  const manifests = Array.isArray(annotationsDoc.manifests)
    ? annotationsDoc.manifests
    : (annotationsDoc.sessionId
        ? [{ sessionId: annotationsDoc.sessionId, annotations: annotationsDoc.annotations || [] }]
        : []);

  const declaredIds = course.sessions.map(s => canonicalSessionId(s.sessionId));
  assert.equal(declaredIds.length, EXPECTED_SESSION_COUNT);

  const manifestIds = new Set(manifests.map(m => canonicalSessionId(m.sessionId)));
  const missing = declaredIds.filter(id => !manifestIds.has(id));
  assert.deepEqual(missing, [],
    `every declared session must have an annotation manifest entry with its own sessionId (missing: ${missing.join(', ')})`);
});

test('contract: every annotation has sentenceId, quoteText and an allowed status', () => {
  const course = readJson(COURSE_PATH);
  const annotationsDoc = readJson(ANNOTATIONS_PATH);
  const manifests = Array.isArray(annotationsDoc.manifests)
    ? annotationsDoc.manifests
    : (annotationsDoc.sessionId
        ? [{ sessionId: annotationsDoc.sessionId, annotations: annotationsDoc.annotations || [] }]
        : []);

  const failures = [];
  for (const manifest of manifests) {
    const sid = canonicalSessionId(manifest.sessionId);
    for (const [i, ann] of (manifest.annotations || []).entries()) {
      if (typeof ann.sentenceId !== 'string' || ann.sentenceId.trim() === '') {
        failures.push(`session ${sid} annotation[${i}]: missing sentenceId`);
      }
      if (typeof ann.quoteText !== 'string' || ann.quoteText.trim() === '') {
        failures.push(`session ${sid} annotation[${i}]: missing quoteText`);
      }
      if (typeof ann.status !== 'string' || !ALLOWED_STATUSES.has(ann.status)) {
        failures.push(`session ${sid} annotation[${i}]: status "${ann.status}" not in {source_match, partial_match, UNVERIFIED}`);
      }
    }
  }
  assert.deepEqual(failures, [], 'all annotations must carry sentenceId, quoteText and an allowed status');
});

test('contract: every annotation sentenceId exists in its session transcript', () => {
  const annotationsDoc = readJson(ANNOTATIONS_PATH);
  const manifests = Array.isArray(annotationsDoc.manifests)
    ? annotationsDoc.manifests
    : (annotationsDoc.sessionId
        ? [{ sessionId: annotationsDoc.sessionId, annotations: annotationsDoc.annotations || [] }]
        : []);

  const failures = [];
  for (const manifest of manifests) {
    const sid = canonicalSessionId(manifest.sessionId);
    const sentenceIds = loadSessionSentenceIds(sid);
    if (!sentenceIds) {
      failures.push(`session ${sid}: session JSON file not found`);
      continue;
    }
    for (const ann of manifest.annotations || []) {
      if (typeof ann.sentenceId === 'string' && !sentenceIds.has(ann.sentenceId)) {
        failures.push(`session ${sid}: sentenceId "${ann.sentenceId}" not present in session_${String(sid).padStart(2, '0')}.json`);
      }
    }
  }
  assert.deepEqual(failures, [], 'annotation sentenceIds must resolve against the session transcript');
});

test('contract: frontend selects the current v2 manifest and preserves v1 fallback', () => {
  const v2 = {
    manifests: [
      { sessionId: '01', annotations: [{ sentenceId: 'sent-1' }] },
      { sessionId: '02', annotations: [{ sentenceId: 'sent-2' }] },
    ],
  };
  const legacy = { sessionId: '1', annotations: [{ sentenceId: 'sent-1' }] };

  assert.deepEqual(selectVerseAnnotations(v2, '01'), [{ sentenceId: 'sent-1' }]);
  assert.deepEqual(selectVerseAnnotations(v2, '03'), []);
  assert.deepEqual(selectVerseAnnotations(legacy, '01'), [{ sentenceId: 'sent-1' }]);
  assert.deepEqual(selectVerseAnnotations(legacy, '02'), []);
});
