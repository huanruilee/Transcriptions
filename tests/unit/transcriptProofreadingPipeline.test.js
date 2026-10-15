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
  evaluateReviewerVerdicts,
  parseModelReview,
  applyModelReview,
  buildValidatedModelCandidate,
  buildCompactReviewPacket,
  bindProductionReviewerVerdicts,
  buildProductionReviewProposals,
  buildProductionReviewerEvidence,
  buildAudioEvidenceRequests,
  buildAdjudicationReviewItems,
  bindAdjudicationSuggestions,
  executeCoverageBoundBatch,
  classifyProposalRisk,
  combineIndependentVerdicts,
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

const REVIEW_SOURCE_DIGEST = 'sha256:test-source';
const REVIEW_RUN_ID = 'review-run-1';
const REVIEW_PROVIDER_MANIFEST = {
  'gx10-qwen': { model: 'Qwen3.8-27B', runtimeFingerprint: 'sha256:qwen-runtime', attested: true, status: 'completed' },
  'minimax-m3': { model: 'MiniMax-M3', runtimeFingerprint: 'sha256:minimax-runtime', attested: true, status: 'completed' },
  'eneural-deepseek': { model: 'deepseek-v4.1-flash', runtimeFingerprint: 'sha256:eneural-runtime', attested: true, status: 'completed' },
};

function reviewProposal(id, before, after, extra = {}) {
  return { id, before, after, sourceDigest: REVIEW_SOURCE_DIGEST, runId: REVIEW_RUN_ID, ...extra };
}

function reviewVerdicts(id, verdict = 'accept') {
  return ['gx10-qwen', 'minimax-m3', 'eneural-deepseek'].map((provider) => ({
    provider,
    verdict,
    proposalId: id,
    sourceDigest: REVIEW_SOURCE_DIGEST,
    runId: REVIEW_RUN_ID,
    ...REVIEW_PROVIDER_MANIFEST[provider],
  }));
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

test('three-model agreement cannot approve an unsupported or doctrinally sensitive rewrite', () => {
  const unsupported = combineIndependentVerdicts({
    proposal: reviewProposal('seg-1157', '利益四年柱', '利益有差別'),
    verdicts: reviewVerdicts('seg-1157'),
    approvedMappings: [],
    providerManifest: REVIEW_PROVIDER_MANIFEST,
  });
  assert.equal(unsupported.outcome, 'review');
  assert.ok(unsupported.risk.reasons.includes('large-rewrite'));

  const doctrinal = combineIndependentVerdicts({
    proposal: reviewProposal('seg-2060', '就是鵝不可得', '就是法不可得'),
    verdicts: reviewVerdicts('seg-2060'),
    approvedMappings: [],
    providerManifest: REVIEW_PROVIDER_MANIFEST,
  });
  assert.equal(doctrinal.outcome, 'review');
  assert.ok(doctrinal.risk.reasons.includes('doctrinal-sensitive'));
});

test('only an approved exact mapping with unanimous support can become low-risk eligible', () => {
  const proposal = reviewProposal('seg-1634', '昏塵又來了', '昏沉又來了');
  const verdicts = reviewVerdicts('seg-1634');
  assert.equal(combineIndependentVerdicts({
    proposal, verdicts, approvedMappings: [], providerManifest: REVIEW_PROVIDER_MANIFEST,
  }).outcome, 'review');
  const approved = combineIndependentVerdicts({
    proposal, verdicts, approvedMappings: [{ before: '昏塵', after: '昏沉' }],
    providerManifest: REVIEW_PROVIDER_MANIFEST,
  });
  assert.equal(approved.outcome, 'eligible');
  assert.equal(approved.risk.level, 'low');
});

test('compact review packet keeps every high-risk item while clustering repeated mappings', () => {
  const repeated = Array.from({ length: 10 }, (_, index) => ({
    proposal: {
      id: `safe-${index}`,
      before: `第${index}次昏塵又來了`,
      after: `第${index}次昏沉又來了`,
      sourceDigest: REVIEW_SOURCE_DIGEST,
      runId: REVIEW_RUN_ID,
    },
    verdicts: reviewVerdicts(`safe-${index}`),
  }));
  const dangerous = [
    ['bad-1', '利益四年柱', '利益有差別'],
    ['bad-2', '現在修四年處也好', '現在修四年禪也好'],
    ['bad-3', '佛夫社知道', '佛陀知道'],
    ['bad-4', '就是鵝不可得', '就是法不可得'],
  ].map(([id, before, after]) => ({
    proposal: reviewProposal(id, before, after),
    verdicts: reviewVerdicts(id),
  }));
  const packet = buildCompactReviewPacket({
    items: [...repeated, ...dangerous],
    approvedMappings: [{ before: '昏塵', after: '昏沉' }],
    representativesPerCluster: 1,
    providerManifest: REVIEW_PROVIDER_MANIFEST,
  });
  assert.equal(packet.summary.total, 14);
  assert.equal(packet.summary.included, 5);
  assert.equal(packet.items.filter((item) => item.risk.level === 'high').length, 4);
  assert.equal(packet.items.filter((item) => item.mappingSignature === '昏塵→昏沉').length, 1);
  assert.ok(packet.summary.compressionRatio < 0.4);
});

test('compact review packet clusters unanimous medium-risk mappings without auto-approving them', () => {
  const repeated = Array.from({ length: 10 }, (_, index) => ({
    proposal: {
      id: `medium-${index}`,
      before: `第${index}次威脆出現`,
      after: `第${index}次威嚴出現`,
      sourceDigest: REVIEW_SOURCE_DIGEST,
      runId: REVIEW_RUN_ID,
    },
    verdicts: reviewVerdicts(`medium-${index}`),
  }));
  const packet = buildCompactReviewPacket({ items: repeated, providerManifest: REVIEW_PROVIDER_MANIFEST });
  assert.equal(packet.summary.total, 10);
  assert.equal(packet.summary.included, 2);
  assert.equal(packet.summary.reviewClusters, 1);
  assert.equal(packet.items[0].outcome, 'review');
  assert.equal(packet.items[0].risk.level, 'medium');
  assert.equal(packet.items[0].requiresClusterApproval, true);
  assert.equal(packet.items[0].clusterSize, 10);
  assert.equal(packet.items[0].proposal.id, 'medium-0');
  assert.equal(packet.items[1].proposal.id, 'medium-9');
  assert.deepEqual(packet.items[0].memberIds, repeated.map((item) => item.proposal.id));
  assert.deepEqual(packet.items[1].memberIds, repeated.map((item) => item.proposal.id));
  assert.equal(packet.clusterSidecars.length, 1);
  assert.equal(packet.clusterSidecars[0].clusterId, packet.items[0].clusterId);
  assert.equal(packet.clusterSidecars[0].members.length, 10);
  assert.equal(packet.clusterSidecars[0].members[9].proposal.before, '第9次威脆出現');
  assert.equal(packet.clusterSidecars[0].members[9].verdicts.length, 3);
  const changedContext = clone(repeated);
  changedContext[9].proposal.context = '篡改後的不同上下文';
  const changedPacket = buildCompactReviewPacket({
    items: changedContext, providerManifest: REVIEW_PROVIDER_MANIFEST,
  });
  assert.notEqual(changedPacket.clusterSidecars[0].clusterId, packet.clusterSidecars[0].clusterId);
});

test('compact review packet keeps high-risk rejects visible and only sidecars low-risk rejects', () => {
  const rejectedVotes = (id) => reviewVerdicts(id).map((vote, index) => (
    index === 0 ? { ...vote, verdict: 'reject' } : vote
  ));
  const packet = buildCompactReviewPacket({
    items: [{
      proposal: reviewProposal('rejected-1', '原文', '猜測改寫'),
      verdicts: rejectedVotes('rejected-1'),
    }, {
      proposal: reviewProposal('rejected-low', '原句', '原句。'),
      verdicts: rejectedVotes('rejected-low'),
    }], providerManifest: REVIEW_PROVIDER_MANIFEST,
  });
  assert.equal(packet.summary.rejected, 2);
  assert.deepEqual(packet.summary.rejectedIds, ['rejected-1', 'rejected-low']);
  assert.deepEqual(packet.items.map((item) => item.proposal.id), ['rejected-1']);
  assert.equal(packet.items[0].quarantined, true);
  assert.equal(packet.rejectedSidecar[0].proposal.before, '原文');
  assert.equal(packet.rejectedSidecar[0].verdicts[0].provider, 'gx10-qwen');
});

test('compact review packet rejects duplicate IDs and never clusters across runs', () => {
  const item = (id, runId) => {
    const proposal = reviewProposal(id, '威脆出現', '威嚴出現', { runId });
    const verdicts = reviewVerdicts(id).map((verdict) => ({ ...verdict, runId }));
    return { proposal, verdicts };
  };
  assert.throws(() => buildCompactReviewPacket({
    items: [item('duplicate', 'run-a'), item('duplicate', 'run-b')],
    providerManifest: REVIEW_PROVIDER_MANIFEST,
  }), /unique proposal IDs/u);
  const packet = buildCompactReviewPacket({
    items: [item('run-a-item', 'run-a'), item('run-b-item', 'run-b')],
    providerManifest: REVIEW_PROVIDER_MANIFEST,
  });
  assert.equal(packet.summary.reviewClusters, 2);
  assert.equal(packet.clusterSidecars.length, 2);
});

test('uncertain or incomplete quorum stays individually reviewable with all evidence', () => {
  const proposal = reviewProposal('uncertain-1', '威脆出現', '威嚴出現');
  const verdicts = reviewVerdicts('uncertain-1');
  verdicts[1] = { ...verdicts[1], verdict: 'uncertain' };
  const packet = buildCompactReviewPacket({
    items: [{ proposal, verdicts }], providerManifest: REVIEW_PROVIDER_MANIFEST,
  });
  assert.equal(packet.items.length, 1);
  assert.equal(packet.items[0].clusterSize, 1);
  assert.equal(packet.items[0].outcome, 'review');
  assert.equal(packet.items[0].verdicts.length, 3);
  assert.equal(packet.clusterSidecars.length, 0);
});

test('semantic-risk classes, negation, and numbers always stay high-risk', () => {
  assert.equal(classifyProposalRisk(reviewProposal(
    'term-ledger', '這個碳症痴', '這個身見痴', { changeClass: 'term' },
  )).level, 'high');
  assert.equal(classifyProposalRisk(reviewProposal(
    'semantic', '已經成立', '尚未成立', { changeClass: 'semantic' },
  )).level, 'high');
  assert.equal(classifyProposalRisk(reviewProposal(
    'numeric', '第三項', '第四項', { changeClass: 'numeric' },
  )).level, 'high');
  assert.equal(classifyProposalRisk(reviewProposal(
    'quotation', '原文修學', '原文修習', { changeClass: 'quotation' },
  )).level, 'high');
});

test('provider quorum is fixed, unique, and bound to proposal, digest, and run', () => {
  const proposal = reviewProposal('bound-1', '昏塵', '昏沉');
  const approvedMappings = [{ before: '昏塵', after: '昏沉' }];
  assert.equal(combineIndependentVerdicts({
    proposal, verdicts: reviewVerdicts('bound-1'), approvedMappings,
    providerManifest: REVIEW_PROVIDER_MANIFEST,
  }).outcome, 'eligible');

  const unknown = reviewVerdicts('bound-1');
  unknown[2] = { ...unknown[2], provider: 'unknown-provider' };
  assert.equal(combineIndependentVerdicts({
    proposal, verdicts: unknown, approvedMappings, providerManifest: REVIEW_PROVIDER_MANIFEST,
  }).outcome, 'review');

  const duplicate = reviewVerdicts('bound-1');
  duplicate[2] = { ...duplicate[2], provider: 'gx10-qwen' };
  assert.equal(combineIndependentVerdicts({
    proposal, verdicts: duplicate, approvedMappings, providerManifest: REVIEW_PROVIDER_MANIFEST,
  }).outcome, 'review');

  const wrongDigest = reviewVerdicts('bound-1');
  wrongDigest[1] = { ...wrongDigest[1], sourceDigest: 'sha256:wrong' };
  const combined = combineIndependentVerdicts({
    proposal, verdicts: wrongDigest, approvedMappings, providerManifest: REVIEW_PROVIDER_MANIFEST,
  });
  assert.equal(combined.outcome, 'review');
  assert.equal(combined.quorumValid, false);

  const wrongRuntime = reviewVerdicts('bound-1');
  wrongRuntime[0] = { ...wrongRuntime[0], runtimeFingerprint: 'sha256:other-runtime' };
  assert.equal(combineIndependentVerdicts({
    proposal, verdicts: wrongRuntime, approvedMappings, providerManifest: REVIEW_PROVIDER_MANIFEST,
  }).outcome, 'review');

  const unattestedManifest = clone(REVIEW_PROVIDER_MANIFEST);
  unattestedManifest['minimax-m3'].attested = false;
  const unattestedReject = [{
    provider: 'minimax-m3', verdict: 'reject', proposalId: 'bound-1',
    sourceDigest: REVIEW_SOURCE_DIGEST, runId: REVIEW_RUN_ID,
    model: 'MiniMax-M3', runtimeFingerprint: 'sha256:minimax-runtime',
  }];
  const unattested = combineIndependentVerdicts({
    proposal, verdicts: unattestedReject, approvedMappings,
    providerManifest: unattestedManifest,
  });
  assert.equal(unattested.outcome, 'review');
  assert.equal(unattested.providerCount, 0);
});

test('reviewer evaluation rejects malformed output and marks dangerous false accepts failed', () => {
  const fixtureItems = [
    { id: 'safe', expected: 'accept' },
    { id: 'danger', expected: 'block' },
  ];
  assert.throws(() => evaluateReviewerVerdicts(fixtureItems, {
    items: [
      { id: 'safe', verdict: 'accept', code: '明確' },
      { id: 'danger', verdict: 'foo', code: '非法' },
    ],
  }), /invalid verdict/u);
  assert.throws(() => evaluateReviewerVerdicts(fixtureItems, {
    items: [
      { id: 'safe', verdict: 'accept', code: '明確', extra: true },
      { id: 'danger', verdict: 'reject', code: '阻擋' },
    ],
  }), /invalid verdict/u);
  const evaluation = evaluateReviewerVerdicts(fixtureItems, {
    items: [
      { id: 'safe', verdict: 'accept', code: '明確' },
      { id: 'danger', verdict: 'accept', code: '錯誤接受' },
    ],
  });
  assert.equal(evaluation.passed, false);
  assert.deepEqual(evaluation.metrics.falseAccepts, ['danger']);
  assert.throws(() => evaluateReviewerVerdicts([
    { id: 'danger', expected: 'blok' },
  ], { items: [{ id: 'danger', verdict: 'accept', code: '誤收' }] }), /fixture schema/u);
  assert.throws(() => evaluateReviewerVerdicts([
    { id: 'safe-only', expected: 'accept' },
  ], { items: [{ id: 'safe-only', verdict: 'accept', code: '安全' }] }), /dangerous case/u);
  assert.throws(() => evaluateReviewerVerdicts([
    { id: 'same', expected: 'accept' }, { id: 'same', expected: 'block' },
  ], { items: [
    { id: 'same', verdict: 'accept', code: '一' },
    { id: 'same', verdict: 'reject', code: '二' },
  ] }), /fixture schema/u);
});

test('production reviewer proposals reuse the existing ledger and bind every item to source and run', () => {
  const sourceDigest = computeSourceDigest(SOURCE);
  const ledger = {
    schema: 'transcript-proofreading-ledger/v1',
    sourceDigest,
    runId: REVIEW_RUN_ID,
    entries: [
      { sentenceId: 'seg-001', before: '昏塵', after: '昏沉', changeClass: 'term', reason: '訛字', evidence: ['context'] },
      { sentenceId: 'seg-002', before: '原句', after: '原句。', changeClass: 'punctuation', reason: '標點', evidence: ['context'] },
    ],
  };
  const proposals = buildProductionReviewProposals({ source: SOURCE, ledger, contextsById: new Map([
    ['seg-001', { previous: '前句', current: '昏塵', next: '後句' }],
    ['seg-002', { previous: '甲', current: '原句', next: '乙' }],
  ]) });
  assert.equal(proposals.length, 2);
  assert.deepEqual(proposals.map((item) => item.id), ['seg-001', 'seg-002']);
  assert.ok(proposals.every((item) => item.sourceDigest === sourceDigest));
  assert.ok(proposals.every((item) => item.runId === REVIEW_RUN_ID));
  assert.equal(proposals[0].context.previous, '前句');
  assert.throws(() => buildProductionReviewProposals({
    source: SOURCE, ledger: { ...ledger, runId: null }, contextsById: new Map(),
  }), /sourceDigest and runId/u);
  assert.throws(() => buildProductionReviewProposals({
    source: SOURCE, ledger: { ...ledger, sourceDigest: 'sha256:fake' }, contextsById: new Map(),
  }), /source digest mismatch/u);
  assert.throws(() => buildProductionReviewProposals({
    source: SOURCE,
    ledger: { ...ledger, entries: [{ ...ledger.entries[0], sentenceId: 'ghost' }] },
    contextsById: new Map(),
  }), /missing source context/u);
});

test('coverage-bound batch execution splits invalid responses without losing items', async () => {
  const items = ['a', 'b', 'c', 'd'];
  const attempts = [];
  const result = await executeCoverageBoundBatch({
    items,
    attempts,
    call: async (batch) => ({ ids: batch.length === 4 ? [...batch, 'extra'] : [...batch] }),
    bind: (batch, response) => {
      if (response.ids.length !== batch.length) throw new Error('coverage mismatch');
      return response.ids;
    },
  });
  assert.deepEqual(result, items);
  assert.deepEqual(attempts.map(({ inputCount, depth, accepted }) => ({ inputCount, depth, accepted })), [
    { inputCount: 4, depth: 0, accepted: false },
    { inputCount: 2, depth: 1, accepted: true },
    { inputCount: 2, depth: 1, accepted: true },
  ]);
});

test('coverage-bound batch execution also splits provider parse failures', async () => {
  const items = [reviewProposal('one', '甲', '乙'), reviewProposal('two', '丙', '丁')];
  const attempts = [];
  const result = await executeCoverageBoundBatch({
    items,
    attempts,
    call: async (batch) => {
      if (batch.length > 1) throw new SyntaxError('truncated provider JSON');
      return { response: { items: [{ id: batch[0].id, verdict: 'accept', code: '可判定' }] }, rawDigest: 'sha256:raw' };
    },
    bind: (batch, call) => bindProductionReviewerVerdicts({
      proposals: batch, response: call.response, provider: 'gx10-qwen',
      model: 'Qwen3.8-27B', runtimeFingerprint: 'sha256:qwen-runtime',
    }),
  });
  assert.deepEqual(result.map((item) => item.proposalId), ['one', 'two']);
  assert.deepEqual(attempts.map((item) => item.accepted), [false, true, true]);
});

test('production reviewer verdict binding requires exact unique coverage', () => {
  const proposals = [
    reviewProposal('one', '甲', '乙'),
    reviewProposal('two', '丙', '丁'),
  ];
  const response = { items: [
    { id: 'one', verdict: 'accept', code: '明確訛字' },
    { id: 'two', verdict: 'uncertain', code: '需要回聽' },
  ] };
  const verdicts = bindProductionReviewerVerdicts({
    proposals, response, provider: 'gx10-qwen', model: 'Qwen3.8-27B',
    runtimeFingerprint: 'sha256:qwen-runtime',
  });
  assert.equal(verdicts.length, 2);
  assert.deepEqual(verdicts[0], {
    provider: 'gx10-qwen', model: 'Qwen3.8-27B', runtimeFingerprint: 'sha256:qwen-runtime',
    proposalId: 'one', sourceDigest: REVIEW_SOURCE_DIGEST, runId: REVIEW_RUN_ID,
    verdict: 'accept', code: '明確訛字',
  });
  assert.throws(() => bindProductionReviewerVerdicts({
    proposals, response: { items: [response.items[0], response.items[0]] },
    provider: 'gx10-qwen', model: 'Qwen3.8-27B', runtimeFingerprint: 'sha256:qwen-runtime',
  }), /ID coverage mismatch/u);
});

test('production reviewer evidence is advisory unless actual model and runtime are attested', () => {
  const proposals = [reviewProposal('one', '甲', '乙')];
  const advisory = buildProductionReviewerEvidence({
    provider: 'minimax-m3', requestedModel: 'MiniMax-M3', actualModel: null,
    runtimeFingerprint: null, proposals, verdicts: [], rawResponseDigests: ['sha256:raw'],
  });
  assert.equal(advisory.attested, false);
  assert.equal(advisory.authority, 'advisory');
  const attested = buildProductionReviewerEvidence({
    provider: 'gx10-qwen', requestedModel: 'Qwen3.8-27B', actualModel: 'Qwen3.8-27B',
    runtimeFingerprint: 'sha256:qwen-runtime', proposals, verdicts: [],
    rawResponseDigests: ['sha256:raw'],
  });
  assert.equal(attested.attested, true);
  assert.equal(attested.authority, 'quorum-eligible');
});

test('audio evidence requests bind every proposal to source timestamps and digest', () => {
  const sourceDigest = computeSourceDigest(SOURCE);
  const packet = {
    sourceDigest,
    runId: REVIEW_RUN_ID,
    items: [{ proposal: {
      id: 'seg-001', before: SOURCE.paragraphs[0].sentences[0].text,
      sourceDigest, runId: REVIEW_RUN_ID,
    } }],
  };
  const requests = buildAudioEvidenceRequests({ source: SOURCE, packet, paddingSeconds: 1.5 });
  assert.deepEqual(requests, [{
    id: 'seg-001', start: 0, end: 2.4, snippetStart: 0, snippetDuration: 3.9,
    sourceText: SOURCE.paragraphs[0].sentences[0].text,
  }]);
  assert.throws(() => buildAudioEvidenceRequests({
    source: SOURCE, packet: { ...packet, sourceDigest: 'sha256:fake' },
  }), /source digest mismatch/u);
  assert.throws(() => buildAudioEvidenceRequests({
    source: SOURCE,
    packet: { ...packet, items: [{ proposal: { ...packet.items[0].proposal, id: 'ghost' } }] },
  }), /missing source sentence/u);
});

test('adjudication suggestions require source/audio binding and exact ID coverage', () => {
  const sourceDigest = computeSourceDigest(SOURCE);
  const proposal = reviewProposal('seg-001', SOURCE.paragraphs[0].sentences[0].text, '候選句', {
    sourceDigest,
    context: { previous: null, current: SOURCE.paragraphs[0].sentences[0].text, next: null, start: 0, end: 2.4 },
    changeClass: 'term',
  });
  const packet = {
    sourceDigest, runId: REVIEW_RUN_ID,
    items: [{ proposal, risk: { level: 'high' }, verdicts: [] }],
  };
  const audioEvidence = {
    schema: 'transcript-proofreading-audio-evidence/v1',
    sourceDigest, runId: REVIEW_RUN_ID, audioSha256: 'sha256:audio',
    items: [{ id: 'seg-001', sourceText: proposal.before, asrText: '候選句', rawResponseDigest: 'sha256:asr' }],
  };
  const items = buildAdjudicationReviewItems({ source: SOURCE, packet, audioEvidence });
  assert.equal(items[0].audioAsrText, '候選句');
  const bound = bindAdjudicationSuggestions({
    items,
    response: { items: [{ id: 'seg-001', decision: 'approve', proposedText: '', code: '音訊與文義相符' }] },
    sourceDigest, runId: REVIEW_RUN_ID, audioSha256: audioEvidence.audioSha256,
    packetDigest: 'sha256:packet',
  });
  assert.equal(bound.authority, 'advisory');
  assert.equal(bound.decisions[0].audioRawResponseDigest, 'sha256:asr');
  assert.throws(() => bindAdjudicationSuggestions({
    items, response: { items: [] }, sourceDigest,
    runId: REVIEW_RUN_ID, audioSha256: audioEvidence.audioSha256, packetDigest: 'sha256:packet',
  }), /coverage mismatch/);
  const equivalent = bindAdjudicationSuggestions({
    items,
    response: { items: [{ id: 'seg-001', decision: 'replace', proposedText: '候選句', code: '非第三答案' }] },
    sourceDigest, runId: REVIEW_RUN_ID, audioSha256: audioEvidence.audioSha256,
    packetDigest: 'sha256:packet',
  });
  assert.equal(equivalent.decisions[0].decision, 'approve');
  assert.equal('proposedText' in equivalent.decisions[0], false);
});

test('risk classifier distinguishes punctuation, approved mappings, and suspicious rewrites', () => {
  assert.equal(classifyProposalRisk({
    before: '這樣說', after: '這樣說。', approvedMappings: [],
  }).level, 'low');
  assert.equal(classifyProposalRisk({
    before: '昏塵又來了', after: '昏沉又來了', approvedMappings: [{ before: '昏塵', after: '昏沉' }],
  }).level, 'low');
  assert.equal(classifyProposalRisk({
    before: '佛夫社知道', after: '佛陀知道', approvedMappings: [],
  }).level, 'high');
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

test('runtime fingerprint rejects a catalog that does not advertise the requested model', () => {
  assert.throws(() => computeRuntimeFingerprint({ data: [], models: [] }, 'Qwen3.8-27B'), /does not advertise/u);
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
