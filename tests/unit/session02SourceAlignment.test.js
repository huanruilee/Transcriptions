import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TARGETS = ['sent-16', 'sent-17', 'sent-147', 'sent-148', 'sent-262', 'sent-263', 'sent-270', 'sent-271', 'sent-380', 'sent-381'];
const LEDGER = 'reviews/evidence/shiliang_32_continuous/session02_alignment_decisions.json';

test('session 02 suspicious windows have source-grounded adjudication before publication', () => {
  assert.ok(fs.existsSync(LEDGER), `${LEDGER} must exist before session 02 timestamp acceptance`);
  const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  assert.equal(ledger.rawAsrSha256, '0e07273c9c628136247a548e642483ba623fd5fe69a36862e51bb4fe88ef8d78');
  const byId = new Map(ledger.entries.map(entry => [entry.sentenceId, entry]));
  assert.deepEqual([...byId.keys()].sort(), [...TARGETS].sort());
  for (const id of TARGETS) {
    const entry = byId.get(id);
    assert.ok(['CONFIRMED', 'UNCERTAIN'].includes(entry.status), `${id} needs an explicit adjudication status`);
    assert.ok(entry.sourceSegmentIds?.length > 0, `${id} needs raw-ASR segment evidence`);
    assert.ok(entry.reason, `${id} needs an adjudication reason`);
    if (entry.status === 'CONFIRMED') {
      assert.equal(typeof entry.proposedStart, 'number');
      assert.equal(typeof entry.proposedEnd, 'number');
      assert.ok(entry.proposedEnd > entry.proposedStart, `${id} proposed range must be valid`);
    }
  }
});
