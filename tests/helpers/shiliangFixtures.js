import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

export const REPO_ROOT = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '..',
  '..',
);
export const COURSE_DIR = path.join(REPO_ROOT, 'courses', '釋量論第二品');
export const IMMUTABLE_SENTENCE_FIELDS = [
  'id',
  'rawText',
  'start',
  'end',
  'sourceSegmentId',
];

const ABSENT_FIELD = Object.freeze({ __fieldState: 'ABSENT' });

export function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function canonicalSessionId(rawId) {
  const value = String(rawId).trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`invalid numeric session id: ${rawId}`);
  }
  return String(Number(value)).padStart(2, '0');
}

export function loadCourse() {
  return loadJson(path.join(COURSE_DIR, 'course.json'));
}

export function listDeclaredSessionIds() {
  return loadCourse().sessions.map(({ sessionId }) => canonicalSessionId(sessionId));
}

export function loadSession(rawId) {
  const sessionId = canonicalSessionId(rawId);
  const filePath = path.join(COURSE_DIR, 'sessions', `session_${sessionId}.json`);
  return { sessionId, filePath, data: loadJson(filePath) };
}

export function loadAllSessions() {
  return listDeclaredSessionIds().map(loadSession);
}

export function flattenSentences(session) {
  return (session.paragraphs || []).flatMap((paragraph) => paragraph.sentences || []);
}

export function buildSentenceIndex(session) {
  const index = new Map();
  for (const paragraph of session.paragraphs || []) {
    for (const sentence of paragraph.sentences || []) {
      if (index.has(sentence.id)) {
        throw new Error(`duplicate sentence id: ${sentence.id}`);
      }
      index.set(sentence.id, { paragraph, sentence });
    }
  }
  return index;
}

export function canonicalImmutableSentences(session) {
  return flattenSentences(session).map((sentence) => Object.fromEntries(
    IMMUTABLE_SENTENCE_FIELDS.map((field) => [
      field,
      Object.prototype.hasOwnProperty.call(sentence, field)
        ? sentence[field]
        : ABSENT_FIELD,
    ]),
  ));
}

export function hashImmutableSentences(session) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalImmutableSentences(session)))
    .digest('hex');
}
