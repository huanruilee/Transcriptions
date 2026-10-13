#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GROUPS = ['mainPoints', 'discussionTopics', 'referenceViews'];
const GROUP_LIMITS = {
  mainPoints: { min: 2, max: 4 },
  discussionTopics: { min: 1, max: 4 },
  referenceViews: { min: 1, max: 4 },
};
const TOTAL_BULLET_LIMITS = { min: 5, max: 8 };
const FORBIDDEN_PHRASES = ['深入探討', '值得反思', '綜上所述', '本文旨在', '作為一個 AI'];
const OBVIOUS_ASR_TERMS = [
  ['四帝', '四諦'],
  ['不欺狂', '不欺誑'],
  ['非蚊症', '飛蚊症'],
  ['非紋症', '飛蚊症'],
  ['肺紋症', '飛蚊症'],
  ['進取因', '近取因'],
  ['耳根支', '耳根識'],
  ['自證支', '自證知'],
  ['猶豫之', '猶豫知'],
  ['無耳觀', '無我觀'],
  ['賤煩惱', '見煩惱'],
  ['棋輪', '臍輪'],
  ['聚生緣', '俱生緣'],
  ['聚生源', '俱生緣'],
  ['普特切羅', '補特伽羅'],
  ['無取蘊', '五取蘊'],
  ['歸依物件', '皈依對象'],
  ['內教勝義無我', '內教許無我'],
  ['本質相同、體性相異', '本質相同、反體相異'],
];
const RESPONSES_HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'minimax_responses_call.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeSessionId(value, fileName) {
  const fromValue = String(value || '').trim();
  if (fromValue) return fromValue.replace(/^session_/, '');
  return fileName.replace(/^session_/, '').replace(/\.json$/, '');
}

export function discoverTranscriptTargets(repoRoot) {
  const coursesRoot = path.join(repoRoot, 'courses');
  const targets = [];

  for (const courseDirectory of fs.readdirSync(coursesRoot).sort()) {
    const courseRoot = path.join(coursesRoot, courseDirectory);
    const coursePath = path.join(courseRoot, 'course.json');
    const sessionsRoot = path.join(courseRoot, 'sessions');
    if (!fs.existsSync(coursePath) || !fs.existsSync(sessionsRoot)) continue;

    const course = readJson(coursePath);
    const listedSessions = Array.isArray(course.sessions) ? course.sessions : [];
    const files = [];

    if (listedSessions.length > 0) {
      for (const session of listedSessions) {
        const fileName = `session_${session.sessionId}.json`;
        const absolutePath = path.join(sessionsRoot, fileName);
        if (!fs.existsSync(absolutePath) || session.transcriptStatus === 'not-transcribed') continue;
        files.push({ absolutePath, fileName, sessionMeta: session });
      }
    } else {
      for (const fileName of fs.readdirSync(sessionsRoot).sort()) {
        if (!/^session_(?!.*_anchored).*\.json$/.test(fileName)) continue;
        const absolutePath = path.join(sessionsRoot, fileName);
        if (!fs.statSync(absolutePath).isFile()) continue;
        files.push({ absolutePath, fileName, sessionMeta: {} });
      }
    }

    for (const file of files) {
      const transcript = readJson(file.absolutePath);
      const sessionId = normalizeSessionId(transcript.sessionId || file.sessionMeta.sessionId, file.fileName);
      const sourceTranscriptId = `${course.courseId || courseDirectory}/session_${sessionId}`;
      targets.push({
        courseDirectory,
        courseId: course.courseId || courseDirectory,
        courseTitle: course.title || courseDirectory,
        sessionId,
        sourceTranscriptId,
        absolutePath: file.absolutePath,
        relativePath: path.relative(repoRoot, file.absolutePath),
        sessionMeta: file.sessionMeta,
      });
    }
  }

  return targets;
}

function flattenSentences(transcript) {
  const sentences = [];
  for (const [paragraphIndex, paragraph] of (transcript.paragraphs || []).entries()) {
    const heading = String(paragraph.heading || '').trim();
    for (const [sentenceIndex, sentence] of (paragraph.sentences || []).entries()) {
      const text = String(sentence.text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const id = String(sentence.id || `p${paragraphIndex + 1}-s${sentenceIndex + 1}`);
      sentences.push({ id, text, heading, paragraphIndex });
    }
  }
  return sentences;
}

export function computeSourceDigest(transcript) {
  const source = flattenSentences(transcript).map(({ id, text, heading }) => ({ id, text, heading }));
  return `sha256:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`;
}

function chunkCharacterCount(sentences, headings) {
  return headings.join('\n').length
    + sentences.reduce((total, sentence) => total + sentence.id.length + sentence.text.length + 4, 0);
}

export function buildSourceChunks(transcript, { maxCharacters = 40_000 } = {}) {
  const source = flattenSentences(transcript);
  const chunks = [];
  let current = [];

  const flush = () => {
    if (current.length === 0) return;
    const paragraphHeadings = [...new Set(current.map((item) => item.heading).filter(Boolean))];
    chunks.push({
      sentences: current.map(({ id, text }) => ({ id, text })),
      paragraphHeadings,
      characterCount: chunkCharacterCount(current, paragraphHeadings),
    });
    current = [];
  };

  for (const sentence of source) {
    const candidate = [...current, sentence];
    const headings = [...new Set(candidate.map((item) => item.heading).filter(Boolean))];
    if (current.length > 0 && chunkCharacterCount(candidate, headings) > maxCharacters) flush();
    current.push(sentence);
  }
  flush();
  return chunks;
}

function overviewItems(overview) {
  return GROUPS.flatMap((group) => (overview[group] || []).map((item, index) => ({ group, index, item })));
}

function makeError(code, detail) {
  return { code, detail };
}

export function isMiniMaxQuotaError(error) {
  const message = String(error?.message || error || '');
  return /(?:^|\D)(?:2056|2062)(?:\D|$)/.test(message)
    || message.includes('Token Plan 用量上限')
    || message.includes('Token Plan 速率限制');
}

export function normalizeObviousAsrTerms(candidate) {
  const normalized = structuredClone(candidate);
  for (const { item } of overviewItems(normalized)) {
    if (typeof item?.text !== 'string') continue;
    for (const [wrong, correct] of OBVIOUS_ASR_TERMS) {
      item.text = item.text.replaceAll(wrong, correct);
    }
  }
  return normalized;
}

function semanticBulletFingerprint(value) {
  return String(value || '')
    .replace(/[，。；：、？！?「」『』（）()\s]/g, '')
    .replace(/關於|請問|何者正確|到底|想著|的直接境|直接境|是否|呢/g, '');
}

function isNearDuplicateBullet(first, second) {
  const left = semanticBulletFingerprint(first);
  const right = semanticBulletFingerprint(second);
  if (left === right) return left.length > 0;
  if (Math.min(left.length, right.length) < 8) return false;
  const bigrams = (value) => new Set(
    Array.from({ length: value.length - 1 }, (_unused, index) => value.slice(index, index + 2)),
  );
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  const overlap = [...leftBigrams].filter((gram) => rightBigrams.has(gram)).length;
  return overlap / Math.min(leftBigrams.size, rightBigrams.size) >= 0.8;
}

export function pruneNearDuplicateItems(candidate) {
  const pruned = structuredClone(candidate);
  const remappedReview = [];
  const reviewByKey = new Map((pruned.review?.items || [])
    .map((item) => [`${item.group}:${item.index}`, item]));

  for (const group of GROUPS) {
    const retained = [];
    for (const [originalIndex, item] of (pruned[group] || []).entries()) {
      if (retained.some((entry) => isNearDuplicateBullet(entry.text, item.text))) continue;
      const index = retained.length;
      retained.push(item);
      const review = reviewByKey.get(`${group}:${originalIndex}`);
      if (review) remappedReview.push({ ...review, group, index });
    }
    pruned[group] = retained;
  }
  if (pruned.review) pruned.review.items = remappedReview;
  return pruned;
}

export function normalizeCandidateEvidence(candidate, transcript = null) {
  const normalized = pruneNearDuplicateItems(normalizeObviousAsrTerms(candidate));
  const validIds = transcript
    ? new Set(flattenSentences(transcript).map((sentence) => sentence.id))
    : null;
  for (const group of GROUPS) {
    for (const item of normalized[group] || []) {
      const seen = new Set();
      item.evidence = (Array.isArray(item.evidence) ? item.evidence : [])
        .filter((evidence) => {
          let sentenceId = String(evidence?.sentenceId || '').trim();
          const repaired = sentenceId.replace(/^sg-(?=\d+$)/, 'seg-');
          if (validIds && !validIds.has(sentenceId) && validIds.has(repaired)) sentenceId = repaired;
          if (!sentenceId || seen.has(sentenceId) || (validIds && !validIds.has(sentenceId))) return false;
          seen.add(sentenceId);
          evidence.sentenceId = sentenceId;
          return true;
        })
        .slice(0, 3);
    }
    normalized[group] = (normalized[group] || [])
      .filter((item) => item.evidence.length > 0)
      .slice(0, GROUP_LIMITS[group].max);
  }
  return normalized;
}

export function hydrateEvidenceQuotes(candidate, transcript) {
  const hydrated = structuredClone(candidate);
  const sentenceMap = new Map(flattenSentences(transcript).map((sentence) => [sentence.id, sentence.text]));
  for (const { item } of overviewItems(hydrated)) {
    for (const evidence of item.evidence || []) {
      const sourceText = sentenceMap.get(String(evidence?.sentenceId || ''));
      if (sourceText) evidence.quote = sourceText;
    }
  }
  return hydrated;
}

export function validateContentOverview(
  overview,
  transcript,
  { sourceTranscriptId } = {},
  { requireCoverage = true } = {},
) {
  const errors = [];
  const expectedSourceDigest = computeSourceDigest(transcript);
  const sentenceMap = new Map(flattenSentences(transcript).map((sentence) => [sentence.id, sentence.text]));

  if (!overview || typeof overview !== 'object') {
    return { errors: [makeError('INVALID_OVERVIEW', 'contentOverview must be an object')], expectedSourceDigest };
  }
  if (overview.schemaVersion !== 1) errors.push(makeError('SCHEMA_VERSION', 'schemaVersion must be 1'));
  if (overview.sourceTranscriptId !== sourceTranscriptId) {
    errors.push(makeError('SOURCE_TRANSCRIPT_ID_MISMATCH', overview.sourceTranscriptId));
  }
  if (overview.sourceDigest !== expectedSourceDigest) {
    errors.push(makeError('SOURCE_DIGEST_MISMATCH', overview.sourceDigest));
  }
  const isMiniMaxGenerated = overview.generatedBy === 'MiniMax-M3';
  const isDocumentedManualException = overview.generatedBy === 'Codex-manual-exception'
    && String(overview.generationException || '').startsWith('MiniMax input new_sensitive (1026)');
  if (!isMiniMaxGenerated && !isDocumentedManualException) {
    errors.push(makeError('GENERATOR_MISMATCH', overview.generatedBy));
  }

  for (const group of GROUPS) {
    const items = overview[group];
    const limits = GROUP_LIMITS[group];
    const minimum = requireCoverage ? limits.min : 0;
    if (!Array.isArray(items) || items.length < minimum || items.length > limits.max) {
      errors.push(makeError('INVALID_GROUP_LENGTH', `${group}:${items?.length ?? 'missing'}`));
      continue;
    }
    const seen = new Set();
    const priorTexts = [];
    for (const [index, item] of items.entries()) {
      const text = String(item?.text || '').replace(/\s+/g, ' ').trim();
      if (!text) errors.push(makeError('EMPTY_BULLET', `${group}:${index}`));
      if (seen.has(text)) errors.push(makeError('DUPLICATE_BULLET', `${group}:${index}`));
      if (priorTexts.some((prior) => isNearDuplicateBullet(prior, text))) {
        errors.push(makeError('NEAR_DUPLICATE_BULLET', `${group}:${index}`));
      }
      seen.add(text);
      priorTexts.push(text);
      for (const phrase of FORBIDDEN_PHRASES) {
        if (text.includes(phrase)) errors.push(makeError('FORBIDDEN_PHRASE', `${group}:${index}:${phrase}`));
      }
      for (const [wrong, correct] of OBVIOUS_ASR_TERMS) {
        if (text.includes(wrong)) {
          errors.push(makeError('OBVIOUS_ASR_TERM', `${group}:${index}:${wrong}->${correct}`));
        }
      }
      if (!Array.isArray(item?.evidence) || item.evidence.length < 1 || item.evidence.length > 3) {
        errors.push(makeError('INVALID_EVIDENCE_COUNT', `${group}:${index}`));
        continue;
      }
      for (const evidence of item.evidence) {
        const actual = sentenceMap.get(String(evidence?.sentenceId || ''));
        if (!actual) {
          errors.push(makeError('UNKNOWN_EVIDENCE_ID', `${group}:${index}:${evidence?.sentenceId}`));
        } else if (String(evidence?.quote || '').trim() !== actual) {
          errors.push(makeError('EVIDENCE_QUOTE_MISMATCH', `${group}:${index}:${evidence?.sentenceId}`));
        }
      }
    }
  }

  const priorCrossGroupItems = [];
  for (const group of GROUPS) {
    for (const [index, item] of (Array.isArray(overview[group]) ? overview[group] : []).entries()) {
      const text = String(item?.text || '').replace(/\s+/g, ' ').trim();
      const duplicate = priorCrossGroupItems.find((prior) =>
        prior.group !== group && isNearDuplicateBullet(prior.text, text));
      if (duplicate) {
        errors.push(makeError(
          'CROSS_GROUP_NEAR_DUPLICATE_BULLET',
          `${duplicate.group}:${duplicate.index}->${group}:${index}`,
        ));
      }
      priorCrossGroupItems.push({ group, index, text });
    }
  }

  if (requireCoverage) {
    const totalItems = GROUPS.reduce(
      (total, group) => total + (Array.isArray(overview[group]) ? overview[group].length : 0),
      0,
    );
    if (totalItems < TOTAL_BULLET_LIMITS.min || totalItems > TOTAL_BULLET_LIMITS.max) {
      errors.push(makeError('INVALID_TOTAL_BULLET_COUNT', String(totalItems)));
    }
  }

  return { errors, expectedSourceDigest };
}

export function finalizeOverviewReview(candidate, review) {
  const finalized = structuredClone(candidate);
  const expected = overviewItems(candidate).map(({ group, index }) => `${group}:${index}`);
  const verdicts = new Map((review?.items || []).map((item) => [`${item.group}:${item.index}`, item.verdict]));
  const allSupported = expected.length > 0
    && expected.every((key) => verdicts.get(key) === 'supported')
    && verdicts.size === expected.length;
  finalized.status = allSupported ? 'ai-reviewed' : 'needs-review';
  finalized.review = {
    reviewedBy: 'MiniMax-M3',
    items: Array.isArray(review?.items) ? review.items : [],
  };
  return finalized;
}

export function pruneUnsupportedItems(candidate, review) {
  const pruned = structuredClone(candidate);
  const verdicts = new Map((review?.items || []).map((item) => [`${item.group}:${item.index}`, item]));
  const retainedReviewItems = [];

  for (const group of GROUPS) {
    const retained = [];
    for (const [originalIndex, item] of (pruned[group] || []).entries()) {
      const verdict = verdicts.get(`${group}:${originalIndex}`);
      if (verdict?.verdict !== 'supported') continue;
      const index = retained.length;
      retained.push(item);
      retainedReviewItems.push({ ...verdict, group, index });
    }
    pruned[group] = retained;
  }

  return {
    candidate: pruned,
    review: { reviewedBy: 'MiniMax-M3', items: retainedReviewItems },
  };
}

export function auditContentOverviews(targets) {
  const result = {
    total: targets.length,
    valid: 0,
    missing: [],
    needsReview: [],
    invalid: [],
    complete: false,
  };

  for (const target of targets) {
    const transcript = readJson(target.absolutePath);
    const overview = transcript.contentOverview;
    if (!overview) {
      result.missing.push(target.sourceTranscriptId);
      continue;
    }
    const validation = validateContentOverview(overview, transcript, target);
    if (validation.errors.length > 0) {
      result.invalid.push({
        sourceTranscriptId: target.sourceTranscriptId,
        errors: validation.errors,
      });
      continue;
    }
    const computedStatus = finalizeOverviewReview(overview, overview.review).status;
    if (overview.status !== 'ai-reviewed' || computedStatus !== 'ai-reviewed') {
      result.needsReview.push(target.sourceTranscriptId);
      continue;
    }
    result.valid += 1;
  }
  result.complete = result.valid === result.total;
  return result;
}

export function isTargetOverviewComplete(target) {
  const transcript = readJson(target.absolutePath);
  const overview = transcript.contentOverview;
  if (!overview || overview.status !== 'ai-reviewed') return false;
  const validation = validateContentOverview(overview, transcript, target);
  if (validation.errors.length > 0) return false;
  return finalizeOverviewReview(overview, overview.review).status === 'ai-reviewed';
}

function transcriptRisk(target) {
  const transcript = readJson(target.absolutePath);
  const sentences = (transcript.paragraphs || []).flatMap((paragraph) => paragraph.sentences || []);
  const flagged = sentences.filter((sentence) => sentence.reviewNeeded || sentence.uncertainty).length;
  return {
    target,
    sentenceCount: sentences.length,
    flaggedRatio: sentences.length ? flagged / sentences.length : 0,
  };
}

export function selectStratifiedSample(targets, { rate = 0.1, minPerCourse = 3 } = {}) {
  const selected = [];
  const courses = Object.groupBy(targets, (target) => target.courseId);

  for (const courseTargets of Object.values(courses)) {
    const scored = courseTargets.map(transcriptRisk);
    const desired = Math.min(scored.length, Math.max(minPerCourse, Math.ceil(scored.length * rate)));
    const chosen = new Map();
    const add = (entry) => {
      if (entry) chosen.set(entry.target.sourceTranscriptId, entry.target);
    };
    add([...scored].sort((a, b) => a.sentenceCount - b.sentenceCount)[0]);
    add([...scored].sort((a, b) => b.sentenceCount - a.sentenceCount)[0]);
    add([...scored].sort((a, b) => b.flaggedRatio - a.flaggedRatio)[0]);

    const deterministicRemainder = [...scored].sort((a, b) => {
      const hashA = createHash('sha256').update(a.target.sourceTranscriptId).digest('hex');
      const hashB = createHash('sha256').update(b.target.sourceTranscriptId).digest('hex');
      return hashA.localeCompare(hashB);
    });
    for (const entry of deterministicRemainder) {
      if (chosen.size >= desired) break;
      add(entry);
    }
    selected.push(...chosen.values());
  }

  return selected.sort((a, b) => a.sourceTranscriptId.localeCompare(b.sourceTranscriptId));
}

export function selectShard(targets, { index = 0, count = 1 } = {}) {
  if (!Number.isInteger(count) || count < 1) throw new Error('shard count must be a positive integer');
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error('shard index must be an integer between 0 and shard count - 1');
  }
  return targets.filter((_target, targetIndex) => targetIndex % count === index);
}

function coverageRetryRequest(acceptedByGroup) {
  const counts = Object.fromEntries(GROUPS.map((group) => [group, acceptedByGroup[group].size]));
  const requestedCounts = Object.fromEntries(GROUPS.map((group) => [group, 0]));
  let projectedTotal = GROUPS.reduce((total, group) => total + counts[group], 0);
  const add = (group, count = 1) => {
    const headroom = GROUP_LIMITS[group].max - counts[group] - requestedCounts[group];
    const added = Math.max(0, Math.min(count, headroom));
    requestedCounts[group] += added;
    projectedTotal += added;
  };

  for (const group of GROUPS) {
    add(group, Math.max(0, GROUP_LIMITS[group].min - counts[group]));
  }
  const preferredOrder = ['mainPoints', 'discussionTopics', 'referenceViews', 'mainPoints'];
  while (projectedTotal < TOTAL_BULLET_LIMITS.min) {
    const group = preferredOrder.find(
      (candidate) => counts[candidate] + requestedCounts[candidate] < GROUP_LIMITS[candidate].max,
    );
    if (!group) break;
    add(group, 1);
  }

  const requestedGroups = GROUPS.filter((group) => requestedCounts[group] > 0);
  return { requestedGroups, requestedCounts };
}

function parseModelJson(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(text);
  if (typeof parsed?.content === 'string') return parseModelJson(parsed.content);
  return parsed;
}

export function buildMiniMaxResponsesRequest(messages, maxOutputTokens, promptCacheKey, {
  reasoningEffort = null,
} = {}) {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const conversation = messages.filter((message) => message.role !== 'system');
  const input = conversation.length === 1 && conversation[0].role === 'user'
    ? conversation[0].content
    : conversation;
  const request = {
    model: 'MiniMax-M3',
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
    temperature: 0.1,
    top_p: 0.9,
    tool_choice: 'none',
    prompt_cache_key: promptCacheKey,
  };
  if (reasoningEffort) request.reasoning = { effort: reasoningEffort };
  return request;
}

function callMiniMax(messages, maxOutputTokens, promptCacheKey, options = {}) {
  const request = buildMiniMaxResponsesRequest(messages, maxOutputTokens, promptCacheKey, options);
  const result = spawnSync(process.execPath, [RESPONSES_HELPER], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `MiniMax Responses helper exited ${result.status}`);
  const response = JSON.parse(result.stdout);
  return parseModelJson(response.outputText);
}

export function buildModelSourceText(transcript) {
  const lines = [];
  for (const [paragraphIndex, paragraph] of (transcript.paragraphs || []).entries()) {
    const heading = String(paragraph.heading || '').trim();
    if (heading) lines.push(`\n## ${heading}`);
    for (const [sentenceIndex, sentence] of (paragraph.sentences || []).entries()) {
      const text = String(sentence.text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const id = String(sentence.id || `p${paragraphIndex + 1}-s${sentenceIndex + 1}`);
      lines.push(`[${id}] ${text}`);
    }
    for (const item of paragraph.teacherSummary?.items || []) lines.push(`[教師摘要] ${item}`);
  }
  for (const question of transcript.discussionQuestions || []) {
    lines.push(`\n[討論題] ${question.displayQuestion || question.rawQuestion || ''}`);
    for (const item of question.teacherSummary?.items || []) lines.push(`[教師摘要] ${item}`);
  }
  return lines.join('\n').trim();
}

function exactEvidenceContext(transcript, candidate) {
  const source = flattenSentences(transcript);
  const indexById = new Map(source.map((sentence, index) => [sentence.id, index]));
  const cited = new Set(overviewItems(candidate).flatMap(({ item }) => (item.evidence || []).map((e) => e.sentenceId)));
  const contextIndexes = new Set();
  for (const id of cited) {
    const index = indexById.get(String(id));
    if (index === undefined) continue;
    for (const offset of [-1, 0, 1]) {
      if (source[index + offset]) contextIndexes.add(index + offset);
    }
  }
  return [...contextIndexes].sort((a, b) => a - b).map((index) => source[index]);
}

export function buildOverviewGenerationMessages(target, transcript, retryFeedback = null) {
  const sourceText = buildModelSourceText(transcript);
  const sourceSentences = flattenSentences(transcript);
  const idBoundary = sourceSentences.length > 0
    ? `${sourceSentences[0].id} 至 ${sourceSentences.at(-1).id}`
    : '無';
  const missingGroups = retryFeedback?.missingGroups?.filter((group) => GROUPS.includes(group)) || [];
  const requestedRetryGroups = retryFeedback?.requestedGroups?.filter((group) => GROUPS.includes(group)) || [];
  const targetedGroups = [...new Set([...missingGroups, ...requestedRetryGroups])];
  const requestedGroups = targetedGroups.length > 0 ? targetedGroups : GROUPS;
  const placeholderId = sourceSentences[0]?.id || 'seg-0001';
  const example = {
    mainPoints: requestedGroups.includes('mainPoints')
      ? [{ text: '主要內容', evidence: [{ sentenceId: placeholderId }] }]
      : [],
    discussionTopics: requestedGroups.includes('discussionTopics')
      ? [{ text: '討論議題', evidence: [{ sentenceId: placeholderId }] }]
      : [],
    referenceViews: requestedGroups.includes('referenceViews')
      ? [{ text: '參考觀點', evidence: [{ sentenceId: placeholderId }] }]
      : [],
  };
  const acceptedTextInstruction = retryFeedback?.acceptedItems
    ? `已通過條目如下，補充時不可重複或近義改寫：${JSON.stringify(retryFeedback.acceptedItems)}。`
    : '';
  const requestedCountInstruction = targetedGroups
    .map((group) => `${group} 新增 ${Math.max(1, Number(retryFeedback?.requestedCounts?.[group]) || 1)} 點`)
    .join('；');
  const missingGroupInstruction = targetedGroups.length > 0
    ? `本輪只補充區塊：${targetedGroups.join(', ')}；數量要求：${requestedCountInstruction}；其他區塊輸出空陣列，已通過內容會由程式合併。只提供新的、最容易被完整原句直接證成的簡單條目。${acceptedTextInstruction}`
    : '主要內容 2-3 點；討論議題 1-2 點；參考答案或觀點 1-2 點。';
  const lateRecoveryInstruction = targetedGroups.length > 0 && Number(retryFeedback?.attempt || 0) >= 3
    ? '最後修復模式：每一指定區塊只產生 1 點。mainPoints 或 referenceViews 應優先直接節錄或僅微改單一語意完整的陳述句；discussionTopics 應優先取單一完整問句。不得跨句綜合或補充因果、範圍與立場。'
    : '';
  const repairInstruction = retryFeedback
    ? `\n\n上一版未通過嚴格引證檢查。請改寫未通過條目，不只是更換引證 ID。每個主張必須能由引用原句直接、完整證成。失敗資訊：${JSON.stringify(retryFeedback)}`
    : '';
  return [
    {
      role: 'system',
      content: `你是佛典逐字稿摘要編輯。只輸出合法 JSON，不要 markdown，不要解釋或展示推理。不得加入逐字稿沒有的教義、結論或人物。所有文字使用繁體中文。摘要須校正明確且唯一的 ASR 訛字，至少包括：${OBVIOUS_ASR_TERMS.map(([wrong, correct]) => `${wrong}→${correct}`).join('、')}；原始引證仍由程式保留，不可為了正字而捏造內容。`,
    },
    {
      role: 'user',
      content: `根據完整逐字稿產生簡潔的閱讀前導讀。${missingGroupInstruction}${lateRecoveryInstruction}每點 15-55 字，只寫一個能由引句完整證成的核心主張，不要將多個子結論、原因或延伸細節塞在同一點。主要內容必須是陳述句，每點優先貼近一個資訊完整的原句作忠實釋義，不得跨段綜合。討論議題只寫原文明確提出或實質討論的問題。參考觀點只寫某位講者或討論者明確說出的答案、主張或取捨，優先忠實釋義一個完整原句。必須附 1-3 個不重複的原句 sentenceId，絕不可超過 3 個；每個主張必須能被這些原句直接、完整證成，不可把提問寫成答案或拼湊原文沒有的結論。引句文字將由本地程式依 ID 回填，請勿輸出 quote。只能逐字複製下方出現的 ID，不可改寫或自創；本篇共 ${sourceSentences.length} 句，ID 邊界為 ${idBoundary}。避免空泛套語。下列 JSON 只示範欄位結構，text 與 sentenceId 必須依下方逐字稿改寫，不得照抄：${JSON.stringify(example)}。\n\n課程：${target.courseTitle}\n講次：${target.sessionId}\n來源 ID：${target.sourceTranscriptId}\n\n${sourceText}${repairInstruction}`,
    },
  ];
}

export function generateOverviewCandidate(target, transcript, retryFeedback = null) {
  const sourceDigest = computeSourceDigest(transcript);
  const messages = buildOverviewGenerationMessages(target, transcript, retryFeedback);
  const body = callMiniMax(messages, 4096, 'transcriptions-overview-generation-v1');
  return {
    schemaVersion: 1,
    status: 'candidate',
    sourceTranscriptId: target.sourceTranscriptId,
    sourceDigest,
    generatedBy: 'MiniMax-M3',
    generatedAt: new Date().toISOString(),
    mainPoints: body.mainPoints,
    discussionTopics: body.discussionTopics,
    referenceViews: body.referenceViews,
  };
}

export function reviewOverviewCandidate(candidate, transcript) {
  const context = exactEvidenceContext(transcript, candidate);
  const reviewInput = overviewItems(candidate).map(({ group, index, item }) => ({ group, index, ...item }));
  return callMiniMax([
    {
      role: 'system',
      content: `你是獨立的佛典摘要引證審查員。只輸出合法 JSON，不要 markdown，不要展示推理。只能判 supported 或 unsupported。對 mainPoints 與 referenceViews：先在內部將每點拆成所有實質主張，每一個主張都必須被引句或相鄰句直接支持；只要有一個細節、因果、範圍或立場未被證成，就判 unsupported。對 discussionTopics：只要原文明確提出或實質討論該問題即可 supported，不要求原文逐字出現摘要中的問句。「對」、「此地的」等無資訊應答不算證據；ASR 文字不明時從嚴判 unsupported。候選若把下列唯一明確的 ASR 訛字校成正字，不應只因候選與原始引句字面不同而判 unsupported：${OBVIOUS_ASR_TERMS.map(([wrong, correct]) => `${wrong}→${correct}`).join('、')}。`,
    },
    {
      role: 'user',
      content: `逐點核對候選摘要是否由所附原句及相鄰句完整支持，也檢查是否扭曲立場、把提問誤寫成答案、或加入原文沒有的教義。不可因為主題大致相關就判 supported；摘要比證據更具體時必須判 unsupported。輸出 {"items":[{"group":"mainPoints|discussionTopics|referenceViews","index":0,"verdict":"supported|unsupported","reason":"30字內"}]}，每點恰好一筆。\n\n候選：${JSON.stringify(reviewInput)}\n\n引用上下文：${JSON.stringify(context)}`,
    },
  ], 8192, 'transcriptions-overview-review-v2', { reasoningEffort: 'low' });
}

function reportPathFor(repoRoot, target) {
  const safe = target.sourceTranscriptId.replace(/[^\p{L}\p{N}._-]+/gu, '__');
  return path.join(repoRoot, 'reports', 'content-overviews', `${safe}.json`);
}

export function generateAndReviewTarget(repoRoot, target, {
  apply = false,
  retries = 4,
  generateCandidateFn = generateOverviewCandidate,
  reviewCandidateFn = reviewOverviewCandidate,
} = {}) {
  const transcript = readJson(target.absolutePath);
  const existingOverview = transcript.contentOverview;
  let finalized = null;
  let attempts = Number(existingOverview?.attemptCount) || 0;
  let lastError = null;
  let retryFeedback = null;
  const acceptedByGroup = Object.fromEntries(GROUPS.map((group) => [group, new Map()]));

  const composeAccepted = (base) => {
    const candidate = structuredClone(base);
    const reviewItems = [];
    for (const group of GROUPS) {
      const accepted = [...acceptedByGroup[group].values()];
      candidate[group] = accepted.map((entry) => structuredClone(entry.item));
      accepted.forEach((entry, index) => {
        reviewItems.push({ ...entry.review, group, index, verdict: 'supported' });
      });
    }
    return finalizeOverviewReview(candidate, {
      reviewedBy: 'MiniMax-M3',
      items: reviewItems,
    });
  };

  const makeCoverageFeedback = (attempt, validationErrors = []) => {
    const coverageRequest = coverageRetryRequest(acceptedByGroup);
    return {
      attempt,
      validationErrors,
      missingGroups: GROUPS.filter((group) => acceptedByGroup[group].size === 0),
      requestedGroups: coverageRequest.requestedGroups,
      requestedCounts: coverageRequest.requestedCounts,
      acceptedItems: Object.fromEntries(GROUPS.map((group) => [
        group,
        [...acceptedByGroup[group].keys()],
      ])),
    };
  };

  if (existingOverview) {
    const normalizedExistingOverview = normalizeCandidateEvidence(existingOverview, transcript);
    const structural = validateContentOverview(normalizedExistingOverview, transcript, target, {
      requireCoverage: false,
    });
    if (structural.errors.length === 0) {
      const reviewByKey = new Map((normalizedExistingOverview.review?.items || [])
        .map((item) => [`${item.group}:${item.index}`, item]));
      for (const group of GROUPS) {
        for (const [index, item] of normalizedExistingOverview[group].entries()) {
          const review = reviewByKey.get(`${group}:${index}`);
          if (review?.verdict !== 'supported') continue;
          acceptedByGroup[group].set(item.text, {
            item: structuredClone(item),
            review,
          });
        }
      }

      let acceptedTotal = GROUPS.reduce((total, group) => total + acceptedByGroup[group].size, 0);
      for (const group of ['discussionTopics', 'referenceViews', 'mainPoints']) {
        while (acceptedTotal > TOTAL_BULLET_LIMITS.max
          && acceptedByGroup[group].size > GROUP_LIMITS[group].min) {
          const lastKey = [...acceptedByGroup[group].keys()].at(-1);
          acceptedByGroup[group].delete(lastKey);
          acceptedTotal -= 1;
        }
      }

      finalized = composeAccepted(normalizedExistingOverview);
      const seededValidation = validateContentOverview(finalized, transcript, target);
      if (seededValidation.errors.length > 0) {
        finalized.status = 'needs-review';
        finalized.validationErrors = seededValidation.errors;
        retryFeedback = makeCoverageFeedback(0, seededValidation.errors);
      }
    }
  }

  for (let attempt = 1;
    attempt <= retries + 1 && finalized?.status !== 'ai-reviewed';
    attempt += 1) {
    attempts = attempt;
    try {
      const normalized = normalizeCandidateEvidence(
        generateCandidateFn(target, transcript, retryFeedback),
        transcript,
      );
      for (const group of GROUPS) {
        if (normalized[group].length > 0 || acceptedByGroup[group].size === 0) continue;
        normalized[group] = [...acceptedByGroup[group].values()].map((entry) => structuredClone(entry.item));
      }
      const candidate = hydrateEvidenceQuotes(normalized, transcript);
      const candidateValidation = validateContentOverview(candidate, transcript, target, {
        requireCoverage: false,
      });
      if (candidateValidation.errors.length > 0) {
        candidate.status = 'needs-review';
        candidate.validationErrors = candidateValidation.errors;
        finalized = candidate;
        retryFeedback = { attempt, validationErrors: candidateValidation.errors };
        continue;
      }
      const rawReview = reviewCandidateFn(candidate, transcript);
      const pruned = pruneUnsupportedItems(candidate, rawReview);
      const prunedReview = new Map((pruned.review.items || [])
        .map((item) => [`${item.group}:${item.index}`, item]));
      for (const group of GROUPS) {
        for (const [index, item] of (pruned.candidate[group] || []).entries()) {
          if (acceptedByGroup[group].size >= GROUP_LIMITS[group].max
            || acceptedByGroup[group].has(item.text)) continue;
          acceptedByGroup[group].set(item.text, {
            item,
            review: prunedReview.get(`${group}:${index}`),
          });
        }
      }
      finalized = composeAccepted(candidate);
      const finalValidation = validateContentOverview(finalized, transcript, target);
      if (finalValidation.errors.length > 0) {
        finalized.status = 'needs-review';
        finalized.validationErrors = finalValidation.errors;
      }
      if (finalized.status === 'ai-reviewed') break;
      retryFeedback = {
        ...makeCoverageFeedback(attempt, finalized.validationErrors || []),
        unsupportedItems: (rawReview?.items || [])
          .filter((item) => item.verdict !== 'supported')
          .map(({ group, index, reason }) => ({
            group,
            index,
            text: candidate[group]?.[index]?.text,
            reason,
          })),
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (!finalized && lastError) throw lastError;
  if (!finalized) throw new Error(`No overview candidate produced for ${target.sourceTranscriptId}`);
  finalized.attemptCount = attempts;

  const reportPath = reportPathFor(repoRoot, target);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(finalized, null, 2)}\n`, 'utf8');

  if (apply && finalized.status === 'ai-reviewed') {
    transcript.contentOverview = finalized;
    fs.writeFileSync(target.absolutePath, `${JSON.stringify(transcript, null, 2)}\n`, 'utf8');
  }
  return { target, overview: finalized, reportPath, attempts };
}

function parseArgs(argv) {
  const args = {
    apply: false,
    inventory: false,
    audit: false,
    sample: false,
    all: false,
    session: null,
    limit: Infinity,
    verbose: false,
    force: false,
    shardIndex: 0,
    shardCount: 1,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') args.apply = true;
    else if (value === '--inventory') args.inventory = true;
    else if (value === '--audit') args.audit = true;
    else if (value === '--sample') args.sample = true;
    else if (value === '--verbose') args.verbose = true;
    else if (value === '--all') args.all = true;
    else if (value === '--force') args.force = true;
    else if (value === '--shard-index') args.shardIndex = Number(argv[++index]);
    else if (value === '--shard-count') args.shardCount = Number(argv[++index]);
    else if (value === '--session') args.session = argv[++index];
    else if (value === '--limit') args.limit = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = parseArgs(process.argv.slice(2));
  const targets = discoverTranscriptTargets(repoRoot);
  if (args.inventory) {
    const courses = Object.groupBy(targets, (target) => target.courseTitle);
    console.log(JSON.stringify({ total: targets.length, courses: Object.fromEntries(Object.entries(courses).map(([key, value]) => [key, value.length])) }, null, 2));
    return;
  }
  if (args.audit) {
    const audit = auditContentOverviews(targets);
    if (args.verbose) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(JSON.stringify({
        total: audit.total,
        valid: audit.valid,
        missing: audit.missing.length,
        needsReview: audit.needsReview.length,
        invalid: audit.invalid.length,
        complete: audit.complete,
      }, null, 2));
    }
    if (!audit.complete) process.exitCode = 1;
    return;
  }
  if (args.sample) {
    const sample = selectStratifiedSample(targets);
    const courses = Object.fromEntries(Object.entries(Object.groupBy(sample, (target) => target.courseTitle))
      .map(([course, items]) => [course, items.length]));
    console.log(JSON.stringify({
      total: sample.length,
      courses,
      sourceTranscriptIds: sample.map((target) => target.sourceTranscriptId),
    }, null, 2));
    return;
  }
  const selectedBeforeShard = args.session
    ? targets.filter((target) => target.sourceTranscriptId === args.session || target.relativePath.includes(args.session))
    : (args.all ? targets : []);
  const selected = selectShard(selectedBeforeShard, { index: args.shardIndex, count: args.shardCount });
  if (selected.length === 0) throw new Error('Use --inventory, --audit, --sample, --all, or --session <course/session>.');

  const runnable = args.force ? selected : selected.filter((target) => !isTargetOverviewComplete(target));
  const skipped = selected.length - runnable.length;
  if (skipped > 0) console.log(`[resume] skipped ${skipped} already reviewed transcript(s)`);

  let failures = 0;
  const batch = runnable.slice(0, args.limit);
  for (const [index, target] of batch.entries()) {
    try {
      const result = generateAndReviewTarget(repoRoot, target, { apply: args.apply });
      console.log(`[${index + 1}/${batch.length}] ${target.sourceTranscriptId} ${result.overview.status}`);
      if (result.overview.status !== 'ai-reviewed') failures += 1;
    } catch (error) {
      failures += 1;
      console.error(`[${index + 1}] ${target.sourceTranscriptId} ERROR ${error.message}`);
      if (isMiniMaxQuotaError(error)) {
        console.error('[halt] MiniMax Token Plan quota is exhausted or rate-limited; resume after quota reset.');
        process.exitCode = 4;
        break;
      }
    }
  }
  if (failures > 0 && !process.exitCode) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
