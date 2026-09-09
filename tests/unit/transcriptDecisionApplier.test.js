import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDecisionLedger } from '../../scripts/lib/transcriptDecisionApplier.js';

const session = () => ({
  sessionId: '01',
  paragraphs: [
    { id: 'p_1', start: 1, end: 2, sentences: [{ id: 'sent-1', rawText: '甲', text: '甲', start: 1, end: 2 }] },
    { id: 'p_2', start: 2, end: 3, sentences: [{ id: 'sent-2', rawText: '乙', text: '乙。', start: 2, end: 3 }] },
    { id: 'p_3', start: 3, end: 4, sentences: [{ id: 'sent-3', rawText: '丙', text: '丙。', start: 3, end: 4 }] },
  ],
});
const ledger = (overrides = {}) => ({
  schema: 'transcript-decision-ledger/v1',
  baselineCommit: 'base-1',
  inputManifestSha256: 'manifest-1',
  decisions: [{
    candidateId: 'candidate-1', sessionId: '01', operation: 'MERGE', confidence: 'CONFIRMED',
    targetParagraphId: 'p_1', sourceParagraphId: 'p_2', lastSentenceId: 'sent-1', firstSentenceId: 'sent-2',
  }],
  ...overrides,
});
const options = { expectedBaselineCommit: 'base-1', expectedManifestSha256: 'manifest-1' };

test('applier merges adjacent paragraphs and preserves sentence fields', () => {
  const before = session();
  const result = applyDecisionLedger({ sessions: { '01': before }, ledger: ledger(), ...options });
  assert.deepEqual(result.report, { applied: 1, skipped: 0, blocked: 0, changedSessionIds: ['01'] });
  assert.deepEqual(result.sessions['01'].paragraphs.map(p => p.id), ['p_1', 'p_3']);
  assert.deepEqual(result.sessions['01'].paragraphs[0].sentences, [
    before.paragraphs[0].sentences[0], before.paragraphs[1].sentences[0],
  ]);
  assert.equal(result.sessions['01'].paragraphs[0].end, 3);
  assert.deepEqual(before, session(), 'input must not be mutated');
});

test('same ledger is idempotent after the merge is already present', () => {
  const first = applyDecisionLedger({ sessions: { '01': session() }, ledger: ledger(), ...options });
  const second = applyDecisionLedger({ sessions: first.sessions, ledger: ledger(), ...options });
  assert.equal(second.report.applied, 0);
  assert.equal(second.report.skipped, 1);
  assert.deepEqual(second.sessions, first.sessions);
});

test('heading boundary shifts the trailing sentence and preserves the heading', () => {
  const input = session();
  input.paragraphs[0].sentences.unshift({ id: 'sent-0', rawText: '前句', text: '前句。', start: 0, end: 1 });
  input.paragraphs[0].start = 0;
  input.paragraphs[1].heading = '【科判】一、標題';
  const result = applyDecisionLedger({ sessions: { '01': input }, ledger: ledger(), ...options });
  assert.deepEqual(result.sessions['01'].paragraphs.map(p => p.id), ['p_1', 'p_2', 'p_3']);
  assert.deepEqual(result.sessions['01'].paragraphs[0].sentences.map(s => s.id), ['sent-0']);
  assert.deepEqual(result.sessions['01'].paragraphs[1].sentences.map(s => s.id), ['sent-1', 'sent-2']);
  assert.equal(result.sessions['01'].paragraphs[1].heading, '【科判】一、標題');
  assert.equal(result.sessions['01'].paragraphs[0].end, 1);
  assert.equal(result.sessions['01'].paragraphs[1].start, 1);
});

test('heading boundary removes the source paragraph when its only sentence moves', () => {
  const input = session();
  input.paragraphs[1].heading = '【科判】一、標題';
  const result = applyDecisionLedger({ sessions: { '01': input }, ledger: ledger(), ...options });
  assert.deepEqual(result.sessions['01'].paragraphs.map(p => p.id), ['p_2', 'p_3']);
  assert.deepEqual(result.sessions['01'].paragraphs[0].sentences.map(s => s.id), ['sent-1', 'sent-2']);
  assert.equal(result.sessions['01'].paragraphs[0].heading, '【科判】一、標題');
  assert.equal(result.sessions['01'].paragraphs[0].start, 1);
});

test('stale baseline or manifest blocks before mutation', () => {
  assert.throws(() => applyDecisionLedger({
    sessions: { '01': session() }, ledger: ledger(), ...options, expectedBaselineCommit: 'other',
  }), /baseline commit mismatch/);
  assert.throws(() => applyDecisionLedger({
    sessions: { '01': session() }, ledger: ledger(), ...options, expectedManifestSha256: 'other',
  }), /manifest hash mismatch/);
});

test('non-adjacent merge fails closed without partial changes', () => {
  const bad = ledger({ decisions: [
    ledger().decisions[0],
    { ...ledger().decisions[0], candidateId: 'candidate-2', sourceParagraphId: 'p_3', firstSentenceId: 'sent-3' },
  ] });
  const input = session();
  assert.throws(() => applyDecisionLedger({ sessions: { '01': input }, ledger: bad, ...options }), /not adjacent/);
  assert.deepEqual(input, session());
});
