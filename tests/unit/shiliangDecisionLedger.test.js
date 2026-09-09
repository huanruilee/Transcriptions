import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { validateDecisionLedger } from '../../scripts/lib/shiliangAudit.js';

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
