import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COURSE = path.join(ROOT, 'courses/2025釋量論第二品大組共學');
const CANDIDATE = path.join(ROOT, 'reviews/evidence/study-group-source-20260912/question_mapping_candidate.json');

test('source-question mapping is complete, grounded, and remains candidate-only', () => {
  const candidate = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8'));
  const session = JSON.parse(fs.readFileSync(path.join(COURSE, 'sessions/session_14.json'), 'utf8'));
  const knownIds = new Set(session.discussionQuestions.map((question) => question.id));
  const mappings = candidate.mappings;

  assert.equal(candidate.sourceId, '32-08');
  assert.equal(candidate.sessionId, '14');
  assert.deepEqual(mappings.map((mapping) => mapping.sourceQuestionNo), Array.from({ length: 13 }, (_, i) => i + 1));
  assert.ok(mappings.every((mapping) => mapping.sessionQuestionId === null || knownIds.has(mapping.sessionQuestionId)));
  assert.ok(mappings.filter((mapping) => mapping.sessionQuestionId === null).every((mapping) => mapping.evidence));
  assert.equal(candidate.status, 'candidate');
  assert.equal(candidate.reviewRequired, true);
});
