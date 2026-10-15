import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '../..');
const STYLE_RULES_PATH = path.join(PROJECT_ROOT, 'config', 'transcript-proofreading-style-rules.json');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function loadStyleRules() {
  return JSON.parse(readFileSync(STYLE_RULES_PATH, 'utf8'));
}

function sentenceEntries(session) {
  const raw = (session.paragraphs ?? []).flatMap((paragraph, paragraphIndex) =>
    (paragraph.sentences ?? []).map((sentence, sentenceIndex) => ({ sentence, paragraphIndex, sentenceIndex })),
  );
  const idCounts = new Map();
  for (const { sentence } of raw) {
    if (sentence.id === undefined || sentence.id === null || String(sentence.id).trim() === '') continue;
    const id = String(sentence.id).trim();
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const reserved = new Set(idCounts.keys());
  const used = new Set();
  return raw.map((entry) => {
    const rawId = entry.sentence.id === undefined || entry.sentence.id === null
      ? ''
      : String(entry.sentence.id).trim();
    let key = rawId && idCounts.get(rawId) === 1 ? rawId : '';
    if (!key || used.has(key)) {
      const base = `@p${String(entry.paragraphIndex).padStart(3, '0')}-s${String(entry.sentenceIndex).padStart(3, '0')}`;
      key = base;
      let suffix = 2;
      while (reserved.has(key) || used.has(key)) key = `${base}#${suffix++}`;
    }
    used.add(key);
    return { ...entry, key };
  });
}

function flattenSentences(session) {
  return sentenceEntries(session).map(({ sentence, paragraphIndex, sentenceIndex, key }) => ({
    ...sentence,
    key,
    paragraphIndex,
    sentenceIndex,
  }));
}

export function listTranscriptSentences(session) {
  return sentenceEntries(session).map(({ sentence, key, paragraphIndex, sentenceIndex }) => ({
    id: key,
    sourceId: sentence.id ?? null,
    paragraphIndex,
    sentenceIndex,
    start: sentence.start,
    end: sentence.end,
    text: sentence.text ?? '',
  }));
}

function structureWithoutSentenceText(session) {
  const copy = structuredClone(session);
  for (const paragraph of copy.paragraphs ?? []) {
    for (const sentence of paragraph.sentences ?? []) {
      sentence.text = '__TRANSCRIPT_TEXT__';
    }
  }
  return copy;
}

function collectTokens(text, pattern) {
  return [...String(text).matchAll(pattern)].map((match) => match[0]);
}

function lexicalText(text) {
  return String(text).replace(/[\p{P}\p{S}\s]/gu, '');
}

function hasSemanticRisk(entry) {
  const before = String(entry.before ?? '');
  const after = String(entry.after ?? '');
  const lexicalBefore = lexicalText(before);
  const lexicalAfter = lexicalText(after);
  const highRiskClasses = new Set([
    'semantic', 'term', 'numeric', 'deletion', 'quotation', 'proper-noun', 'person-name',
  ]);
  const changeClasses = String(entry.changeClass ?? '').split('|').filter(Boolean);
  if (changeClasses.some((value) => highRiskClasses.has(value))) return true;
  if (stableStringify(collectTokens(before, /(?:不|無|非|未|莫|勿)/g)) !== stableStringify(collectTokens(after, /(?:不|無|非|未|莫|勿)/g))) return true;
  if (stableStringify(collectTokens(before, /\d+(?:\.\d+)?/g)) !== stableStringify(collectTokens(after, /\d+(?:\.\d+)?/g))) return true;
  if (lexicalBefore.length > 0 && lexicalAfter.length / lexicalBefore.length < 0.8) return true;
  return false;
}

function pendingReviewItem(item, ordinal = 0) {
  const identity = stableStringify({
    kind: item.kind,
    sentenceId: item.sentenceId,
    before: item.before ?? null,
    after: item.after ?? null,
    reason: item.reason ?? null,
    ordinal,
  });
  return {
    itemId: `sha256:${createHash('sha256').update(identity).digest('hex')}`,
    status: 'pending',
    reviewer: null,
    decidedAt: null,
    appliedSourceDigest: null,
    ...item,
  };
}

export function computeSourceDigest(source) {
  const digest = createHash('sha256').update(stableStringify(source), 'utf8').digest('hex');
  return `sha256:${digest}`;
}

export function computeRuntimeFingerprint(runtime, modelId) {
  const model = (runtime?.data ?? []).find((item) => item.id === modelId);
  const catalog = (runtime?.models ?? []).find((item) => item.name === modelId || item.model === modelId);
  if (!model && !catalog) throw new Error(`runtime does not advertise requested model: ${modelId}`);
  const stable = {
    id: model?.id ?? catalog?.name ?? catalog?.model,
    ownedBy: model?.owned_by ?? null,
    aliases: [...(model?.aliases ?? [])].sort(),
    meta: {
      nCtx: model?.meta?.n_ctx ?? null,
      nCtxTrain: model?.meta?.n_ctx_train ?? null,
      nParams: model?.meta?.n_params ?? null,
      size: model?.meta?.size ?? null,
      ftype: model?.meta?.ftype ?? null,
    },
    digest: model?.digest || model?.revision || catalog?.digest || catalog?.revision || null,
  };
  return `sha256:${createHash('sha256').update(stableStringify(stable)).digest('hex')}`;
}

function insertedRuns(before, after) {
  const left = [...before];
  const right = [...after];
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const runs = [];
  let current = '';
  let i = 0;
  let j = 0;
  const flush = () => { if (current) runs.push(current); current = ''; };
  while (j < right.length) {
    if (i < left.length && left[i] === right[j]) {
      flush(); i += 1; j += 1;
    } else if (i < left.length && table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      current += right[j]; j += 1;
    }
  }
  flush();
  return runs;
}

export function applyDeterministicStyleRules(input) {
  let text = String(input);
  const changes = [];
  for (const rule of loadStyleRules().deterministicRules) {
    const pattern = new RegExp(rule.pattern, 'gu');
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;
    const before = text;
    text = text.replace(pattern, rule.replacement);
    changes.push({
      ruleId: rule.id,
      before,
      after: text,
      description: rule.description,
    });
  }
  return { text, changes };
}

export function buildProofreadingLedger({ source, candidate, model, proposals = [] }) {
  const sourceById = new Map(flattenSentences(source).map((sentence) => [sentence.key, sentence]));
  const candidateById = new Map(flattenSentences(candidate).map((sentence) => [sentence.key, sentence]));
  const proposalById = new Map(proposals.map((proposal) => [proposal.sentenceId, proposal]));
  const entries = [];

  for (const [sentenceId, sourceSentence] of sourceById) {
    const candidateSentence = candidateById.get(sentenceId);
    if (!candidateSentence || candidateSentence.text === sourceSentence.text) continue;
    const proposal = proposalById.get(sentenceId) ?? {};
    entries.push({
      sentenceId,
      before: proposal.before ?? sourceSentence.text,
      after: proposal.after ?? candidateSentence.text,
      changeClass: proposal.changeClass ?? 'unspecified',
      reason: proposal.reason ?? '',
      evidence: proposal.evidence ?? [],
      confidence: proposal.confidence ?? null,
      reviewRequired: proposal.reviewRequired ?? true,
    });
  }

  return {
    schema: 'transcript-proofreading-ledger/v1',
    sourceDigest: computeSourceDigest(source),
    model,
    entries,
  };
}

export function parseModelReview(raw) {
  const cleaned = String(raw)
    .trim()
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`local-model response is not valid JSON: ${error.message}`);
  }
  if (!Number.isInteger(parsed.reviewed_count) || parsed.reviewed_count < 0) {
    throw new Error('local-model response requires a non-negative integer reviewed_count');
  }
  if (parsed.reviewed_ids !== undefined) {
    if (!Array.isArray(parsed.reviewed_ids)
      || parsed.reviewed_ids.length !== parsed.reviewed_count
      || parsed.reviewed_ids.some((id) => !String(id ?? '').trim())
      || new Set(parsed.reviewed_ids).size !== parsed.reviewed_ids.length) {
      throw new Error('local-model response requires unique reviewed_ids matching reviewed_count');
    }
  } else if (!String(parsed.batch_id ?? '').trim()) {
    throw new Error('local-model response requires batch_id when reviewed_ids are omitted');
  }
  if (!Array.isArray(parsed.proposals)) {
    throw new Error('local-model response requires proposals array');
  }
  if (!Array.isArray(parsed.uncertain)) {
    throw new Error('local-model response requires uncertain array');
  }
  for (const proposal of parsed.proposals) {
    if (!String(proposal.id ?? '').trim() || !String(proposal.after ?? '').trim()) {
      throw new Error('each proposal requires id and non-empty after text');
    }
    if (!String(proposal.change_class ?? '').trim() || !String(proposal.reason ?? '').trim()) {
      throw new Error('each proposal requires change_class and reason');
    }
    if (!Array.isArray(proposal.evidence) || proposal.evidence.length === 0) {
      throw new Error('each proposal requires at least one evidence item');
    }
    if (typeof proposal.confidence !== 'number' || proposal.confidence < 0 || proposal.confidence > 1) {
      throw new Error('each proposal confidence must be from 0 to 1');
    }
  }
  for (const item of parsed.uncertain) {
    if (!String(item.id ?? '').trim() || !String(item.reason ?? '').trim()) {
      throw new Error('each uncertain item requires id and reason');
    }
  }
  return parsed;
}

export function normalizeBatchReview(review, { batchId, inputIds }) {
  if (review.batch_id !== batchId) throw new Error('batch_id mismatch');
  if (review.reviewed_count !== inputIds.length) {
    throw new Error(`coverage mismatch: ${review.reviewed_count} != ${inputIds.length}`);
  }
  const allowed = new Set(inputIds);
  const escapedProposal = review.proposals.find((proposal) => !allowed.has(proposal.id));
  if (escapedProposal) throw new Error(`proposal escaped batch: ${escapedProposal.id}`);
  if (new Set(review.proposals.map((proposal) => proposal.id)).size !== review.proposals.length) {
    throw new Error('duplicate proposal IDs in batch');
  }
  const escapedUncertainty = review.uncertain.find((item) => !allowed.has(item.id));
  if (escapedUncertainty) throw new Error(`uncertainty escaped batch: ${escapedUncertainty.id}`);
  if (new Set(review.uncertain.map((item) => item.id)).size !== review.uncertain.length) {
    throw new Error('duplicate uncertain IDs in batch');
  }
  return { ...review, reviewed_ids: [...inputIds] };
}

export function parseProposalVerification(raw) {
  const cleaned = String(raw)
    .trim()
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`proposal verification is not valid JSON: ${error.message}`);
  }
  if (!String(parsed.batch_id ?? '').trim()) throw new Error('proposal verification requires batch_id');
  if (!Number.isInteger(parsed.reviewed_count) || parsed.reviewed_count < 0) {
    throw new Error('proposal verification requires a non-negative integer reviewed_count');
  }
  if (!Array.isArray(parsed.verdicts)) throw new Error('proposal verification requires verdicts array');
  for (const verdict of parsed.verdicts) {
    if (!String(verdict.id ?? '').trim() || !['accept', 'reject', 'uncertain'].includes(verdict.verdict)) {
      throw new Error('each proposal verdict requires id and accept, reject, or uncertain');
    }
    if (!String(verdict.reason ?? '').trim()) throw new Error('each proposal verdict requires reason');
  }
  return parsed;
}

export function normalizeProposalVerification(verification, { batchId, proposalIds }) {
  if (verification.batch_id !== batchId) throw new Error('proposal verification batch_id mismatch');
  if (verification.reviewed_count !== proposalIds.length || verification.verdicts.length !== proposalIds.length) {
    throw new Error(`proposal verification coverage mismatch: ${verification.reviewed_count}/${verification.verdicts.length} != ${proposalIds.length}`);
  }
  const verdictIds = verification.verdicts.map((item) => item.id);
  if (new Set(verdictIds).size !== verdictIds.length) throw new Error('duplicate verdict IDs in proposal verification');
  const expected = new Set(proposalIds);
  if (verdictIds.some((id) => !expected.has(id)) || proposalIds.some((id) => !verdictIds.includes(id))) {
    throw new Error('proposal verification IDs do not exactly cover proposals');
  }
  return verification;
}

export function validateSavedBatch(saved, { batchId, inputIds }) {
  if (saved?.inputCount !== inputIds.length) {
    throw new Error(`saved batch inputCount mismatch: ${saved?.inputCount} != ${inputIds.length}`);
  }
  return normalizeBatchReview(saved.review, { batchId, inputIds });
}

export function mergeModelReviews(reviews) {
  return {
    reviewed_count: reviews.reduce((total, review) => total + review.reviewed_count, 0),
    reviewed_ids: reviews.flatMap((review) => review.reviewed_ids),
    proposals: reviews.flatMap((review) => review.proposals),
    uncertain: reviews.flatMap((review) => review.uncertain),
  };
}

export function applyModelReview({ source, reviews, model }) {
  const sourceSentences = flattenSentences(source);
  const sourceById = new Map(sourceSentences.map((sentence) => [sentence.key, sentence]));
  const reviewedIds = reviews.flatMap((review) => review.reviewed_ids);
  const uniqueReviewedIds = new Set(reviewedIds);
  if (reviewedIds.length !== sourceSentences.length
    || uniqueReviewedIds.size !== sourceSentences.length
    || sourceSentences.some((sentence) => !uniqueReviewedIds.has(sentence.key))) {
    throw new Error('reviewed_ids coverage mismatch against source sentence IDs');
  }

  const proposals = [];
  const proposalIds = new Set();
  const reviewQueue = [];
  for (const review of reviews) {
    for (const proposal of review.proposals) {
      if (!sourceById.has(proposal.id)) throw new Error(`unknown sentence ID in proposal: ${proposal.id}`);
      if (proposalIds.has(proposal.id)) throw new Error(`duplicate sentence ID in proposals: ${proposal.id}`);
      proposalIds.add(proposal.id);
      const sourceSentence = sourceById.get(proposal.id);
      if (proposal.after === sourceSentence.text) continue;
      proposals.push({
        sentenceId: proposal.id,
        before: sourceSentence.text,
        after: proposal.after,
        changeClass: proposal.change_class,
        reason: proposal.reason,
        evidence: proposal.evidence,
        confidence: proposal.confidence,
        reviewRequired: true,
      });
      reviewQueue.push(pendingReviewItem({
        kind: 'proposal',
        sentenceId: proposal.id,
        before: sourceSentence.text,
        after: proposal.after,
        reason: proposal.reason,
        evidence: proposal.evidence,
        confidence: proposal.confidence,
      }, reviewQueue.length));
    }
    for (const item of review.uncertain) {
      if (!sourceById.has(item.id)) throw new Error(`unknown sentence ID in uncertainty: ${item.id}`);
      reviewQueue.push(pendingReviewItem(
        { kind: 'uncertain', sentenceId: item.id, reason: item.reason },
        reviewQueue.length,
      ));
    }
  }

  const candidate = structuredClone(source);
  const candidateById = new Map(sentenceEntries(candidate).map((entry) => [entry.key, entry.sentence]));
  for (const proposal of proposals) candidateById.get(proposal.sentenceId).text = proposal.after;
  const ledger = buildProofreadingLedger({ source, candidate, model, proposals });
  return { candidate, ledger, reviewQueue };
}

function gateReviewsByVerification(source, reviews, proposalVerification) {
  if (!proposalVerification) return { reviews, queue: [], verdicts: [] };
  const sourceById = new Map(flattenSentences(source).map((sentence) => [sentence.key, sentence]));
  const proposalById = new Map(reviews.flatMap((review) => review.proposals)
    .filter((proposal) => proposal.after !== sourceById.get(proposal.id)?.text)
    .map((proposal) => [proposal.id, proposal]));
  const proposalIds = [...proposalById.keys()];
  if (proposalVerification.reviewed_count !== proposalIds.length
    || proposalVerification.verdicts.length !== proposalIds.length
    || new Set(proposalVerification.verdicts.map((item) => item.id)).size !== proposalIds.length
    || proposalVerification.verdicts.some((item) => !proposalById.has(item.id))) {
    throw new Error('proposal verification coverage mismatch against generated proposals');
  }
  const verdictById = new Map(proposalVerification.verdicts.map((item) => [item.id, item]));
  const acceptedIds = new Set(proposalVerification.verdicts
    .filter((item) => item.verdict === 'accept')
    .map((item) => item.id));
  const gatedReviews = reviews.map((review) => ({
    ...review,
    proposals: review.proposals.filter((proposal) => proposalById.has(proposal.id) && acceptedIds.has(proposal.id)),
  }));
  const queue = proposalVerification.verdicts
    .filter((item) => item.verdict !== 'accept')
    .map((item, index) => {
      const proposal = proposalById.get(item.id);
      return pendingReviewItem({
        kind: item.verdict === 'reject' ? 'verifier-rejected' : 'verifier-uncertain',
        sentenceId: item.id,
        before: sourceById.get(item.id)?.text ?? null,
        after: proposal.after,
        reason: item.reason,
        proposal,
      }, index);
    });
  return { reviews: gatedReviews, queue, verdicts: [...verdictById.values()] };
}

const PUNCTUATION_OR_SPACE_RE = /[\p{P}\p{Z}\s]/gu;
const DOCTRINAL_SENSITIVE_RE = /(無|不|我|法|空|有|佛|菩薩|阿羅漢|涅槃|因果|業|四念|念住|念處|禪|定|慧|戒)/u;
const EXPECTED_REVIEW_PROVIDERS = Object.freeze([
  'gx10-qwen', 'minimax-m3', 'eneural-deepseek',
]);
const ALLOWED_REVIEW_VERDICTS = new Set(['accept', 'reject', 'uncertain']);

export function buildProductionReviewProposals({ source, ledger, contextsById = new Map() }) {
  if (ledger?.schema !== 'transcript-proofreading-ledger/v1') {
    throw new Error('production review requires transcript-proofreading-ledger/v1');
  }
  if (!String(ledger.sourceDigest ?? '').startsWith('sha256:') || !String(ledger.runId ?? '').trim()) {
    throw new Error('production review requires sourceDigest and runId');
  }
  if (!source || computeSourceDigest(source) !== ledger.sourceDigest) {
    throw new Error('production review source digest mismatch');
  }
  if (!Array.isArray(ledger.entries) || ledger.entries.length === 0) {
    throw new Error('production review requires non-empty ledger entries');
  }
  const ids = ledger.entries.map((entry) => entry?.sentenceId);
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    throw new Error('production review requires unique sentence IDs');
  }
  return ledger.entries.map((entry) => {
    const context = contextsById.get(entry.sentenceId) ?? null;
    if (!context) throw new Error(`missing source context for ${entry.sentenceId}`);
    if (context?.current !== undefined && context.current !== entry.before) {
      throw new Error(`context mismatch for ${entry.sentenceId}`);
    }
    return {
      id: entry.sentenceId,
      sourceDigest: ledger.sourceDigest,
      runId: ledger.runId,
      before: entry.before,
      after: entry.after,
      changeClass: entry.changeClass ?? 'unspecified',
      reason: entry.reason ?? '',
      evidence: Array.isArray(entry.evidence) ? entry.evidence : [],
      confidence: entry.confidence ?? null,
      labels: Array.isArray(entry.labels) ? entry.labels : [],
      context,
    };
  });
}

export async function executeCoverageBoundBatch({
  items, call, bind, attempts = [], depth = 0, onSplit = () => {},
}) {
  let response = null;
  try {
    response = await call(items);
    const bound = bind(items, response);
    attempts.push({
      inputCount: items.length, depth, accepted: true,
      rawResponseDigest: response?.rawDigest ?? null,
    });
    return bound;
  } catch (error) {
    attempts.push({
      inputCount: items.length, depth, accepted: false,
      rawResponseDigest: response?.rawDigest ?? null, error: error.message,
    });
    if (items.length === 1) throw error;
    const middle = Math.ceil(items.length / 2);
    onSplit({ inputCount: items.length, left: middle, right: items.length - middle, error });
    return [
      ...await executeCoverageBoundBatch({
        items: items.slice(0, middle), call, bind, attempts, depth: depth + 1, onSplit,
      }),
      ...await executeCoverageBoundBatch({
        items: items.slice(middle), call, bind, attempts, depth: depth + 1, onSplit,
      }),
    ];
  }
}

export function buildAudioEvidenceRequests({ source, packet, paddingSeconds = 1.5 }) {
  if (!source || computeSourceDigest(source) !== packet?.sourceDigest) {
    throw new Error('audio evidence source digest mismatch');
  }
  if (!Number.isFinite(paddingSeconds) || paddingSeconds < 0 || paddingSeconds > 10) {
    throw new Error('paddingSeconds must be from 0 to 10');
  }
  if (!Array.isArray(packet.items) || packet.items.length === 0) {
    throw new Error('audio evidence requires non-empty packet items');
  }
  const sourceById = new Map(listTranscriptSentences(source).map((sentence) => [sentence.id, sentence]));
  const ids = packet.items.map((item) => item?.proposal?.id);
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    throw new Error('audio evidence requires unique proposal IDs');
  }
  return packet.items.map(({ proposal }) => {
    const sentence = sourceById.get(proposal.id);
    if (!sentence) throw new Error(`missing source sentence for ${proposal.id}`);
    if (proposal.sourceDigest !== packet.sourceDigest || proposal.runId !== packet.runId
      || proposal.before !== sentence.text) throw new Error(`proposal binding mismatch for ${proposal.id}`);
    if (!Number.isFinite(sentence.start) || !Number.isFinite(sentence.end) || sentence.end < sentence.start) {
      throw new Error(`invalid source timestamps for ${proposal.id}`);
    }
    const snippetStart = Math.max(0, sentence.start - paddingSeconds);
    const snippetEnd = sentence.end + paddingSeconds;
    return {
      id: proposal.id,
      start: sentence.start,
      end: sentence.end,
      snippetStart,
      snippetDuration: snippetEnd - snippetStart,
      sourceText: sentence.text,
    };
  });
}

const ALLOWED_ADJUDICATION_DECISIONS = new Set([
  'approve', 'reject', 'replace', 'audio-required',
]);

export function buildAdjudicationReviewItems({ source, packet, audioEvidence }) {
  if (!source || computeSourceDigest(source) !== packet?.sourceDigest) {
    throw new Error('adjudication source digest mismatch');
  }
  if (audioEvidence?.schema !== 'transcript-proofreading-audio-evidence/v1'
    || audioEvidence.sourceDigest !== packet.sourceDigest
    || audioEvidence.runId !== packet.runId
    || !String(audioEvidence.audioSha256 ?? '').startsWith('sha256:')) {
    throw new Error('adjudication audio evidence binding mismatch');
  }
  if (!Array.isArray(packet.items) || !Array.isArray(audioEvidence.items)
    || packet.items.length !== audioEvidence.items.length) {
    throw new Error('adjudication evidence coverage mismatch');
  }
  const audioById = new Map(audioEvidence.items.map((item) => [item?.id, item]));
  if (audioById.size !== audioEvidence.items.length) {
    throw new Error('adjudication audio evidence IDs must be unique');
  }
  return packet.items.map((item) => {
    const proposal = item?.proposal;
    const audio = audioById.get(proposal?.id);
    if (!proposal || proposal.sourceDigest !== packet.sourceDigest || proposal.runId !== packet.runId
      || !audio || audio.sourceText !== proposal.before
      || !String(audio.rawResponseDigest ?? '').startsWith('sha256:')) {
      throw new Error(`adjudication evidence mismatch for ${proposal?.id ?? 'unknown'}`);
    }
    return {
      id: proposal.id,
      before: proposal.before,
      after: proposal.after,
      context: proposal.context,
      changeClass: proposal.changeClass,
      risk: item.risk,
      reviewerVerdicts: item.verdicts.map(({ provider, verdict, code }) => ({ provider, verdict, code })),
      audioAsrText: audio.asrText,
      audioRawResponseDigest: audio.rawResponseDigest,
    };
  });
}

export function bindAdjudicationSuggestions({
  items, response, sourceDigest, runId, audioSha256, packetDigest,
}) {
  if (!Array.isArray(items) || items.length === 0
    || !String(sourceDigest ?? '').startsWith('sha256:')
    || !String(runId ?? '').trim()
    || !String(audioSha256 ?? '').startsWith('sha256:')
    || !String(packetDigest ?? '').startsWith('sha256:')) {
    throw new Error('adjudication binding metadata is required');
  }
  if (!Array.isArray(response?.items) || response.items.length !== items.length) {
    throw new Error(`adjudication ID coverage mismatch: expected ${items.length}, received ${response?.items?.length}`);
  }
  const expected = new Map(items.map((item) => [item.id, item]));
  if (expected.size !== items.length) throw new Error('adjudication input IDs must be unique');
  const responseIds = response.items.map((item) => item?.id);
  if (new Set(responseIds).size !== items.length || responseIds.some((id) => !expected.has(id))) {
    throw new Error('adjudication ID coverage mismatch');
  }
  const decisions = response.items.map((item) => {
    const input = expected.get(item.id);
    const allowedKeys = ['id', 'decision', 'proposedText', 'code'];
    if (!ALLOWED_ADJUDICATION_DECISIONS.has(item.decision)
      || typeof item.code !== 'string' || item.code.length < 1 || item.code.length > 40
      || Object.keys(item).some((key) => !allowedKeys.includes(key))) {
      throw new Error(`invalid adjudication suggestion for ${item?.id ?? 'unknown'}`);
    }
    let decision = item.decision;
    if (decision === 'replace' && item.proposedText === input.after) decision = 'approve';
    if (decision === 'replace' && item.proposedText === input.before) decision = 'reject';
    if (decision === 'replace') {
      if (typeof item.proposedText !== 'string' || !item.proposedText.trim()) {
        throw new Error(`replace requires a distinct proposedText for ${item.id}`);
      }
    } else if (item.decision !== 'replace'
      && item.proposedText !== undefined && item.proposedText !== null
      && String(item.proposedText).trim() !== '') {
      throw new Error(`proposedText is only allowed for replace: ${item.id}`);
    }
    return {
      id: item.id,
      decision,
      ...(decision === 'replace' ? { proposedText: item.proposedText } : {}),
      code: item.code,
      audioRawResponseDigest: input.audioRawResponseDigest,
      inputDigest: `sha256:${createHash('sha256').update(stableStringify(input)).digest('hex')}`,
    };
  });
  return {
    schema: 'transcript-proofreading-adjudication-candidate/v1',
    authority: 'advisory',
    sourceDigest,
    runId,
    audioSha256,
    packetDigest,
    itemCount: decisions.length,
    decisions,
  };
}

export function bindProductionReviewerVerdicts({
  proposals, response, provider, model, runtimeFingerprint = null,
}) {
  if (!EXPECTED_REVIEW_PROVIDERS.includes(provider)) throw new Error(`unknown provider: ${provider}`);
  if (!String(model ?? '').trim()) throw new Error('reviewer model is required');
  if (!Array.isArray(proposals) || proposals.length === 0) throw new Error('non-empty proposals are required');
  if (!Array.isArray(response?.items) || response.items.length !== proposals.length) {
    throw new Error(`ID coverage mismatch: expected ${proposals.length}, received ${response?.items?.length}`);
  }
  const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  if (proposalById.size !== proposals.length) throw new Error('proposal IDs must be unique');
  const responseIds = response.items.map((item) => item?.id);
  if (new Set(responseIds).size !== proposals.length
    || responseIds.some((id) => !proposalById.has(id))) throw new Error('ID coverage mismatch');
  return response.items.map((item) => {
    if (!ALLOWED_REVIEW_VERDICTS.has(item.verdict)
      || typeof item.code !== 'string' || item.code.length < 1 || item.code.length > 24
      || Object.keys(item).some((key) => !['id', 'verdict', 'code'].includes(key))) {
      throw new Error(`invalid reviewer verdict for ${item?.id ?? 'unknown'}`);
    }
    const proposal = proposalById.get(item.id);
    return {
      provider,
      model,
      runtimeFingerprint,
      proposalId: proposal.id,
      sourceDigest: proposal.sourceDigest,
      runId: proposal.runId,
      verdict: item.verdict,
      code: item.code,
    };
  });
}

export function buildProductionReviewerEvidence({
  provider, requestedModel, actualModel = null, runtimeFingerprint = null,
  proposals, verdicts, rawResponseDigests = [], provenance = {},
}) {
  if (!EXPECTED_REVIEW_PROVIDERS.includes(provider)) throw new Error(`unknown provider: ${provider}`);
  if (!Array.isArray(proposals) || proposals.length === 0) throw new Error('non-empty proposals are required');
  const sourceDigests = new Set(proposals.map((item) => item.sourceDigest));
  const runIds = new Set(proposals.map((item) => item.runId));
  if (sourceDigests.size !== 1 || runIds.size !== 1) {
    throw new Error('production evidence cannot mix source digests or run IDs');
  }
  const attested = Boolean(actualModel && actualModel === requestedModel && runtimeFingerprint);
  return {
    schema: 'transcript-proofreading-production-review/v1',
    provider,
    requestedModel,
    actualModel,
    runtimeFingerprint,
    attested,
    authority: attested ? 'quorum-eligible' : 'advisory',
    sourceDigest: proposals[0].sourceDigest,
    runId: proposals[0].runId,
    proposalCount: proposals.length,
    proposalDigest: `sha256:${createHash('sha256').update(stableStringify(proposals)).digest('hex')}`,
    proposals,
    verdictCount: Array.isArray(verdicts) ? verdicts.length : 0,
    rawResponseDigests,
    provenance,
    verdicts,
  };
}

function editFragments(before, after) {
  const left = [...before];
  const right = [...after];
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix
    && suffix < right.length - prefix
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  return {
    before: left.slice(prefix, left.length - suffix || left.length).join(''),
    after: right.slice(prefix, right.length - suffix || right.length).join(''),
  };
}

function exactApprovedMapping(before, after, approvedMappings) {
  return approvedMappings.find((mapping) => {
    if (typeof mapping?.before !== 'string' || typeof mapping?.after !== 'string' || !mapping.before) return false;
    const first = before.indexOf(mapping.before);
    if (first < 0 || before.indexOf(mapping.before, first + mapping.before.length) >= 0) return false;
    const replaced = `${before.slice(0, first)}${mapping.after}${before.slice(first + mapping.before.length)}`;
    return replaced === after;
  }) || null;
}

export function classifyProposalRisk(proposal) {
  const {
    before, after, approvedMappings = [], labels = [],
  } = proposal;
  if (typeof before !== 'string' || typeof after !== 'string' || before === after) {
    return { level: 'high', reasons: ['invalid-or-noop'], mappingSignature: 'invalid-or-noop' };
  }
  const fragments = editFragments(before, after);
  const mappingSignature = `${fragments.before || '∅'}→${fragments.after || '∅'}`;
  if (hasSemanticRisk(proposal)) {
    return { level: 'high', reasons: ['semantic-risk'], mappingSignature };
  }
  if ((proposal.evidence || []).some((value) => ['unknown', 'unsupported'].includes(value))) {
    return { level: 'high', reasons: ['unknown-evidence'], mappingSignature };
  }
  const normalizedBefore = before.replace(PUNCTUATION_OR_SPACE_RE, '');
  const normalizedAfter = after.replace(PUNCTUATION_OR_SPACE_RE, '');
  if (normalizedBefore === normalizedAfter) {
    return { level: 'low', reasons: ['punctuation-only'], mappingSignature: 'punctuation-only' };
  }
  const approvedMapping = exactApprovedMapping(before, after, approvedMappings);
  if (approvedMapping) {
    return {
      level: 'low',
      reasons: ['approved-mapping'],
      mappingSignature: `${approvedMapping.before}→${approvedMapping.after}`,
    };
  }

  const reasons = [];
  const beforeLength = [...before].length;
  const afterLength = [...after].length;
  const changedBefore = [...fragments.before].length;
  const changedAfter = [...fragments.after].length;
  const ratio = Math.max(
    changedBefore / Math.max(1, beforeLength),
    changedAfter / Math.max(1, afterLength),
  );
  if (changedBefore > 4 || changedAfter > 4 || ratio > 0.35) reasons.push('large-rewrite');
  if (DOCTRINAL_SENSITIVE_RE.test(`${fragments.before}${fragments.after}`)) reasons.push('doctrinal-sensitive');
  if (labels.includes('still-unintelligible')) reasons.push('still-unintelligible');
  if (labels.includes('cross-sentence') || labels.includes('unsupported-rewrite')) reasons.push('unsupported-rewrite');
  return {
    level: reasons.length > 0 ? 'high' : 'medium',
    reasons: reasons.length > 0 ? reasons : ['novel-unapproved-mapping'],
    mappingSignature,
  };
}

export function combineIndependentVerdicts({
  proposal, verdicts = [], approvedMappings = [], providerManifest = null,
}) {
  const risk = classifyProposalRisk({ ...proposal, approvedMappings, labels: proposal.labels || [] });
  const expectedProviders = new Set(EXPECTED_REVIEW_PROVIDERS);
  const providerCounts = new Map();
  const quorumIssues = [];
  if (!proposal.id || !proposal.sourceDigest || !proposal.runId) quorumIssues.push('unbound-proposal');
  if (!providerManifest || typeof providerManifest !== 'object') quorumIssues.push('missing-provider-manifest');
  for (const provider of Object.keys(providerManifest || {})) {
    if (!expectedProviders.has(provider)) quorumIssues.push(`unknown-provider-manifest:${provider}`);
  }
  for (const provider of EXPECTED_REVIEW_PROVIDERS) {
    const expected = providerManifest?.[provider];
    if (!expected?.model || !expected?.runtimeFingerprint
      || expected.attested !== true || expected.status !== 'completed') {
      quorumIssues.push(`incomplete-provider-manifest:${provider}`);
    }
  }
  for (const verdict of verdicts) {
    providerCounts.set(verdict.provider, (providerCounts.get(verdict.provider) || 0) + 1);
    if (!expectedProviders.has(verdict.provider)) quorumIssues.push(`unknown-provider:${verdict.provider || 'missing'}`);
    if (!ALLOWED_REVIEW_VERDICTS.has(verdict.verdict)) quorumIssues.push(`invalid-verdict:${verdict.provider || 'missing'}`);
    if (verdict.proposalId !== proposal.id
      || verdict.sourceDigest !== proposal.sourceDigest
      || verdict.runId !== proposal.runId) quorumIssues.push(`binding-mismatch:${verdict.provider || 'missing'}`);
    const expected = providerManifest?.[verdict.provider];
    if (!expected || verdict.model !== expected.model) quorumIssues.push(`model-mismatch:${verdict.provider || 'missing'}`);
    if (!expected || verdict.runtimeFingerprint !== expected.runtimeFingerprint) {
      quorumIssues.push(`runtime-mismatch:${verdict.provider || 'missing'}`);
    }
  }
  for (const provider of EXPECTED_REVIEW_PROVIDERS) {
    const count = providerCounts.get(provider) || 0;
    if (count === 0) quorumIssues.push(`missing-provider:${provider}`);
    if (count > 1) quorumIssues.push(`duplicate-provider:${provider}`);
  }
  if (verdicts.length !== EXPECTED_REVIEW_PROVIDERS.length) quorumIssues.push('unexpected-verdict-count');
  const uniqueIssues = [...new Set(quorumIssues)];
  const quorumValid = uniqueIssues.length === 0;
  const boundExpectedVerdicts = verdicts.filter((verdict) => (
    expectedProviders.has(verdict.provider)
    && ALLOWED_REVIEW_VERDICTS.has(verdict.verdict)
    && verdict.proposalId === proposal.id
    && verdict.sourceDigest === proposal.sourceDigest
    && verdict.runId === proposal.runId
    && verdict.model === providerManifest?.[verdict.provider]?.model
    && Boolean(providerManifest?.[verdict.provider]?.runtimeFingerprint)
    && providerManifest?.[verdict.provider]?.attested === true
    && providerManifest?.[verdict.provider]?.status === 'completed'
    && verdict.runtimeFingerprint === providerManifest?.[verdict.provider]?.runtimeFingerprint
  ));
  const unanimousAccept = quorumValid
    && boundExpectedVerdicts.every((verdict) => verdict.verdict === 'accept');
  let outcome = 'review';
  if (quorumValid && boundExpectedVerdicts.some((verdict) => verdict.verdict === 'reject')) outcome = 'rejected';
  else if (unanimousAccept && risk.level === 'low') outcome = 'eligible';
  return {
    outcome,
    risk,
    providerCount: new Set(boundExpectedVerdicts.map((item) => item.provider)).size,
    quorumValid,
    quorumIssues: uniqueIssues,
    unanimousAccept,
    verdicts,
  };
}

function selectClusterRepresentatives(cluster, count) {
  const take = Math.min(Math.max(1, count), cluster.length);
  if (take === 1) return [cluster[0]];
  const indexes = Array.from({ length: take }, (_, index) => (
    Math.round((index * (cluster.length - 1)) / (take - 1))
  ));
  return indexes.map((index) => cluster[index]);
}

export function buildCompactReviewPacket({
  items, approvedMappings = [], representativesPerCluster = 2, providerManifest = null,
}) {
  const proposalIds = items.map((item) => item.proposal?.id);
  if (proposalIds.some((id) => typeof id !== 'string' || !id)
    || new Set(proposalIds).size !== proposalIds.length) {
    throw new Error('compact review packet requires unique proposal IDs');
  }
  const enriched = items.map((item) => {
    const combined = combineIndependentVerdicts({
      proposal: item.proposal,
      verdicts: item.verdicts,
      approvedMappings,
      providerManifest,
    });
    return {
      ...item,
      ...combined,
      mappingSignature: combined.risk.mappingSignature,
    };
  });
  const packet = [];
  const eligibleClusters = new Map();
  const reviewClusters = new Map();
  for (const item of enriched) {
    if (item.outcome === 'rejected') {
      if (item.risk.level === 'high') packet.push({ ...item, clusterSize: 1, quarantined: true });
      continue;
    }
    if (item.outcome === 'eligible' && item.risk.level === 'low') {
      const clusterKey = stableStringify({
        mappingSignature: item.mappingSignature,
        sourceDigest: item.proposal.sourceDigest,
        runId: item.proposal.runId,
      });
      const cluster = eligibleClusters.get(clusterKey) || [];
      cluster.push(item);
      eligibleClusters.set(clusterKey, cluster);
      continue;
    }
    const unanimousMedium = item.risk.level === 'medium' && item.unanimousAccept;
    if (unanimousMedium) {
      const clusterKey = stableStringify({
        mappingSignature: item.mappingSignature,
        sourceDigest: item.proposal.sourceDigest,
        runId: item.proposal.runId,
      });
      const cluster = reviewClusters.get(clusterKey) || [];
      cluster.push(item);
      reviewClusters.set(clusterKey, cluster);
      continue;
    }
    {
      packet.push({ ...item, clusterSize: 1 });
    }
  }
  const clusterSidecars = [];
  const clusterMetadata = (cluster, outcome) => {
    const sidecarPayload = {
      outcome,
      mappingSignature: cluster[0].mappingSignature,
      sourceDigest: cluster[0].proposal.sourceDigest,
      runId: cluster[0].proposal.runId,
      members: cluster.map((item) => ({
        proposal: item.proposal,
        verdicts: item.verdicts,
        risk: item.risk,
        quorumIssues: item.quorumIssues,
      })),
    };
    const clusterId = `sha256:${createHash('sha256').update(stableStringify(sidecarPayload)).digest('hex')}`;
    clusterSidecars.push({
      clusterId,
      ...sidecarPayload,
    });
    return clusterId;
  };
  for (const cluster of eligibleClusters.values()) {
    const clusterId = clusterMetadata(cluster, 'eligible');
    packet.push(...selectClusterRepresentatives(cluster, representativesPerCluster)
      .map((item) => ({
        ...item,
        clusterId,
        clusterSize: cluster.length,
        memberIds: cluster.map((member) => member.proposal.id),
      })));
  }
  for (const cluster of reviewClusters.values()) {
    const clusterId = clusterMetadata(cluster, 'review');
    packet.push(...selectClusterRepresentatives(cluster, representativesPerCluster)
      .map((item) => ({
        ...item,
        clusterId,
        clusterSize: cluster.length,
        memberIds: cluster.map((member) => member.proposal.id),
        requiresClusterApproval: true,
      })));
  }
  packet.sort((left, right) => left.proposal.id.localeCompare(right.proposal.id, 'zh-Hant'));
  return {
    schema: 'transcript-proofreading-compact-review/v1',
    summary: {
      total: enriched.length,
      included: packet.length,
      rejected: enriched.filter((item) => item.outcome === 'rejected').length,
      rejectedIds: enriched
        .filter((item) => item.outcome === 'rejected')
        .map((item) => item.proposal.id),
      eligibleClusters: eligibleClusters.size,
      reviewClusters: reviewClusters.size,
      compressionRatio: enriched.length === 0 ? 0 : packet.length / enriched.length,
    },
    items: packet,
    clusterSidecars,
    rejectedSidecar: enriched
      .filter((item) => item.outcome === 'rejected')
      .map((item) => ({
        proposal: item.proposal,
        verdicts: item.verdicts,
        risk: item.risk,
        quorumIssues: item.quorumIssues,
      })),
  };
}

export function evaluateReviewerVerdicts(fixtureItems, result) {
  if (!Array.isArray(fixtureItems) || fixtureItems.length === 0) {
    throw new Error('reviewer fixture must be a non-empty array');
  }
  const fixtureIds = fixtureItems.map((item) => item?.id);
  if (fixtureIds.some((id) => typeof id !== 'string' || !id)
    || new Set(fixtureIds).size !== fixtureIds.length
    || fixtureItems.some((item) => !['accept', 'block'].includes(item.expected))) {
    throw new Error('reviewer fixture schema is invalid');
  }
  if (!fixtureItems.some((item) => item.expected === 'block')) {
    throw new Error('reviewer fixture requires at least one dangerous case');
  }
  if (!Array.isArray(result?.items) || result.items.length !== fixtureItems.length) {
    throw new Error(`coverage mismatch: expected ${fixtureItems.length}, received ${result?.items?.length}`);
  }
  const allowedKeys = new Set(['id', 'verdict', 'code']);
  if (result.items.some((item) => typeof item?.id !== 'string'
    || !ALLOWED_REVIEW_VERDICTS.has(item.verdict)
    || typeof item.code !== 'string'
    || item.code.length < 1
    || item.code.length > 24
    || Object.keys(item).some((key) => !allowedKeys.has(key)))) {
    throw new Error('provider returned an invalid verdict item');
  }
  const verdictById = new Map(result.items.map((item) => [item.id, item]));
  if (verdictById.size !== fixtureItems.length
    || fixtureItems.some((item) => !verdictById.has(item.id))) throw new Error('ID coverage mismatch');
  const safe = fixtureItems.filter((item) => item.expected === 'accept');
  const unsafe = fixtureItems.filter((item) => item.expected === 'block');
  const falseAccepts = unsafe
    .filter((item) => verdictById.get(item.id).verdict === 'accept')
    .map((item) => item.id);
  const safeAccepts = safe
    .filter((item) => verdictById.get(item.id).verdict === 'accept')
    .map((item) => item.id);
  return {
    passed: falseAccepts.length === 0,
    metrics: {
      total: fixtureItems.length,
      unsafeTotal: unsafe.length,
      unsafeBlocked: unsafe.length - falseAccepts.length,
      falseAccepts,
      safeTotal: safe.length,
      safeAccepted: safeAccepts.length,
      safeAccepts,
      outputChars: JSON.stringify(result).length,
    },
    items: fixtureItems.map((item) => ({
      id: item.id, expected: item.expected, ...verdictById.get(item.id),
    })),
  };
}

export function buildValidatedModelCandidate({ source, reviews, model, proposalVerification = null }) {
  const gate = gateReviewsByVerification(source, reviews, proposalVerification);
  let result = applyModelReview({ source, reviews: gate.reviews, model });
  result.reviewQueue.push(...gate.queue.map((item, index) => pendingReviewItem(
    { ...item, itemId: undefined }, result.reviewQueue.length + index,
  )));
  let validation = validateProofreadingCandidate({
    source,
    candidate: result.candidate,
    ledger: result.ledger,
  });
  const rejectedErrors = validation.errors.filter((error) => error.code === 'CROSS_SENTENCE_CONTENT_MOVE');
  const rejectedIds = new Set(rejectedErrors.map((error) => error.sentenceId));
  if (rejectedIds.size === 0) return {
    ...result, validation, quarantined: [], proposalVerification: gate.verdicts,
  };

  const proposalById = new Map(
    gate.reviews.flatMap((review) => review.proposals).map((proposal) => [proposal.id, proposal]),
  );
  const sanitizedReviews = gate.reviews.map((review) => ({
    ...review,
    proposals: review.proposals.filter((proposal) => !rejectedIds.has(proposal.id)),
  }));
  const quarantined = [...rejectedIds].map((sentenceId) => ({
    sentenceId,
    proposal: proposalById.get(sentenceId),
    errors: rejectedErrors.filter((error) => error.sentenceId === sentenceId),
  }));
  result = applyModelReview({ source, reviews: sanitizedReviews, model });
  result.reviewQueue.push(...gate.queue.map((item, index) => pendingReviewItem(
    { ...item, itemId: undefined }, result.reviewQueue.length + index,
  )));
  result.reviewQueue.push(...quarantined.map((item, index) => pendingReviewItem({
    kind: 'validator-rejected',
    sentenceId: item.sentenceId,
    reason: item.errors.map((error) => error.message).join('; '),
    proposal: item.proposal,
  }, result.reviewQueue.length + index)));
  validation = validateProofreadingCandidate({
    source,
    candidate: result.candidate,
    ledger: result.ledger,
  });
  return { ...result, validation, quarantined, proposalVerification: gate.verdicts };
}

export function validateProofreadingCandidate({ source, candidate, ledger }) {
  const errors = [];
  const add = (code, message, sentenceId = null) => errors.push({ code, message, sentenceId });

  if (ledger?.schema !== 'transcript-proofreading-ledger/v1') {
    add('INVALID_LEDGER_SCHEMA', 'ledger schema must be transcript-proofreading-ledger/v1');
  }
  if (ledger?.sourceDigest !== computeSourceDigest(source)) {
    add('SOURCE_DIGEST_MISMATCH', 'ledger source digest does not match current source');
  }

  if (stableStringify(structureWithoutSentenceText(source)) !== stableStringify(structureWithoutSentenceText(candidate))) {
    add('STRUCTURE_MUTATION', 'candidate changed metadata, headings, IDs, ordering, timestamps, or non-text fields');
  }

  const sourceSentences = flattenSentences(source);
  const candidateSentences = flattenSentences(candidate);
  const candidateById = new Map(candidateSentences.map((sentence) => [sentence.key, sentence]));
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const entryById = new Map();
  for (const entry of entries) {
    if (entryById.has(entry.sentenceId)) add('DUPLICATE_LEDGER_ENTRY', 'sentence appears more than once in ledger', entry.sentenceId);
    entryById.set(entry.sentenceId, entry);
  }

  const changedIds = new Set();
  for (let sourceIndex = 0; sourceIndex < sourceSentences.length; sourceIndex += 1) {
    const sourceSentence = sourceSentences[sourceIndex];
    const candidateSentence = candidateById.get(sourceSentence.key);
    if (!candidateSentence || candidateSentence.text === sourceSentence.text) continue;
    changedIds.add(sourceSentence.key);
    const entry = entryById.get(sourceSentence.key);
    if (!entry) {
      add('MISSING_LEDGER_ENTRY', 'changed sentence has no ledger entry', sourceSentence.key);
      continue;
    }
    if (entry.before !== sourceSentence.text || entry.after !== candidateSentence.text) {
      add('LEDGER_TEXT_MISMATCH', 'ledger before/after does not exactly match source and candidate', sourceSentence.key);
    }
    if (!String(entry.reason ?? '').trim() || !Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      add('INCOMPLETE_LEDGER_EVIDENCE', 'ledger entry requires a reason and at least one evidence item', sourceSentence.key);
    }
    if (typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1) {
      add('INVALID_CONFIDENCE', 'confidence must be a number from 0 to 1', sourceSentence.key);
    }
    if (typeof entry.reviewRequired !== 'boolean') {
      add('INVALID_REVIEW_FLAG', 'reviewRequired must be boolean', sourceSentence.key);
    }
    if (hasSemanticRisk(entry) && entry.reviewRequired !== true) {
      add('REVIEW_REQUIRED_FOR_SEMANTIC_RISK', 'semantic-risk edit must enter review queue', sourceSentence.key);
    }
    const beforeLexical = lexicalText(sourceSentence.text);
    const afterLexical = lexicalText(candidateSentence.text);
    if (/(?:下一句|前一句|相鄰句|整合至本句|搬入本句)/u.test(String(entry.reason ?? ''))
      && beforeLexical !== afterLexical) {
      add('CROSS_SENTENCE_CONTENT_MOVE', 'proposal reason admits moving content across sentence boundaries', sourceSentence.key);
      continue;
    }
    const addedRuns = insertedRuns(beforeLexical, afterLexical).filter((run) => run.length >= 4);
    if (addedRuns.length === 0) continue;
    for (const other of sourceSentences) {
      if (other.key === sourceSentence.key) continue;
      const neighborLexical = lexicalText(other.text);
      if (neighborLexical.length < 4) continue;
      if (addedRuns.some((run) => neighborLexical.includes(run))) {
        add('CROSS_SENTENCE_CONTENT_MOVE', `candidate copied content from another sentence ${other.key}`, sourceSentence.key);
        break;
      }
    }
  }

  for (const entry of entries) {
    if (!changedIds.has(entry.sentenceId)) {
      add('ORPHAN_LEDGER_ENTRY', 'ledger entry does not correspond to a changed sentence', entry.sentenceId);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function discoverTranscriptSessions(projectRoot = PROJECT_ROOT) {
  const coursesRoot = path.join(projectRoot, 'courses');
  const inventory = [];
  for (const course of readdirSync(coursesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))) {
    const sessionsRoot = path.join(coursesRoot, course, 'sessions');
    if (!existsSync(sessionsRoot)) continue;
    for (const filename of readdirSync(sessionsRoot)
      .filter((name) => /^session_.+\.json$/u.test(name))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
      const absolutePath = path.join(sessionsRoot, filename);
      const session = JSON.parse(readFileSync(absolutePath, 'utf8'));
      const sentences = flattenSentences(session);
      inventory.push({
        course,
        sessionId: filename.replace(/^session_|\.json$/gu, ''),
        path: path.relative(projectRoot, absolutePath),
        sentenceCount: sentences.length,
        characterCount: sentences.reduce((total, sentence) => total + String(sentence.text ?? '').length, 0),
        sourceDigest: computeSourceDigest(session),
        publicationState: session.transcriptStatus ?? session.status ?? session._meta?.status ?? 'unspecified',
      });
    }
  }
  return inventory;
}

export function selectStratifiedPilot(inventory, perCourse = 3) {
  const groups = Object.groupBy(inventory, (item) => item.course);
  const selected = [];
  for (const course of Object.keys(groups).sort((a, b) => a.localeCompare(b, 'zh-Hant'))) {
    const rows = [...groups[course]].sort((a, b) => a.sessionId.localeCompare(b.sessionId, 'en', { numeric: true }));
    if (rows.length <= perCourse) {
      selected.push(...rows);
      continue;
    }
    const indexes = new Set();
    for (let position = 0; position < perCourse; position += 1) {
      indexes.add(Math.round((position * (rows.length - 1)) / (perCourse - 1)));
    }
    selected.push(...[...indexes].sort((a, b) => a - b).map((index) => rows[index]));
  }
  return selected;
}

export function checkpointMatchesRun(saved, run) {
  const keys = [
    'promptVersion',
    'sourceDigest',
    'selectedSentenceCount',
    'batchSize',
    'model',
    'endpoint',
    'maxTokens',
    'runtimeFingerprint',
  ];
  return keys.every((key) => saved?.[key] !== undefined && saved[key] === run?.[key]);
}
