import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyDeterministicStyleRules,
  buildProofreadingLedger,
  computeSourceDigest,
  checkpointMatchesRun,
  discoverTranscriptSessions,
  parseModelReview,
  applyModelReview,
  buildValidatedModelCandidate,
  mergeModelReviews,
  normalizeBatchReview,
  normalizeProposalVerification,
  parseProposalVerification,
  listTranscriptSentences,
  selectStratifiedPilot,
  computeRuntimeFingerprint,
  validateProofreadingCandidate,
  validateSavedBatch,
} from '../../scripts/lib/transcriptProofreadingPipeline.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SOURCE = JSON.parse(readFileSync(
  path.join(ROOT, 'tests/fixtures/transcript-proofreading/source.json'),
  'utf8',
));

function clone(value) {
  return structuredClone(value);
}

function candidateWithText(sentenceId, text) {
  const candidate = clone(SOURCE);
  const sentence = candidate.paragraphs
    .flatMap((paragraph) => paragraph.sentences)
    .find((item) => item.id === sentenceId);
  sentence.text = text;
  return candidate;
}

test('deterministic style rules only apply unambiguous Taiwan editorial fixes', () => {
  const result = applyDeterministicStyleRules('我們先説明......再討論做與作、的地得。');

  assert.equal(result.text, '我們先說明……再討論做與作、的地得。');
  assert.deepEqual(result.changes.map((change) => change.ruleId), [
    'TW-ORTH-001',
    'TW-PUNCT-001',
  ]);
  assert.equal(result.text.includes('做與作'), true, 'ambiguous 做／作 must not be replaced blindly');
  assert.equal(result.text.includes('的地得'), true, 'ambiguous 的／地／得 must not be replaced blindly');
});

test('candidate validation preserves IDs, ordering, timestamps, speaker, and source digest', () => {
  const candidate = candidateWithText('seg-001', '我們先說學習的態度……');
  const ledger = buildProofreadingLedger({
    source: SOURCE,
    candidate,
    model: { provider: 'deterministic', model: 'style-rules-v1' },
    proposals: [{
      sentenceId: 'seg-001',
      changeClass: 'orthography',
      reason: '臺灣正體與省略號格式統一',
      evidence: ['style-rule:TW-ORTH-001', 'style-rule:TW-PUNCT-001'],
      confidence: 1,
      reviewRequired: false,
    }],
  });

  assert.equal(ledger.sourceDigest, computeSourceDigest(SOURCE));
  assert.deepEqual(validateProofreadingCandidate({ source: SOURCE, candidate, ledger }), {
    valid: true,
    errors: [],
  });

  const changedTime = clone(candidate);
  changedTime.paragraphs[0].sentences[0].start = 0.1;
  assert.equal(validateProofreadingCandidate({ source: SOURCE, candidate: changedTime, ledger }).valid, false);

  const changedSpeaker = clone(candidate);
  changedSpeaker.speaker = '另一位講者';
  assert.equal(validateProofreadingCandidate({ source: SOURCE, candidate: changedSpeaker, ledger }).valid, false);

  const droppedSentence = clone(candidate);
  droppedSentence.paragraphs[0].sentences.pop();
  assert.equal(validateProofreadingCandidate({ source: SOURCE, candidate: droppedSentence, ledger }).valid, false);
});

test('every changed sentence requires an exact, evidenced ledger entry', () => {
  const candidate = candidateWithText('seg-001', '我們先說學習的態度……');
  const noEntries = {
    schema: 'transcript-proofreading-ledger/v1',
    sourceDigest: computeSourceDigest(SOURCE),
    entries: [],
  };
  const missing = validateProofreadingCandidate({ source: SOURCE, candidate, ledger: noEntries });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((error) => error.code === 'MISSING_LEDGER_ENTRY'));

  const wrongBefore = buildProofreadingLedger({
    source: SOURCE,
    candidate,
    model: { provider: 'local-vllm', model: 'Qwen3.8-27B' },
    proposals: [{
      sentenceId: 'seg-001',
      before: '並非原句',
      changeClass: 'orthography',
      reason: '測試',
      evidence: ['style-rule:TW-ORTH-001'],
      confidence: 1,
      reviewRequired: false,
    }],
  });
  assert.equal(validateProofreadingCandidate({ source: SOURCE, candidate, ledger: wrongBefore }).valid, false);
});

test('semantic-risk edits cannot be auto-approved without review', () => {
  const candidate = candidateWithText('seg-002', '學佛只是為了得到知識。');
  const ledger = buildProofreadingLedger({
    source: SOURCE,
    candidate,
    model: { provider: 'local-vllm', model: 'Qwen3.8-27B' },
    proposals: [{
      sentenceId: 'seg-002',
      changeClass: 'semantic',
      reason: '模型認為語句較流暢',
      evidence: ['model-context-only'],
      confidence: 0.99,
      reviewRequired: false,
    }],
  });

  const result = validateProofreadingCandidate({ source: SOURCE, candidate, ledger });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'REVIEW_REQUIRED_FOR_SEMANTIC_RISK'));
});

test('candidate validation rejects content copied across sentence boundaries', () => {
  const candidate = candidateWithText(
    'seg-002',
    '學佛不是只為了得到知識，所以我們要反覆地思惟。',
  );
  const ledger = buildProofreadingLedger({
    source: SOURCE,
    candidate,
    model: { provider: 'local-vllm', model: 'Qwen3.8-27B' },
    proposals: [{
      sentenceId: 'seg-002',
      changeClass: 'semantic',
      reason: '模型試圖補齊下一句',
      evidence: ['local-model-context'],
      confidence: 0.95,
      reviewRequired: true,
    }],
  });
  const result = validateProofreadingCandidate({ source: SOURCE, candidate, ledger });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'CROSS_SENTENCE_CONTENT_MOVE'));
});

test('candidate validation rejects newly copied content from the middle of another sentence', () => {
  const source = clone(SOURCE);
  source.paragraphs[0].sentences[2].text = '甲乙丙丁中段搬移文字戊己庚辛。';
  const candidate = structuredClone(source);
  candidate.paragraphs[0].sentences[0].text = '我們先說學習的態度，中段搬移文字。';
  const ledger = buildProofreadingLedger({
    source,
    candidate,
    model: { provider: 'test', model: 'fixture' },
    proposals: [{
      sentenceId: 'seg-001',
      before: source.paragraphs[0].sentences[0].text,
      after: candidate.paragraphs[0].sentences[0].text,
      changeClass: 'semantic',
      reason: '測試跨句搬移',
      evidence: ['fixture'],
      confidence: 0.9,
      reviewRequired: true,
    }],
  });
  assert.ok(validateProofreadingCandidate({ source, candidate, ledger }).errors
    .some((error) => error.code === 'CROSS_SENTENCE_CONTENT_MOVE'));
});

test('candidate validation does not call a one-character term correction a cross-sentence move', () => {
  const source = clone(SOURCE);
  source.paragraphs[0].sentences[0].text = '接著說十二緣氣。';
  source.paragraphs[0].sentences[2].text = '十二緣起是重要法義。';
  const candidate = structuredClone(source);
  candidate.paragraphs[0].sentences[0].text = '接著說十二緣起。';
  const ledger = buildProofreadingLedger({
    source, candidate, model: {}, proposals: [{ sentenceId: 'seg-001', changeClass: 'term',
      reason: '名相校正', evidence: ['fixture'], confidence: 0.9, reviewRequired: true }],
  });
  assert.equal(validateProofreadingCandidate({ source, candidate, ledger }).errors
    .some((error) => error.code === 'CROSS_SENTENCE_CONTENT_MOVE'), false);
});

test('candidate validation detects copied replacement even when net text becomes shorter', () => {
  const source = clone(SOURCE);
  source.paragraphs[0].sentences[0].text = '原句有一段很長而且即將被刪除的內容。';
  source.paragraphs[0].sentences[2].text = '另一句包含甲乙丙丁。';
  const candidate = structuredClone(source);
  candidate.paragraphs[0].sentences[0].text = '原句有甲乙丙丁。';
  const ledger = buildProofreadingLedger({
    source, candidate, model: {}, proposals: [{ sentenceId: 'seg-001', changeClass: 'semantic',
      reason: '測試搬移', evidence: ['fixture'], confidence: 0.9, reviewRequired: true }],
  });
  assert.ok(validateProofreadingCandidate({ source, candidate, ledger }).errors
    .some((error) => error.code === 'CROSS_SENTENCE_CONTENT_MOVE'));
});

test('source digest mismatch fails closed', () => {
  const candidate = clone(SOURCE);
  const ledger = {
    schema: 'transcript-proofreading-ledger/v1',
    sourceDigest: 'sha256:stale',
    entries: [],
  };
  const result = validateProofreadingCandidate({ source: SOURCE, candidate, ledger });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'SOURCE_DIGEST_MISMATCH'));
});

test('local-model review parser accepts fenced JSON but rejects malformed coverage', () => {
  const parsed = parseModelReview(`\n\`\`\`json\n{
    "reviewed_count": 2,
    "reviewed_ids": ["seg-001", "seg-002"],
    "proposals": [{
      "id": "seg-001",
      "after": "我們先說學習的態度……",
      "change_class": "orthography",
      "reason": "正體字與標點",
      "evidence": ["上下文"],
      "confidence": 0.98
    }],
    "uncertain": [{"id": "seg-002", "reason": "需回聽"}]
  }\n\`\`\``);
  assert.equal(parsed.reviewed_count, 2);
  assert.equal(parsed.proposals[0].id, 'seg-001');

  assert.throws(
    () => parseModelReview('{"reviewed_count":1,"reviewed_ids":["seg-001"],"proposals":[]}'),
    /uncertain/u,
  );
});

test('batch-bound model review restores program-owned coverage without echoed ID lists', () => {
  const parsed = parseModelReview(JSON.stringify({
    batch_id: 'batch:abc123',
    reviewed_count: 2,
    proposals: [{
      id: 'seg-001',
      after: '我們先說學習的態度……',
      change_class: 'orthography',
      reason: '字形修正',
      evidence: ['local-model-context'],
      confidence: 0.96,
    }],
    uncertain: [],
  }));
  const normalized = normalizeBatchReview(parsed, {
    batchId: 'batch:abc123',
    inputIds: ['seg-001', 'seg-002'],
  });

  assert.deepEqual(normalized.reviewed_ids, ['seg-001', 'seg-002']);
  assert.throws(
    () => normalizeBatchReview(parsed, { batchId: 'batch:wrong', inputIds: ['seg-001', 'seg-002'] }),
    /batch_id mismatch/u,
  );
  assert.throws(
    () => normalizeBatchReview({ ...parsed, proposals: [{ ...parsed.proposals[0], id: 'outside' }] }, {
      batchId: 'batch:abc123',
      inputIds: ['seg-001', 'seg-002'],
    }),
    /escaped batch/u,
  );
  assert.throws(
    () => normalizeBatchReview({ ...parsed, proposals: [parsed.proposals[0], parsed.proposals[0]] }, {
      batchId: 'batch:abc123',
      inputIds: ['seg-001', 'seg-002'],
    }),
    /duplicate proposal/u,
  );
});

test('local-model proposals remain review-required and unknown IDs fail closed', () => {
  const review = {
    reviewed_count: 3,
    reviewed_ids: ['seg-001', 'seg-002', 'seg-003'],
    proposals: [{
      id: 'seg-001',
      after: '我們先說學習的態度……',
      change_class: 'orthography',
      reason: '正體字與標點',
      evidence: ['local-model-context'],
      confidence: 0.98,
    }],
    uncertain: [{ id: 'seg-002', reason: '需核對講者語氣' }],
  };
  const result = applyModelReview({
    source: SOURCE,
    reviews: [review],
    model: { provider: 'local-vllm', model: 'Qwen3.8-27B' },
  });
  assert.equal(result.ledger.entries[0].reviewRequired, true);
  assert.ok(result.reviewQueue.some((item) => item.kind === 'proposal' && item.sentenceId === 'seg-001'));
  assert.ok(result.reviewQueue.some((item) => item.kind === 'uncertain' && item.sentenceId === 'seg-002'));
  assert.ok(result.reviewQueue.every((item) => item.itemId.startsWith('sha256:')));
  assert.ok(result.reviewQueue.every((item) => item.status === 'pending' && item.reviewer === null));
  assert.equal(validateProofreadingCandidate({
    source: SOURCE,
    candidate: result.candidate,
    ledger: result.ledger,
  }).valid, true);

  const unknown = structuredClone(review);
  unknown.proposals[0].id = 'missing-segment';
  assert.throws(
    () => applyModelReview({ source: SOURCE, reviews: [unknown], model: {} }),
    /unknown sentence ID/u,
  );
});

test('proposal verification is fail-closed and only accepted items enter the candidate', () => {
  const review = {
    reviewed_count: 3,
    reviewed_ids: ['seg-001', 'seg-002', 'seg-003'],
    proposals: [
      {
        id: 'seg-001', after: '我們先說學習的態度……', change_class: 'orthography',
        reason: '正體字與標點', evidence: ['local-model-context'], confidence: 0.98,
      },
      {
        id: 'seg-002', after: '學佛只是為了得到知識。', change_class: 'semantic',
        reason: '改寫語氣', evidence: ['local-model-context'], confidence: 0.95,
      },
    ],
    uncertain: [],
  };
  const result = buildValidatedModelCandidate({
    source: SOURCE,
    reviews: [review],
    model: { provider: 'local-vllm', model: 'Qwen3.8-27B' },
    proposalVerification: {
      reviewed_count: 2,
      verdicts: [
        { id: 'seg-001', verdict: 'accept', reason: '僅修正明確字形與標點' },
        { id: 'seg-002', verdict: 'reject', reason: '改變原句否定語義' },
      ],
    },
  });
  assert.deepEqual(result.ledger.entries.map((entry) => entry.sentenceId), ['seg-001']);
  assert.equal(result.candidate.paragraphs[0].sentences[1].text, '學佛不是只為了得到知識。');
  assert.ok(result.reviewQueue.some((item) => item.kind === 'verifier-rejected'
    && item.sentenceId === 'seg-002'));
});

test('proposal verification parser and normalizer require exact unique coverage', () => {
  const parsed = parseProposalVerification(JSON.stringify({
    batch_id: 'verify:1',
    reviewed_count: 2,
    verdicts: [
      { id: 'seg-001', verdict: 'accept', reason: '明確訛字' },
      { id: 'seg-002', verdict: 'uncertain', reason: '需回聽' },
    ],
  }));
  assert.equal(normalizeProposalVerification(parsed, {
    batchId: 'verify:1', proposalIds: ['seg-001', 'seg-002'],
  }).verdicts.length, 2);
  assert.throws(
    () => normalizeProposalVerification({ ...parsed, reviewed_count: 1 }, {
      batchId: 'verify:1', proposalIds: ['seg-001', 'seg-002'],
    }),
    /coverage mismatch/u,
  );
  assert.throws(
    () => normalizeProposalVerification({
      ...parsed,
      verdicts: [parsed.verdicts[0], parsed.verdicts[0]],
    }, { batchId: 'verify:1', proposalIds: ['seg-001', 'seg-002'] }),
    /duplicate verdict/u,
  );
});

test('review queue item IDs remain unique for repeated uncertainty text', () => {
  const review = {
    reviewed_count: 3,
    reviewed_ids: ['seg-001', 'seg-002', 'seg-003'],
    proposals: [],
    uncertain: [
      { id: 'seg-002', reason: '需回聽' },
      { id: 'seg-002', reason: '需回聽' },
    ],
  };
  const result = applyModelReview({ source: SOURCE, reviews: [review], model: {} });
  assert.equal(new Set(result.reviewQueue.map((item) => item.itemId)).size, 2);
});

test('cross-sentence proposals are quarantined while safe work continues', () => {
  const review = {
    reviewed_count: 3,
    reviewed_ids: ['seg-001', 'seg-002', 'seg-003'],
    proposals: [{
      id: 'seg-002',
      after: '學佛不是只為了得到知識，所以我們要反覆地思惟。',
      change_class: 'semantic',
      reason: '模型試圖合併相鄰句',
      evidence: ['local-model-context'],
      confidence: 0.95,
    }],
    uncertain: [],
  };
  const result = buildValidatedModelCandidate({
    source: SOURCE,
    reviews: [review],
    model: { provider: 'local-vllm', model: 'Qwen3.8-27B' },
  });
  assert.equal(result.validation.valid, true);
  assert.equal(result.ledger.entries.length, 0);
  assert.equal(result.quarantined.length, 1);
  assert.equal(result.quarantined[0].sentenceId, 'seg-002');
  assert.ok(result.reviewQueue.some((item) => item.kind === 'validator-rejected'));
});

test('proposal admitting that it copied the next sentence is quarantined even for a short insertion', () => {
  const source = clone(SOURCE);
  source.paragraphs[0].sentences[1].text = '有沒有可能像酒與讓人醉的功能';
  source.paragraphs[0].sentences[2].text = '的這種關係需要再觀察。';
  const review = {
    reviewed_count: 3,
    reviewed_ids: ['seg-001', 'seg-002', 'seg-003'],
    proposals: [{
      id: 'seg-002',
      after: '有沒有可能像酒與讓人醉的功能的關係？',
      change_class: 'grammar',
      reason: '將下一句的「的這種關係」整合至本句末尾。',
      evidence: ['local-model-context'],
      confidence: 0.9,
    }],
    uncertain: [],
  };
  const result = buildValidatedModelCandidate({ source, reviews: [review], model: {} });
  assert.equal(result.ledger.entries.length, 0);
  assert.ok(result.reviewQueue.some((item) => item.kind === 'validator-rejected'));
});

test('split model reviews merge without losing coverage or flags', () => {
  const merged = mergeModelReviews([
    { reviewed_count: 2, reviewed_ids: ['a', 'b'], proposals: [{ id: 'a' }], uncertain: [] },
    { reviewed_count: 3, reviewed_ids: ['c', 'd', 'e'], proposals: [], uncertain: [{ id: 'b', reason: '需回聽' }] },
  ]);
  assert.equal(merged.reviewed_count, 5);
  assert.deepEqual(merged.reviewed_ids, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(merged.proposals, [{ id: 'a' }]);
  assert.deepEqual(merged.uncertain, [{ id: 'b', reason: '需回聽' }]);
});

test('sessions without native sentence IDs receive stable structural locators', () => {
  const legacy = clone(SOURCE);
  for (const sentence of legacy.paragraphs.flatMap((paragraph) => paragraph.sentences)) delete sentence.id;
  const first = listTranscriptSentences(legacy);
  const second = listTranscriptSentences(legacy);
  assert.deepEqual(first.map((sentence) => sentence.id), ['@p000-s000', '@p000-s001', '@p000-s002']);
  assert.deepEqual(second, first);
  assert.equal(new Set(first.map((sentence) => sentence.id)).size, 3);
});

test('generated locators cannot collide with trimmed native IDs', () => {
  const mixed = clone(SOURCE);
  delete mixed.paragraphs[0].sentences[0].id;
  mixed.paragraphs[0].sentences[1].id = ' @p000-s000 ';
  const ids = listTranscriptSentences(mixed).map((sentence) => sentence.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[1], '@p000-s000');
  assert.notEqual(ids[0], ids[1]);
});

test('checkpoint reuse is bound to prompt, digest, sample size, batch size, and model', () => {
  const saved = {
    promptVersion: 'local-proofreading-review/v2',
    sourceDigest: 'sha256:source',
    selectedSentenceCount: 120,
    batchSize: 20,
    model: 'Qwen3.8-27B',
    endpoint: 'http://127.0.0.1:18001/v1',
    maxTokens: 2048,
    runtimeFingerprint: 'sha256:runtime',
  };
  const run = { ...saved };

  assert.equal(checkpointMatchesRun(saved, run), true);
  assert.equal(checkpointMatchesRun(saved, { ...run, batchSize: 60 }), false);
  assert.equal(checkpointMatchesRun(saved, { ...run, model: 'another-model' }), false);
  assert.equal(checkpointMatchesRun(saved, { ...run, endpoint: 'http://other/v1' }), false);
  assert.equal(checkpointMatchesRun(saved, { ...run, runtimeFingerprint: 'sha256:other' }), false);
  assert.equal(checkpointMatchesRun({ ...saved, batchSize: undefined }, run), false);
});

test('runtime fingerprint ignores volatile server timestamps but binds model metadata', () => {
  const first = { data: [{ id: 'Qwen3.8-27B', created: 1, owned_by: 'llamacpp', meta: { n_ctx: 131072, n_params: 27 } }] };
  const second = { data: [{ id: 'Qwen3.8-27B', created: 2, owned_by: 'llamacpp', meta: { n_ctx: 131072, n_params: 27 } }] };
  assert.equal(computeRuntimeFingerprint(first, 'Qwen3.8-27B'), computeRuntimeFingerprint(second, 'Qwen3.8-27B'));
  second.data[0].meta.n_ctx = 65536;
  assert.notEqual(computeRuntimeFingerprint(first, 'Qwen3.8-27B'), computeRuntimeFingerprint(second, 'Qwen3.8-27B'));
});

test('saved checkpoint batches are revalidated before resume', () => {
  const saved = {
    inputCount: 2,
    review: {
      batch_id: 'batch:expected', reviewed_count: 2, reviewed_ids: ['a', 'b'], proposals: [], uncertain: [],
    },
  };
  assert.doesNotThrow(() => validateSavedBatch(saved, {
    batchId: 'batch:expected', inputIds: ['a', 'b'],
  }));
  assert.throws(() => validateSavedBatch({ ...saved, inputCount: 1 }, {
    batchId: 'batch:expected', inputIds: ['a', 'b'],
  }), /inputCount mismatch/u);
  assert.throws(() => validateSavedBatch(saved, {
    batchId: 'batch:other', inputIds: ['a', 'b'],
  }), /batch_id mismatch/u);
});

test('repository inventory and pilot are deterministic across all four courses', () => {
  const inventory = discoverTranscriptSessions(ROOT);
  assert.equal(inventory.length, 302);
  assert.deepEqual(
    Object.fromEntries(Object.entries(Object.groupBy(inventory, (item) => item.course)).map(([course, rows]) => [course, rows.length])),
    {
      '2025釋量論第二品大組共學': 42,
      '入中論善顯密意疏': 220,
      '四念住': 8,
      '釋量論第二品': 32,
    },
  );

  const pilot = selectStratifiedPilot(inventory, 3);
  assert.equal(pilot.length, 12);
  assert.deepEqual(
    Object.values(Object.groupBy(pilot, (item) => item.course)).map((rows) => rows.length),
    [3, 3, 3, 3],
  );
  assert.deepEqual(selectStratifiedPilot(inventory, 3), pilot, 'pilot selection must be reproducible');
});
