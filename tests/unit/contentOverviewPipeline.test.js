import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';

import {
  auditContentOverviews,
  buildOverviewGenerationMessages,
  buildModelSourceText,
  buildMiniMaxResponsesRequest,
  buildSourceChunks,
  discoverTranscriptTargets,
  finalizeOverviewReview,
  generateAndReviewTarget,
  hydrateEvidenceQuotes,
  isMiniMaxQuotaError,
  isTargetOverviewComplete,
  normalizeObviousAsrTerms,
  normalizeCandidateEvidence,
  pruneUnsupportedItems,
  selectStratifiedSample,
  selectShard,
  validateContentOverview,
} from '../../scripts/content_overview_pipeline.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');

test('discovers every canonical transcript without including derivative artifacts', () => {
  const targets = discoverTranscriptTargets(repoRoot);
  const relativePaths = targets.map((target) => target.relativePath);

  assert.equal(targets.length, 301);
  assert.ok(relativePaths.includes('courses/四念住/sessions/session_01.json'));
  assert.ok(relativePaths.includes('courses/入中論善顯密意疏/sessions/session_110B.json'));
  assert.ok(!relativePaths.some((value) => value.endsWith('_anchored.json')));
  assert.ok(!relativePaths.some((value) => value.includes('/candidate.json')));
});

test('selects a deterministic risk-stratified sample across every course', () => {
  const targets = discoverTranscriptTargets(repoRoot);
  const first = selectStratifiedSample(targets, { rate: 0.1, minPerCourse: 3 });
  const second = selectStratifiedSample(targets, { rate: 0.1, minPerCourse: 3 });
  const courseCounts = Object.groupBy(first, (target) => target.courseId);

  assert.equal(first.length, 34);
  assert.deepEqual(first.map((target) => target.sourceTranscriptId), second.map((target) => target.sourceTranscriptId));
  assert.equal(Object.keys(courseCounts).length, 4);
  assert.ok(Object.values(courseCounts).every((items) => items.length >= 3));
});

test('partitions targets into deterministic non-overlapping resumable shards', () => {
  const targets = discoverTranscriptTargets(repoRoot);
  const shards = [0, 1, 2].map((index) => selectShard(targets, { index, count: 3 }));
  const combined = shards.flat().map((target) => target.sourceTranscriptId);

  assert.equal(combined.length, targets.length);
  assert.equal(new Set(combined).size, targets.length);
  assert.deepEqual(
    [...combined].sort(),
    targets.map((target) => target.sourceTranscriptId).sort(),
  );
});

test('source chunking preserves every sentence exactly once and respects bounded prompts', () => {
  const transcript = {
    paragraphs: [
      {
        id: 'p-1',
        heading: '第一主題',
        sentences: [
          { id: 's-1', text: '第一句說明身念住。' },
          { id: 's-2', text: '第二句說明受念住。' },
        ],
      },
      {
        id: 'p-2',
        heading: '第二主題',
        sentences: [
          { id: 's-3', text: '第三句說明心念住。' },
          { id: 's-4', text: '第四句說明法念住。' },
        ],
      },
    ],
  };

  const chunks = buildSourceChunks(transcript, { maxCharacters: 90 });
  const ids = chunks.flatMap((chunk) => chunk.sentences.map((sentence) => sentence.id));

  assert.deepEqual(ids, ['s-1', 's-2', 's-3', 's-4']);
  assert.ok(chunks.every((chunk) => chunk.characterCount <= 90));
  assert.ok(chunks.every((chunk) => chunk.paragraphHeadings.length > 0));
});

test('targeted retry prompt requires a populated missing group instead of demonstrating empty arrays', () => {
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '法師回答此處應依心相續成立前後世。' },
    ] }],
  };
  const messages = buildOverviewGenerationMessages({
    courseTitle: '測試課程',
    sessionId: '01',
    sourceTranscriptId: 'test/session_01',
  }, transcript, { missingGroups: ['referenceViews'] });
  const prompt = messages.at(-1).content;

  assert.match(prompt, /本輪只補充區塊/);
  assert.match(prompt, /referenceViews/);
  assert.match(prompt, /"referenceViews":\[\{"text":"參考觀點"/);
  assert.doesNotMatch(prompt, /"referenceViews":\[\]/);
});

test('recognizes MiniMax Token Plan exhaustion as a batch-halting condition', () => {
  assert.equal(isMiniMaxQuotaError(new Error('MiniMax HTTP 500: 已达到 Token Plan 用量上限 (2056)')), true);
  assert.equal(isMiniMaxQuotaError(new Error('MiniMax HTTP 429: 已达到 Token Plan 速率限制 (2062)')), true);
  assert.equal(isMiniMaxQuotaError(new Error('MiniMax HTTP 500: temporary upstream failure')), false);
});

test('late targeted retries switch to one-sentence minimal-paraphrase recovery', () => {
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '此處應當依心相續來成立前後世。' },
    ] }],
  };
  const messages = buildOverviewGenerationMessages({
    courseTitle: '測試課程',
    sessionId: '01',
    sourceTranscriptId: 'test/session_01',
  }, transcript, { attempt: 3, missingGroups: ['mainPoints'] });
  const prompt = messages.at(-1).content;

  assert.match(prompt, /最後修復模式/);
  assert.match(prompt, /只產生 1 點/);
  assert.match(prompt, /單一語意完整的陳述句/);
  assert.match(prompt, /不得跨句綜合或補充因果/);
});

test('model source assigns stable positional ids when legacy sentences have no ids', () => {
  const transcript = {
    paragraphs: [
      { heading: '第一段', sentences: [{ text: '無原始編號的第一句。' }, { text: '第二句。' }] },
      { heading: '第二段', sentences: [{ text: '第三句。' }] },
    ],
  };

  const first = buildModelSourceText(transcript);
  const second = buildModelSourceText(transcript);
  assert.equal(first, second);
  assert.match(first, /\[p1-s1\] 無原始編號的第一句。/);
  assert.match(first, /\[p1-s2\] 第二句。/);
  assert.match(first, /\[p2-s1\] 第三句。/);
  assert.doesNotMatch(first, /undefined/);
});

test('builds an efficient MiniMax-M3 Responses API request with reasoning disabled by omission', () => {
  const request = buildMiniMaxResponsesRequest([
    { role: 'system', content: '固定規則' },
    { role: 'user', content: '動態逐字稿' },
  ], 4096, 'overview-generation-v1');

  assert.equal(request.model, 'MiniMax-M3');
  assert.equal(request.instructions, '固定規則');
  assert.equal(request.input, '動態逐字稿');
  assert.equal(request.max_output_tokens, 4096);
  assert.equal(request.prompt_cache_key, 'overview-generation-v1');
  assert.equal(request.temperature, 0.1);
  assert.equal(request.tool_choice, 'none');
  assert.ok(!('reasoning' in request));
  assert.ok(!('max_tokens' in request));

  const reviewRequest = buildMiniMaxResponsesRequest(
    [{ role: 'system', content: '審查' }, { role: 'user', content: '候選' }],
    4096,
    'overview-review-v1',
    { reasoningEffort: 'low' },
  );
  assert.deepEqual(reviewRequest.reasoning, { effort: 'low' });
});

test('overview validation requires grounded evidence snapshots and matching source digest', () => {
  const transcript = {
    paragraphs: [{
      id: 'p-1',
      heading: '四念住定義',
      sentences: [
        { id: 'seg-001', text: '念是明記不忘。' },
        { id: 'seg-002', text: '慧是如實觀察。' },
      ],
    }],
  };
  const overview = {
    schemaVersion: 1,
    status: 'candidate',
    sourceTranscriptId: 'si-nian-zhu/session_01',
    sourceDigest: 'wrong-digest',
    generatedBy: 'MiniMax-M3',
    mainPoints: [
      {
        text: '本講解釋念與慧的作用。',
        evidence: [{ sentenceId: 'seg-001', quote: '念是明記不忘。' }],
      },
      {
        text: '念具有明記不忘的作用。',
        evidence: [{ sentenceId: 'seg-001', quote: '念是明記不忘。' }],
      },
    ],
    discussionTopics: [
      {
        text: '念與慧如何配合？',
        evidence: [{ sentenceId: 'seg-002', quote: '慧是如實觀察。' }],
      },
      {
        text: '慧如何如實觀察？',
        evidence: [{ sentenceId: 'seg-002', quote: '慧是如實觀察。' }],
      },
    ],
    referenceViews: [{
      text: '念負責不忘所緣，慧負責如實觀察。',
      evidence: [
        { sentenceId: 'seg-001', quote: '念是明記不忘。' },
        { sentenceId: 'seg-002', quote: '慧是如實觀察。' },
      ],
    }],
  };

  const invalid = validateContentOverview(overview, transcript, {
    sourceTranscriptId: 'si-nian-zhu/session_01',
  });
  assert.ok(invalid.errors.some((error) => error.code === 'SOURCE_DIGEST_MISMATCH'));

  overview.sourceDigest = invalid.expectedSourceDigest;
  const valid = validateContentOverview(overview, transcript, {
    sourceTranscriptId: 'si-nian-zhu/session_01',
  });
  assert.deepEqual(valid.errors, []);

  overview.referenceViews[0].evidence[0].quote = '不存在的引句';
  const badQuote = validateContentOverview(overview, transcript, {
    sourceTranscriptId: 'si-nian-zhu/session_01',
  });
  assert.ok(badQuote.errors.some((error) => error.code === 'EVIDENCE_QUOTE_MISMATCH'));
});

test('overview validation accepts a documented Codex manual exception when the provider blocks the source', () => {
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '第一句完整支持主要內容。' },
      { id: 's-2', text: '第二句完整支持另一項主要內容。' },
      { id: 's-3', text: '此處明確提出討論問題。' },
      { id: 's-4', text: '講者明確提出參考觀點。' },
      { id: 's-5', text: '補充另一項參考觀點。' },
    ] }],
  };
  const sourceTranscriptId = 'test/session_01';
  const digest = validateContentOverview({
    schemaVersion: 1,
    sourceTranscriptId,
    sourceDigest: '',
    generatedBy: 'MiniMax-M3',
    mainPoints: [], discussionTopics: [], referenceViews: [],
  }, transcript, { sourceTranscriptId }).expectedSourceDigest;
  const overview = {
    schemaVersion: 1,
    status: 'ai-reviewed',
    sourceTranscriptId,
    sourceDigest: digest,
    generatedBy: 'Codex-manual-exception',
    generationException: 'MiniMax input new_sensitive (1026)',
    generatedAt: '2026-10-13T00:00:00.000Z',
    mainPoints: [
      { text: '第一項主要內容。', evidence: [{ sentenceId: 's-1', quote: '第一句完整支持主要內容。' }] },
      { text: '第二項主要內容。', evidence: [{ sentenceId: 's-2', quote: '第二句完整支持另一項主要內容。' }] },
    ],
    discussionTopics: [
      { text: '討論的問題是什麼？', evidence: [{ sentenceId: 's-3', quote: '此處明確提出討論問題。' }] },
    ],
    referenceViews: [
      { text: '講者提出第一項參考觀點。', evidence: [{ sentenceId: 's-4', quote: '講者明確提出參考觀點。' }] },
      { text: '講者補充第二項參考觀點。', evidence: [{ sentenceId: 's-5', quote: '補充另一項參考觀點。' }] },
    ],
    review: {
      reviewedBy: 'Codex',
      items: [
        { group: 'mainPoints', index: 0, verdict: 'supported', reason: 's-1 直接支持。' },
        { group: 'mainPoints', index: 1, verdict: 'supported', reason: 's-2 直接支持。' },
        { group: 'discussionTopics', index: 0, verdict: 'supported', reason: 's-3 直接支持。' },
        { group: 'referenceViews', index: 0, verdict: 'supported', reason: 's-4 直接支持。' },
        { group: 'referenceViews', index: 1, verdict: 'supported', reason: 's-5 直接支持。' },
      ],
    },
    attemptCount: 1,
  };

  assert.deepEqual(validateContentOverview(overview, transcript, { sourceTranscriptId }).errors, []);
});

test('overview validation enforces a 5-8 point reading guide with at least two main points', () => {
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '第一個主要內容。' },
      { id: 's-2', text: '第二個主要內容。' },
      { id: 's-3', text: '第一個討論議題。' },
      { id: 's-4', text: '第二個討論議題。' },
      { id: 's-5', text: '參考觀點。' },
    ] }],
  };
  const overview = {
    schemaVersion: 1,
    status: 'candidate',
    sourceTranscriptId: 'test/session_01',
    sourceDigest: '',
    generatedBy: 'MiniMax-M3',
    mainPoints: [{ text: '第一個主要內容', evidence: [{ sentenceId: 's-1', quote: '第一個主要內容。' }] }],
    discussionTopics: [{ text: '第一個討論議題', evidence: [{ sentenceId: 's-3', quote: '第一個討論議題。' }] }],
    referenceViews: [{ text: '參考觀點', evidence: [{ sentenceId: 's-5', quote: '參考觀點。' }] }],
  };
  overview.sourceDigest = validateContentOverview(overview, transcript, {
    sourceTranscriptId: overview.sourceTranscriptId,
  }).expectedSourceDigest;

  const tooShort = validateContentOverview(overview, transcript, {
    sourceTranscriptId: overview.sourceTranscriptId,
  });
  assert.ok(tooShort.errors.some((error) => error.code === 'INVALID_GROUP_LENGTH'));
  assert.ok(tooShort.errors.some((error) => error.code === 'INVALID_TOTAL_BULLET_COUNT'));

  overview.mainPoints.push({
    text: '第二個主要內容',
    evidence: [{ sentenceId: 's-2', quote: '第二個主要內容。' }],
  });
  overview.discussionTopics.push({
    text: '第二個討論議題',
    evidence: [{ sentenceId: 's-4', quote: '第二個討論議題。' }],
  });
  assert.deepEqual(validateContentOverview(overview, transcript, {
    sourceTranscriptId: overview.sourceTranscriptId,
  }).errors, []);

  overview.mainPoints[0].text = '第一個主要內容提到四帝。';
  const badTerm = validateContentOverview(overview, transcript, {
    sourceTranscriptId: overview.sourceTranscriptId,
  });
  assert.ok(badTerm.errors.some((error) =>
    error.code === 'OBVIOUS_ASR_TERM' && error.detail.includes('四帝->四諦')));
});

test('overview validation rejects near-duplicate discussion questions', () => {
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '大悲心的直接境是眾生的苦還是眾生離苦？' },
      { id: 's-2', text: '救難隊員可比喻大悲心。' },
      { id: 's-3', text: '大悲心是不忍眾生受苦。' },
      { id: 's-4', text: '也可說希望眾生離苦。' },
      { id: 's-5', text: '發心與行為應分開觀察。' },
    ] }],
  };
  const overview = {
    schemaVersion: 1,
    status: 'candidate',
    sourceTranscriptId: 'test/session_01',
    sourceDigest: '',
    generatedBy: 'MiniMax-M3',
    mainPoints: [
      { text: '救難隊員可比喻大悲心。', evidence: [{ sentenceId: 's-2', quote: '救難隊員可比喻大悲心。' }] },
      { text: '發心與行為應分開觀察。', evidence: [{ sentenceId: 's-5', quote: '發心與行為應分開觀察。' }] },
    ],
    discussionTopics: [
      { text: '大悲心的直接境是眾生的苦還是眾生離苦？', evidence: [{ sentenceId: 's-1', quote: '大悲心的直接境是眾生的苦還是眾生離苦？' }] },
      { text: '關於大悲心的直接境，眾生的苦還是眾生離苦，何者正確？', evidence: [{ sentenceId: 's-1', quote: '大悲心的直接境是眾生的苦還是眾生離苦？' }] },
      { text: '大悲心到底是想著眾生的苦，還是想著眾生離苦呢？', evidence: [{ sentenceId: 's-1', quote: '大悲心的直接境是眾生的苦還是眾生離苦？' }] },
    ],
    referenceViews: [
      { text: '大悲心可從不忍受苦與希望離苦兩面解釋。', evidence: [
        { sentenceId: 's-3', quote: '大悲心是不忍眾生受苦。' },
        { sentenceId: 's-4', quote: '也可說希望眾生離苦。' },
      ] },
    ],
  };
  overview.sourceDigest = validateContentOverview(overview, transcript, {
    sourceTranscriptId: overview.sourceTranscriptId,
  }).expectedSourceDigest;

  const result = validateContentOverview(overview, transcript, {
    sourceTranscriptId: overview.sourceTranscriptId,
  });
  assert.ok(result.errors.some((error) => error.code === 'NEAR_DUPLICATE_BULLET'));
});

test('obvious Buddhist epistemology ASR terms are normalized in summary text', () => {
  const candidate = {
    mainPoints: [{ text: '即使只生起傾向事實的猶豫之，也能動搖三有。' }],
    discussionTopics: [],
    referenceViews: [],
  };
  const normalized = normalizeObviousAsrTerms(candidate);
  assert.equal(normalized.mainPoints[0].text, '即使只生起傾向事實的猶豫知，也能動搖三有。');
});

test('overview validation rejects duplicate claims across reading-guide groups', () => {
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '皈依三寶能淨除往昔惡業。' },
      { id: 's-2', text: '發起菩提心是淨除罪障最好的方法。' },
      { id: 's-3', text: '應如何淨除罪障？' },
    ] }],
  };
  const duplicated = '皈依三寶能淨除往昔惡業，發起菩提心是淨除罪障最好的方法。';
  const overview = {
    schemaVersion: 1,
    status: 'candidate',
    sourceTranscriptId: 'test/session_cross_group',
    sourceDigest: '',
    generatedBy: 'MiniMax-M3',
    mainPoints: [
      { text: duplicated, evidence: [{ sentenceId: 's-1' }, { sentenceId: 's-2' }] },
      { text: '淨罪須結合皈依與菩提心。', evidence: [{ sentenceId: 's-1' }, { sentenceId: 's-2' }] },
    ],
    discussionTopics: [
      { text: '應如何淨除罪障？', evidence: [{ sentenceId: 's-3' }] },
    ],
    referenceViews: [
      { text: duplicated, evidence: [{ sentenceId: 's-1' }, { sentenceId: 's-2' }] },
    ],
  };
  overview.sourceDigest = validateContentOverview(overview, transcript, {
    sourceTranscriptId: overview.sourceTranscriptId,
  }).expectedSourceDigest;

  const result = validateContentOverview(overview, transcript, {
    sourceTranscriptId: overview.sourceTranscriptId,
  });
  assert.ok(result.errors.some((error) => error.code === 'CROSS_GROUP_NEAR_DUPLICATE_BULLET'));
});

test('hydrates evidence quotes from local source ids before independent review', () => {
  const transcript = {
    paragraphs: [{ sentences: [{ id: 's-1', text: '原文必須逐字保留。' }] }],
  };
  const candidate = {
    mainPoints: [{ text: '重點', evidence: [{ sentenceId: 's-1', quote: '模型改過的標點' }] }],
    discussionTopics: [],
    referenceViews: [],
  };

  const hydrated = hydrateEvidenceQuotes(candidate, transcript);
  assert.equal(hydrated.mainPoints[0].evidence[0].quote, '原文必須逐字保留。');
  assert.equal(candidate.mainPoints[0].evidence[0].quote, '模型改過的標點');
});

test('normalizes model evidence to at most three unique sentence ids', () => {
  const candidate = {
    mainPoints: Array.from({ length: 6 }, (_, index) => ({
      text: `重點${index + 1}`,
      evidence: index === 0 ? [
        { sentenceId: 's-1' }, { sentenceId: 's-1' }, { sentenceId: 's-2' },
        { sentenceId: 's-3' }, { sentenceId: 's-4' },
      ] : [{ sentenceId: `s-${index + 4}` }],
    })),
    discussionTopics: [],
    referenceViews: [],
  };

  const normalized = normalizeCandidateEvidence(candidate);
  assert.deepEqual(
    normalized.mainPoints[0].evidence.map((item) => item.sentenceId),
    ['s-1', 's-2', 's-3'],
  );
  assert.equal(normalized.mainPoints.length, 4);
  assert.equal(candidate.mainPoints[0].evidence.length, 5);
  assert.equal(candidate.mainPoints.length, 6);
});

test('repairs only resolvable seg id typos and drops bullets with no real evidence', () => {
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 'seg-001', text: '甲。' },
      { id: 'seg-002', text: '乙。' },
    ] }],
  };
  const candidate = {
    mainPoints: [{
      text: '可修正',
      evidence: [{ sentenceId: 'sg-001' }, { sentenceId: 'seg-999' }],
    }],
    discussionTopics: [{ text: '不可猜測', evidence: [{ sentenceId: 'sg-999' }] }],
    referenceViews: [{ text: '原本合法', evidence: [{ sentenceId: 'seg-002' }] }],
  };

  const normalized = normalizeCandidateEvidence(candidate, transcript);
  assert.deepEqual(normalized.mainPoints[0].evidence, [{ sentenceId: 'seg-001' }]);
  assert.deepEqual(normalized.discussionTopics, []);
  assert.deepEqual(normalized.referenceViews[0].evidence, [{ sentenceId: 'seg-002' }]);
});

test('final status is computed from independent review and cannot be promoted by model output', () => {
  const candidate = {
    schemaVersion: 1,
    status: 'ai-reviewed',
    mainPoints: [{ text: '甲', evidence: [{ sentenceId: 's-1', quote: '甲' }] }],
    discussionTopics: [{ text: '乙', evidence: [{ sentenceId: 's-2', quote: '乙' }] }],
    referenceViews: [{ text: '丙', evidence: [{ sentenceId: 's-3', quote: '丙' }] }],
  };
  const supported = {
    reviewedBy: 'MiniMax-M3',
    items: [
      { group: 'mainPoints', index: 0, verdict: 'supported', reason: '引句支持。' },
      { group: 'discussionTopics', index: 0, verdict: 'supported', reason: '引句支持。' },
      { group: 'referenceViews', index: 0, verdict: 'supported', reason: '引句支持。' },
    ],
  };

  assert.equal(finalizeOverviewReview(candidate, supported).status, 'ai-reviewed');

  supported.items[2].verdict = 'unsupported';
  assert.equal(finalizeOverviewReview(candidate, supported).status, 'needs-review');
});

test('drops unsupported bullets and remaps retained review indexes', () => {
  const candidate = {
    mainPoints: [
      { text: '保留甲', evidence: [{ sentenceId: 's-1', quote: '甲' }] },
      { text: '刪除乙', evidence: [{ sentenceId: 's-2', quote: '乙' }] },
    ],
    discussionTopics: [{ text: '保留丙', evidence: [{ sentenceId: 's-3', quote: '丙' }] }],
    referenceViews: [{ text: '保留丁', evidence: [{ sentenceId: 's-4', quote: '丁' }] }],
  };
  const review = {
    items: [
      { group: 'mainPoints', index: 0, verdict: 'supported', reason: '支持' },
      { group: 'mainPoints', index: 1, verdict: 'unsupported', reason: '不足' },
      { group: 'discussionTopics', index: 0, verdict: 'supported', reason: '支持' },
      { group: 'referenceViews', index: 0, verdict: 'supported', reason: '支持' },
    ],
  };

  const pruned = pruneUnsupportedItems(candidate, review);
  assert.deepEqual(pruned.candidate.mainPoints.map((item) => item.text), ['保留甲']);
  assert.deepEqual(pruned.review.items.map(({ group, index }) => `${group}:${index}`), [
    'mainPoints:0', 'discussionTopics:0', 'referenceViews:0',
  ]);
  assert.equal(candidate.mainPoints.length, 2);
});

test('strict audit distinguishes missing, invalid, needs-review, and fully reviewed summaries', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overview-audit-'));
  const makeTarget = (name, overview) => {
    const absolutePath = path.join(tempRoot, `${name}.json`);
    const transcript = {
      paragraphs: [{
        heading: '主題',
        sentences: [
          { id: 's-1', text: '甲。' },
          { id: 's-2', text: '乙。' },
          { id: 's-3', text: '丙。' },
        ],
      }],
    };
    const sourceTranscriptId = `test/${name}`;
    if (overview) {
      transcript.contentOverview = {
        schemaVersion: 1,
        status: overview.status,
        sourceTranscriptId,
        sourceDigest: 'placeholder',
        generatedBy: 'MiniMax-M3',
        mainPoints: [
          { text: '甲', evidence: [{ sentenceId: 's-1', quote: '甲。' }] },
          { text: '乙也是重點', evidence: [{ sentenceId: 's-2', quote: '乙。' }] },
        ],
        discussionTopics: [
          { text: '乙', evidence: [{ sentenceId: 's-2', quote: '乙。' }] },
          { text: '丙如何成立', evidence: [{ sentenceId: 's-3', quote: '丙。' }] },
        ],
        referenceViews: [{ text: '丙', evidence: [{ sentenceId: 's-3', quote: '丙。' }] }],
        review: { reviewedBy: 'MiniMax-M3', items: overview.items || [] },
      };
      transcript.contentOverview.sourceDigest = computeDigestForTest(transcript);
      if (overview.invalid) transcript.contentOverview.referenceViews[0].evidence[0].quote = '錯誤引句';
    }
    fs.writeFileSync(absolutePath, JSON.stringify(transcript));
    return { absolutePath, sourceTranscriptId, relativePath: `${name}.json` };
  };
  const supportedItems = [
    { group: 'mainPoints', index: 0, verdict: 'supported', reason: '支持' },
    { group: 'mainPoints', index: 1, verdict: 'supported', reason: '支持' },
    { group: 'discussionTopics', index: 0, verdict: 'supported', reason: '支持' },
    { group: 'discussionTopics', index: 1, verdict: 'supported', reason: '支持' },
    { group: 'referenceViews', index: 0, verdict: 'supported', reason: '支持' },
  ];

  function computeDigestForTest(transcript) {
    const validation = validateContentOverview({
      schemaVersion: 1,
      status: 'candidate',
      sourceTranscriptId: 'ignored',
      sourceDigest: '',
      generatedBy: 'MiniMax-M3',
      mainPoints: [{ text: '甲', evidence: [{ sentenceId: 's-1', quote: '甲。' }] }],
      discussionTopics: [{ text: '乙', evidence: [{ sentenceId: 's-2', quote: '乙。' }] }],
      referenceViews: [{ text: '丙', evidence: [{ sentenceId: 's-3', quote: '丙。' }] }],
    }, transcript, { sourceTranscriptId: 'ignored' });
    return validation.expectedSourceDigest;
  }

  try {
    const audit = auditContentOverviews([
      makeTarget('missing', null),
      makeTarget('needs-review', { status: 'needs-review', items: supportedItems }),
      makeTarget('invalid', { status: 'ai-reviewed', items: supportedItems, invalid: true }),
      makeTarget('valid', { status: 'ai-reviewed', items: supportedItems }),
    ]);
    assert.equal(audit.total, 4);
    assert.equal(audit.valid, 1);
    assert.equal(audit.missing.length, 1);
    assert.equal(audit.needsReview.length, 1);
    assert.equal(audit.invalid.length, 1);
    assert.equal(audit.complete, false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('generation retries an invalid candidate and applies only a fully supported result', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overview-retry-'));
  const absolutePath = path.join(tempRoot, 'session_01.json');
  const transcript = {
    paragraphs: [{
      heading: '主題',
      sentences: [
        { id: 's-1', text: '甲。' },
        { id: 's-2', text: '乙。' },
        { id: 's-3', text: '丙。' },
      ],
    }],
  };
  fs.writeFileSync(absolutePath, JSON.stringify(transcript));
  const target = {
    absolutePath,
    sourceTranscriptId: 'test/session_01',
    relativePath: 'session_01.json',
    courseTitle: '測試課程',
    sessionId: '01',
  };
  let generationCalls = 0;
  const retryFeedback = [];
  const candidateFactory = (_target, _transcript, feedback) => {
    generationCalls += 1;
    retryFeedback.push(feedback);
    const digest = validateContentOverview({
      schemaVersion: 1,
      status: 'candidate',
      sourceTranscriptId: target.sourceTranscriptId,
      sourceDigest: '',
      generatedBy: 'MiniMax-M3',
      mainPoints: [], discussionTopics: [], referenceViews: [],
    }, transcript, target).expectedSourceDigest;
    return {
      schemaVersion: 1,
      status: 'candidate',
      sourceTranscriptId: target.sourceTranscriptId,
      sourceDigest: digest,
      generatedBy: 'MiniMax-M3',
      mainPoints: [
        { text: '甲', evidence: [{ sentenceId: generationCalls === 1 ? 'missing' : 's-1', quote: '甲。' }] },
        { text: '乙為第二重點', evidence: [{ sentenceId: 's-2', quote: '乙。' }] },
      ],
      discussionTopics: [
        { text: '乙', evidence: [{ sentenceId: 's-2', quote: '乙。' }] },
        { text: '丙如何成立', evidence: [{ sentenceId: 's-3', quote: '丙。' }] },
      ],
      referenceViews: [{ text: '丙', evidence: [{ sentenceId: 's-3', quote: '丙。' }] }],
    };
  };
  const reviewFactory = (candidate) => ({
    items: ['mainPoints', 'discussionTopics', 'referenceViews'].flatMap((group) =>
      candidate[group].map((_item, index) => ({ group, index, verdict: 'supported', reason: '支持' }))),
  });

  try {
    const result = generateAndReviewTarget(tempRoot, target, {
      apply: true,
      retries: 2,
      generateCandidateFn: candidateFactory,
      reviewCandidateFn: reviewFactory,
    });
    assert.equal(generationCalls, 2);
    assert.equal(retryFeedback[0], null);
    assert.ok(retryFeedback[1].validationErrors.some((error) => error.code === 'INVALID_GROUP_LENGTH'));
    assert.equal(result.attempts, 2);
    assert.equal(result.overview.status, 'ai-reviewed');
    const persisted = readJsonForTest(absolutePath);
    assert.equal(persisted.contentOverview.status, 'ai-reviewed');
    const { contentOverview: _contentOverview, ...persistedSource } = persisted;
    assert.deepEqual(persistedSource, transcript);
    assert.equal(isTargetOverviewComplete(target), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  function readJsonForTest(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
});

test('generation accumulates independently supported groups across repair attempts', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overview-accumulate-'));
  const absolutePath = path.join(tempRoot, 'session_01.json');
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '主要內容原句。' },
      { id: 's-2', text: '第二個主要內容原句。' },
      { id: 's-3', text: '討論議題原句。' },
      { id: 's-4', text: '第二個討論議題原句。' },
      { id: 's-5', text: '參考觀點原句。' },
    ] }],
  };
  fs.writeFileSync(absolutePath, JSON.stringify(transcript));
  const target = {
    absolutePath,
    sourceTranscriptId: 'test/session_01',
    relativePath: 'session_01.json',
    courseTitle: '測試',
    sessionId: '01',
  };
  const digest = validateContentOverview({
    schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: '', generatedBy: 'MiniMax-M3', mainPoints: [], discussionTopics: [], referenceViews: [],
  }, transcript, target).expectedSourceDigest;
  let attempt = 0;
  const candidateFactory = () => {
    attempt += 1;
    return {
      schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
      sourceDigest: digest, generatedBy: 'MiniMax-M3',
      mainPoints: [
        { text: '主要內容', evidence: [{ sentenceId: 's-1' }] },
        { text: '第二個主要內容', evidence: [{ sentenceId: 's-2' }] },
      ],
      discussionTopics: [
        { text: '討論議題', evidence: [{ sentenceId: 's-3' }] },
        { text: '第二個討論議題', evidence: [{ sentenceId: 's-4' }] },
      ],
      referenceViews: [{ text: '參考觀點', evidence: [{ sentenceId: 's-5' }] }],
    };
  };
  const reviewFactory = () => ({
    items: [
      { group: 'mainPoints', index: 0, verdict: attempt === 1 ? 'supported' : 'unsupported', reason: '分輪' },
      { group: 'mainPoints', index: 1, verdict: attempt === 1 ? 'supported' : 'unsupported', reason: '分輪' },
      { group: 'discussionTopics', index: 0, verdict: attempt === 2 ? 'supported' : 'unsupported', reason: '分輪' },
      { group: 'discussionTopics', index: 1, verdict: attempt === 2 ? 'supported' : 'unsupported', reason: '分輪' },
      { group: 'referenceViews', index: 0, verdict: attempt === 3 ? 'supported' : 'unsupported', reason: '分輪' },
    ],
  });

  try {
    const result = generateAndReviewTarget(tempRoot, target, {
      retries: 2,
      generateCandidateFn: candidateFactory,
      reviewCandidateFn: reviewFactory,
    });
    assert.equal(result.attempts, 3);
    assert.equal(result.overview.status, 'ai-reviewed');
    assert.deepEqual(
      [result.overview.mainPoints.length, result.overview.discussionTopics.length, result.overview.referenceViews.length],
      [2, 2, 1],
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('targeted retry may return only the missing group and reuses already supported groups', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overview-targeted-retry-'));
  const absolutePath = path.join(tempRoot, 'session_01.json');
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '主要內容原句。' },
      { id: 's-2', text: '第二個主要內容原句。' },
      { id: 's-3', text: '討論議題原句。' },
      { id: 's-4', text: '第二個討論議題原句。' },
      { id: 's-5', text: '參考觀點原句。' },
      { id: 's-6', text: '修正後參考觀點原句。' },
    ] }],
  };
  fs.writeFileSync(absolutePath, JSON.stringify(transcript));
  const target = {
    absolutePath,
    sourceTranscriptId: 'test/session_01',
    relativePath: 'session_01.json',
    courseTitle: '測試',
    sessionId: '01',
  };
  const digest = validateContentOverview({
    schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: '', generatedBy: 'MiniMax-M3', mainPoints: [], discussionTopics: [], referenceViews: [],
  }, transcript, target).expectedSourceDigest;
  let attempt = 0;
  const candidateFactory = () => {
    attempt += 1;
    if (attempt === 1) {
      return {
        schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
        sourceDigest: digest, generatedBy: 'MiniMax-M3',
        mainPoints: [
          { text: '主要內容', evidence: [{ sentenceId: 's-1' }] },
          { text: '第二個主要內容', evidence: [{ sentenceId: 's-2' }] },
        ],
        discussionTopics: [
          { text: '討論議題', evidence: [{ sentenceId: 's-3' }] },
          { text: '第二個討論議題', evidence: [{ sentenceId: 's-4' }] },
        ],
        referenceViews: [{ text: '未通過觀點', evidence: [{ sentenceId: 's-5' }] }],
      };
    }
    return {
      schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
      sourceDigest: digest, generatedBy: 'MiniMax-M3',
      mainPoints: [],
      discussionTopics: [],
      referenceViews: [{ text: '修正後參考觀點', evidence: [{ sentenceId: 's-6' }] }],
    };
  };
  const reviewFactory = (candidate) => ({
    items: [
      ...candidate.mainPoints.map((_item, index) => ({ group: 'mainPoints', index, verdict: 'supported', reason: '支持' })),
      ...candidate.discussionTopics.map((_item, index) => ({ group: 'discussionTopics', index, verdict: 'supported', reason: '支持' })),
      ...candidate.referenceViews.map((_item, index) => ({
        group: 'referenceViews', index,
        verdict: attempt === 1 ? 'unsupported' : 'supported', reason: '分輪',
      })),
    ],
  });

  try {
    const result = generateAndReviewTarget(tempRoot, target, {
      retries: 1,
      generateCandidateFn: candidateFactory,
      reviewCandidateFn: reviewFactory,
    });
    assert.equal(result.attempts, 2);
    assert.equal(result.overview.status, 'ai-reviewed');
    assert.equal(result.overview.mainPoints[0].text, '主要內容');
    assert.equal(result.overview.discussionTopics[0].text, '討論議題');
    assert.equal(result.overview.referenceViews[0].text, '修正後參考觀點');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('coverage repair reuses reviewed bullets and asks MiniMax only for the missing points', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overview-coverage-repair-'));
  const absolutePath = path.join(tempRoot, 'session_01.json');
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '既有主要內容。' },
      { id: 's-2', text: '新增主要內容。' },
      { id: 's-3', text: '第一個討論議題。' },
      { id: 's-4', text: '第二個討論議題。' },
      { id: 's-5', text: '參考觀點。' },
    ] }],
  };
  const target = {
    absolutePath,
    sourceTranscriptId: 'test/session_01',
    relativePath: 'session_01.json',
    courseTitle: '測試',
    sessionId: '01',
  };
  const digest = validateContentOverview({
    schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: '', generatedBy: 'MiniMax-M3', mainPoints: [], discussionTopics: [], referenceViews: [],
  }, transcript, target).expectedSourceDigest;
  transcript.contentOverview = {
    schemaVersion: 1,
    status: 'ai-reviewed',
    sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: digest,
    generatedBy: 'MiniMax-M3',
    mainPoints: [{ text: '既有主要內容', evidence: [{ sentenceId: 's-1', quote: '既有主要內容。' }] }],
    discussionTopics: [
      { text: '第一個討論議題', evidence: [{ sentenceId: 's-3', quote: '第一個討論議題。' }] },
      { text: '第二個討論議題', evidence: [{ sentenceId: 's-4', quote: '第二個討論議題。' }] },
    ],
    referenceViews: [{ text: '參考觀點', evidence: [{ sentenceId: 's-5', quote: '參考觀點。' }] }],
    review: {
      reviewedBy: 'MiniMax-M3',
      items: [
        { group: 'mainPoints', index: 0, verdict: 'supported', reason: '支持' },
        { group: 'discussionTopics', index: 0, verdict: 'supported', reason: '支持' },
        { group: 'discussionTopics', index: 1, verdict: 'supported', reason: '支持' },
        { group: 'referenceViews', index: 0, verdict: 'supported', reason: '支持' },
      ],
    },
  };
  fs.writeFileSync(absolutePath, JSON.stringify(transcript));
  let calls = 0;

  try {
    const result = generateAndReviewTarget(tempRoot, target, {
      retries: 0,
      generateCandidateFn: (_target, _transcript, feedback) => {
        calls += 1;
        assert.deepEqual(feedback.requestedGroups, ['mainPoints']);
        assert.equal(feedback.requestedCounts.mainPoints, 1);
        assert.deepEqual(feedback.acceptedItems.mainPoints, ['既有主要內容']);
        return {
          schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
          sourceDigest: digest, generatedBy: 'MiniMax-M3',
          mainPoints: [{ text: '新增主要內容', evidence: [{ sentenceId: 's-2' }] }],
          discussionTopics: [],
          referenceViews: [],
        };
      },
      reviewCandidateFn: (candidate) => ({
        items: candidate.mainPoints.map((_item, index) => ({
          group: 'mainPoints', index, verdict: 'supported', reason: '支持',
        })),
      }),
    });
    assert.equal(calls, 1);
    assert.equal(result.overview.status, 'ai-reviewed');
    assert.deepEqual(
      [result.overview.mainPoints.length, result.overview.discussionTopics.length, result.overview.referenceViews.length],
      [2, 2, 1],
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('repair reuses supported bullets from a partially rejected existing review', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overview-partial-existing-'));
  const absolutePath = path.join(tempRoot, 'session_01.json');
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '第一個主要內容。' },
      { id: 's-2', text: '錯誤的主要內容來源。' },
      { id: 's-3', text: '修正後的第二個主要內容。' },
      { id: 's-4', text: '第一個討論問題。' },
      { id: 's-5', text: '第二個討論問題。' },
      { id: 's-6', text: '參考觀點。' },
    ] }],
  };
  const target = {
    absolutePath,
    sourceTranscriptId: 'test/session_01',
    relativePath: 'session_01.json',
    courseTitle: '測試',
    sessionId: '01',
  };
  const digest = validateContentOverview({
    schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: '', generatedBy: 'MiniMax-M3', mainPoints: [], discussionTopics: [], referenceViews: [],
  }, transcript, target).expectedSourceDigest;
  const item = (text, sentenceId, quote) => ({ text, evidence: [{ sentenceId, quote }] });
  transcript.contentOverview = {
    schemaVersion: 1,
    status: 'needs-review',
    sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: digest,
    generatedBy: 'MiniMax-M3',
    mainPoints: [
      item('第一個主要內容', 's-1', '第一個主要內容。'),
      item('應被替換的內容', 's-2', '錯誤的主要內容來源。'),
    ],
    discussionTopics: [
      item('第一個討論問題', 's-4', '第一個討論問題。'),
      item('第二個討論問題', 's-5', '第二個討論問題。'),
    ],
    referenceViews: [item('參考觀點', 's-6', '參考觀點。')],
    review: {
      reviewedBy: 'Codex',
      items: [
        { group: 'mainPoints', index: 0, verdict: 'supported', reason: '支持' },
        { group: 'mainPoints', index: 1, verdict: 'unsupported', reason: '加入來源未支持內容' },
        { group: 'discussionTopics', index: 0, verdict: 'supported', reason: '支持' },
        { group: 'discussionTopics', index: 1, verdict: 'supported', reason: '支持' },
        { group: 'referenceViews', index: 0, verdict: 'supported', reason: '支持' },
      ],
    },
  };
  fs.writeFileSync(absolutePath, JSON.stringify(transcript));

  try {
    const result = generateAndReviewTarget(tempRoot, target, {
      retries: 0,
      generateCandidateFn: (_target, _transcript, feedback) => {
        assert.deepEqual(feedback.acceptedItems.mainPoints, ['第一個主要內容']);
        assert.deepEqual(feedback.requestedGroups, ['mainPoints']);
        return {
          schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
          sourceDigest: digest, generatedBy: 'MiniMax-M3',
          mainPoints: [item('修正後的第二個主要內容', 's-3', '修正後的第二個主要內容。')],
          discussionTopics: [],
          referenceViews: [],
        };
      },
      reviewCandidateFn: () => ({
        items: [{ group: 'mainPoints', index: 0, verdict: 'supported', reason: '支持' }],
      }),
    });
    assert.equal(result.overview.status, 'ai-reviewed');
    assert.deepEqual(result.overview.mainPoints.map((entry) => entry.text), [
      '第一個主要內容',
      '修正後的第二個主要內容',
    ]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('repairs known ASR terms in reviewed summary text without another model call', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overview-term-repair-'));
  const absolutePath = path.join(tempRoot, 'session_01.json');
  const transcript = {
    paragraphs: [{ sentences: [
      { id: 's-1', text: '此處說明四帝的次第。' },
      { id: 's-2', text: '第二個主要內容。' },
      { id: 's-3', text: '何謂四帝？' },
      { id: 's-4', text: '如何依次觀察？' },
      { id: 's-5', text: '應當依四帝次第觀察。' },
    ] }],
  };
  const target = {
    absolutePath,
    sourceTranscriptId: 'test/session_01',
    relativePath: 'session_01.json',
    courseTitle: '測試',
    sessionId: '01',
  };
  const digest = validateContentOverview({
    schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: '', generatedBy: 'MiniMax-M3', mainPoints: [], discussionTopics: [], referenceViews: [],
  }, transcript, target).expectedSourceDigest;
  const item = (text, sentenceId, quote) => ({ text, evidence: [{ sentenceId, quote }] });
  transcript.contentOverview = {
    schemaVersion: 1,
    status: 'ai-reviewed',
    sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: digest,
    generatedBy: 'MiniMax-M3',
    mainPoints: [
      item('本講說明四帝的次第。', 's-1', '此處說明四帝的次第。'),
      item('本講另說明第二項主要內容。', 's-2', '第二個主要內容。'),
    ],
    discussionTopics: [
      item('何謂四帝？', 's-3', '何謂四帝？'),
      item('如何依次觀察？', 's-4', '如何依次觀察？'),
    ],
    referenceViews: [
      item('應當依四帝次第觀察。', 's-5', '應當依四帝次第觀察。'),
    ],
  };
  transcript.contentOverview.review = {
    reviewedBy: 'MiniMax-M3',
    items: ['mainPoints', 'discussionTopics', 'referenceViews'].flatMap((group) =>
      transcript.contentOverview[group].map((_entry, index) => ({
        group, index, verdict: 'supported', reason: '支持',
      }))),
  };
  fs.writeFileSync(absolutePath, JSON.stringify(transcript));

  try {
    const result = generateAndReviewTarget(tempRoot, target, {
      apply: true,
      generateCandidateFn: () => {
        throw new Error('model should not be called');
      },
    });
    assert.equal(result.overview.status, 'ai-reviewed');
    assert.equal(result.overview.mainPoints[0].text, '本講說明四諦的次第。');
    assert.equal(result.overview.discussionTopics[0].text, '何謂四諦？');
    assert.equal(result.overview.referenceViews[0].text, '應當依四諦次第觀察。');
    assert.equal(result.overview.mainPoints[0].evidence[0].quote, '此處說明四帝的次第。');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('an overfilled reviewed guide is deterministically reduced to eight points without another model call', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'content-overview-trim-'));
  const absolutePath = path.join(tempRoot, 'session_01.json');
  const sentences = Array.from({ length: 9 }, (_, index) => ({
    id: `s-${index + 1}`,
    text: `原句${index + 1}。`,
  }));
  const transcript = { paragraphs: [{ sentences }] };
  const target = {
    absolutePath,
    sourceTranscriptId: 'test/session_01',
    relativePath: 'session_01.json',
    courseTitle: '測試',
    sessionId: '01',
  };
  const digest = validateContentOverview({
    schemaVersion: 1, status: 'candidate', sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: '', generatedBy: 'MiniMax-M3', mainPoints: [], discussionTopics: [], referenceViews: [],
  }, transcript, target).expectedSourceDigest;
  const item = (label, sentenceIndex) => ({
    text: label,
    evidence: [{ sentenceId: `s-${sentenceIndex}`, quote: `原句${sentenceIndex}。` }],
  });
  transcript.contentOverview = {
    schemaVersion: 1,
    status: 'ai-reviewed',
    sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest: digest,
    generatedBy: 'MiniMax-M3',
    mainPoints: [item('主一', 1), item('主二', 2), item('主三', 3), item('主四', 4)],
    discussionTopics: [item('題一', 5), item('題二', 6), item('題三', 7), item('題四', 8)],
    referenceViews: [item('觀點', 9)],
  };
  transcript.contentOverview.review = {
    reviewedBy: 'MiniMax-M3',
    items: ['mainPoints', 'discussionTopics', 'referenceViews'].flatMap((group) =>
      transcript.contentOverview[group].map((_entry, index) => ({
        group, index, verdict: 'supported', reason: '支持',
      }))),
  };
  fs.writeFileSync(absolutePath, JSON.stringify(transcript));

  try {
    const result = generateAndReviewTarget(tempRoot, target, {
      apply: true,
      generateCandidateFn: () => {
        throw new Error('model should not be called');
      },
    });
    assert.equal(result.overview.status, 'ai-reviewed');
    assert.equal(result.overview.mainPoints.length + result.overview.discussionTopics.length
      + result.overview.referenceViews.length, 8);
    assert.equal(result.overview.discussionTopics.length, 3);
    assert.equal(readJsonForTest(absolutePath).contentOverview.status, 'ai-reviewed');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  function readJsonForTest(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
});
