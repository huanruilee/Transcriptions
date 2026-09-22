import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  COURSE_DIR,
  buildSentenceIndex,
  canonicalSessionId,
  hashImmutableSentences,
  listDeclaredSessionIds,
  loadAllSessions,
  loadJson,
} from '../helpers/shiliangFixtures.js';
import { selectVerseAnnotations } from '../../src/utils/verseAnnotations.js';

const FIXTURES = path.resolve('tests/fixtures/transcript_web_refactor');

test('shared loader resolves all 32 declared sessions with canonical ids', () => {
  const ids = listDeclaredSessionIds();
  assert.equal(ids.length, 32);
  assert.equal(ids[0], '01');
  assert.equal(ids.at(-1), '32');
  assert.deepEqual(loadAllSessions().map(({ sessionId }) => sessionId), ids);
  assert.equal(canonicalSessionId('1'), '01');
  assert.equal(canonicalSessionId(27), '27');
  assert.ok(COURSE_DIR.endsWith(path.join('courses', '釋量論第二品')));
});

test('sentence index rejects duplicate ids instead of silently overwriting', () => {
  const session = {
    paragraphs: [
      { id: 'p_1', sentences: [{ id: 'sent-1' }] },
      { id: 'p_2', sentences: [{ id: 'sent-1' }] },
    ],
  };
  assert.throws(() => buildSentenceIndex(session), /duplicate sentence id: sent-1/);
});

test('immutable hash ignores published text and JSON field order', () => {
  const before = loadJson(path.join(FIXTURES, 'immutable_before.json'));
  const textEdit = loadJson(path.join(FIXTURES, 'immutable_text_edit.json'));
  assert.equal(hashImmutableSentences(before), hashImmutableSentences(textEdit));
});

test('immutable hash detects raw ASR mutation', () => {
  const before = loadJson(path.join(FIXTURES, 'immutable_before.json'));
  const rawEdit = loadJson(path.join(FIXTURES, 'immutable_raw_edit.json'));
  assert.notEqual(hashImmutableSentences(before), hashImmutableSentences(rawEdit));
});

test('verse selector supports v2 manifests and isolates active session', () => {
  const document = {
    manifests: [
      { sessionId: '01', annotations: [{ sentenceId: 'sent-1' }] },
      { sessionId: '02', annotations: [{ sentenceId: 'sent-2' }] },
    ],
  };
  assert.deepEqual(selectVerseAnnotations(document, '01'), [{ sentenceId: 'sent-1' }]);
  assert.deepEqual(selectVerseAnnotations(document, '03'), []);
});

test('verse selector supports guarded legacy documents', () => {
  const document = { sessionId: '1', annotations: [{ sentenceId: 'sent-1' }] };
  assert.deepEqual(selectVerseAnnotations(document, '01'), [{ sentenceId: 'sent-1' }]);
  assert.deepEqual(selectVerseAnnotations(document, '02'), []);
  assert.deepEqual(selectVerseAnnotations(null, '01'), []);
});
