import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findTimestampViolations,
  normalizeOfficialTranscript,
} from '../../scripts/lib/shiliangAudit.js';

test('official transcript normalization removes form-feed page-number artifacts', () => {
  assert.equal(
    normalizeOfficialTranscript('相同\n\n2\n\n\f的道理'),
    '相同的道理',
  );
});

test('official transcript normalization preserves numbers inside spoken content', () => {
  assert.equal(
    normalizeOfficialTranscript('第 206 個偈頌'),
    '第206個偈頌',
  );
});

test('timestamp audit catches rollback across paragraph boundaries without transcript text', () => {
  const violations = findTimestampViolations([
    { id: 'sent-1', start: 10, end: 12, text: '不應出現在報告' },
    { id: 'sent-2', start: 11, end: 13, text: '也不應出現' },
  ]);
  assert.deepEqual(violations, [{
    type: 'ROLLBACK',
    previousId: 'sent-1',
    sentenceId: 'sent-2',
    previousEnd: 12,
    start: 11,
    delta: -1,
  }]);
  assert.ok(!JSON.stringify(violations).includes('不應'));
});

test('timestamp audit catches non-finite and negative-duration timestamps', () => {
  assert.deepEqual(findTimestampViolations([
    { id: 'sent-1', start: 5, end: 4 },
    { id: 'sent-2', start: Number.NaN, end: 9 },
  ]), [
    { type: 'NEGATIVE_DURATION', sentenceId: 'sent-1', start: 5, end: 4 },
    { type: 'NON_FINITE', sentenceId: 'sent-2', start: Number.NaN, end: 9 },
  ]);
});
