import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  resolveBoundedTimestampGaps,
  validateDecisionLedger,
} from '../../scripts/lib/shiliangAudit.js';

test('session 28 adjudication ledger covers the requested range exactly once', () => {
  const ledger = JSON.parse(fs.readFileSync(
    'reviews/evidence/shiliang_32_continuous/B7/pilot28/decision_ledger.json',
    'utf8',
  ));
  const result = validateDecisionLedger(ledger, { first: 160, last: 197 });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.counts, { total: 38, confirmed: 6, likely: 0, uncertain: 32 });
  assert.equal(result.canAutoApply, false);
});

test('ledger validator rejects duplicate IDs and unsupported auto-apply', () => {
  const ledger = {
    minimumWindow: { first: 'sent-1', last: 'sent-2' },
    decisions: [
      { sentenceId: 'sent-1', confidence: 'CONFIRMED' },
      { sentenceId: 'sent-1', confidence: 'CONFIRMED' },
    ],
  };
  const result = validateDecisionLedger(ledger, { first: 1, last: 2 });
  assert.ok(result.errors.includes('duplicate sentenceId: sent-1'));
  assert.ok(result.errors.includes('missing sentenceId: sent-2'));
  assert.equal(result.canAutoApply, false);
});

test('session 28 boundary table resolves only three fully bounded raw gaps', () => {
  const table = JSON.parse(fs.readFileSync(
    'reviews/evidence/shiliang_32_continuous/B7/pilot28/boundary_table.json',
    'utf8',
  ));
  const resolved = resolveBoundedTimestampGaps(table.entries, [
    { sentenceId: 'sent-159', rawSegmentStartId: 825, rawSegmentEndId: 833, start: 1872.49, end: 1889.08 },
    { sentenceId: 'sent-167', rawSegmentStartId: 869, rawSegmentEndId: 876, start: 1956.39, end: 1975.61 },
    { sentenceId: 'sent-194', rawSegmentStartId: 1028, rawSegmentEndId: 1035, start: 2247.14, end: 2258.83 },
  ]);
  assert.equal(resolved.filter(x => x.confidence === 'BOUNDED_CONFIRMED').length, 3);
  assert.equal(resolved.filter(x => x.proposedStart === null).length, 0);
  for (let index = 1; index < resolved.length; index += 1) {
    assert.ok(resolved[index].proposedStart >= resolved[index - 1].proposedEnd);
  }
});

test('bounded-gap resolver rejects a range that does not meet adjacent anchors', () => {
  const entries = [
    { sentenceId: 'sent-1', proposedStart: 1, proposedEnd: 2, confidence: 'CONFIRMED' },
    { sentenceId: 'sent-2', proposedStart: null, proposedEnd: null, confidence: 'UNCERTAIN' },
    { sentenceId: 'sent-3', proposedStart: 4, proposedEnd: 5, confidence: 'CONFIRMED' },
  ];
  assert.throws(() => resolveBoundedTimestampGaps(entries, [
    { sentenceId: 'sent-2', rawSegmentStartId: 2, rawSegmentEndId: 3, start: 2.1, end: 4 },
  ]), /left anchor/);
});
