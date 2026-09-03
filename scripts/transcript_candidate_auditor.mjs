#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RULES = [
  {
    id: 'eye-consciousness-homophone',
    pattern: /現影像的演示/g,
    replacement: '現影像的眼識',
    confidence: 'CONFIRMED',
    evidence: ['audio 2218-2258s; source_text/page_100.txt:3: 見影像、谷響等之根識']
  },
  {
    id: 'standalone-eye-consciousness',
    pattern: /^演示(?=[，。！？；：]|$)/g,
    replacement: '眼識',
    confidence: 'CONFIRMED',
    evidence: ['audio 2218-2258s; source context: 見影像之根識']
  },
  {
    id: 'grasp-face-image',
    pattern: /直連面的影像為連面/g,
    replacement: '執臉面的影像為臉面',
    confidence: 'CONFIRMED',
    evidence: ['audio 2218-2258s consistently decodes 執臉面的影像為臉面']
  },
  {
    id: 'grasp-mirage',
    pattern: /執言/g,
    replacement: '執陽焰',
    confidence: 'CONFIRMED',
    evidence: ['audio 2218-2258s; source_text/page_098.txt:18: 陽焰']
  },
  {
    id: 'grasp-echo',
    pattern: /直骨身的/g,
    replacement: '執谷響的',
    confidence: 'CONFIRMED',
    evidence: ['audio 2218-2258s; source terminology: 谷響']
  },
  {
    id: 'mistaken-consciousness',
    pattern: /(?:演示|影像)都是顛倒識/g,
    replacement: '眼識都是顛倒識',
    confidence: 'CONFIRMED',
    evidence: ['audio 2218-2258s; source_text/page_100.txt:3-7: 根識']
  },
  {
    id: 'p瓶-homophone',
    pattern: /平子/g,
    replacement: '瓶子',
    confidence: 'CONFIRMED',
    evidence: ['course terminology: 瓶等諸法 / 瓶子']
  },
  {
    id: 'avidya-homophone',
    pattern: /魚吃/g,
    replacement: '愚癡',
    confidence: 'CONFIRMED',
    evidence: ['source term: 無明愚癡']
  },
  {
    id: 'establish-homophone',
    pattern: /安利/g,
    replacement: '安立',
    confidence: 'CONFIRMED',
    evidence: ['source term: 安立為諦'],
    when: ({ suggestedText }) => /(?:世俗|為地|為諦|前面)/.test(suggestedText)
  },
  {
    id: 'truth-before-consciousness',
    pattern: /前面是地(?=[，。！？；：]|$)/g,
    replacement: '前面是諦',
    confidence: 'CONFIRMED',
    evidence: ['doctrinal context: 於何世俗前為諦']
  },
  {
    id: 'not-truth-before-consciousness',
    pattern: /前面不是地(?=[，。！？；：]|$)/g,
    replacement: '前面不是諦',
    confidence: 'CONFIRMED',
    evidence: ['doctrinal context: 於何世俗前不諦']
  },
  {
    id: 'established-as-truth',
    pattern: /前安立為地/g,
    replacement: '前安立為諦',
    confidence: 'CONFIRMED',
    evidence: ['source phrase: 世俗前安立為諦']
  },
  {
    id: 'truth-reality-homophone',
    pattern: /([不非為是])地實/g,
    replacement: '$1諦實',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 諦實 / 不諦實 / 非諦實']
  },
  {
    id: 'conventional-truth-homophone',
    pattern: /世俗地/g,
    replacement: '世俗諦',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 世俗諦']
  },
  {
    id: 'echo-dependent-arising-quote',
    pattern: /如影像古生的少分元起發/g,
    replacement: '如影像、谷響的少分緣起法',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:15: 如影像、谷響等少分緣起法']
  },
  {
    id: 'pure-ground-bodhisattva',
    pattern: /三[禁境]地的菩薩/g,
    replacement: '清淨地的菩薩',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_102.txt:19: 清淨地菩薩']
  },
  {
    id: 'thus-named-conventional',
    pattern: /市民世俗/g,
    replacement: '是名世俗',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:3: 是名世俗']
  },
  {
    id: 'conventional-valid-cognition',
    pattern: /明眼量/g,
    replacement: '名言量',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_095.txt:20 and page_099.txt:8: 名言量']
  },
  {
    id: 'commentary-says',
    pattern: /四論所/g,
    replacement: '釋論說',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:15: 釋論說']
  },
  {
    id: 'false-appearance-homophone',
    pattern: /虛望/g,
    replacement: '虛妄',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 虛妄']
  },
  {
    id: 'ignorance-homophone-qualified',
    pattern: /[居巨具]無名/g,
    replacement: '具無明',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 具無明者']
  },
  {
    id: 'ignorance-homophone-context',
    pattern: /無名(?=(?:世俗|前面|者|看成|[，。！？；：]))/g,
    replacement: '無明',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 無明 / 實執無明']
  },
  {
    id: 'ignorance-before-consciousness',
    pattern: /五米/g,
    replacement: '無明',
    confidence: 'CONFIRMED',
    evidence: ['same passage repeatedly says 無明前面']
  },
  {
    id: 'ordinary-being-homophone-with-dui',
    pattern: /對反覆/g,
    replacement: '對凡夫',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 觀待凡夫 / 異生']
  },
  {
    id: 'ordinary-being-homophone-context',
    pattern: /反覆(?=(?:的世俗|自己的世俗|來說|[，。！？；：]))/g,
    replacement: '凡夫',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 凡夫 / 異生']
  },
  {
    id: 'relative-to-ordinary-being',
    pattern: /關在凡夫/g,
    replacement: '觀待凡夫',
    confidence: 'CONFIRMED',
    evidence: ['course terminology: 觀待凡夫']
  },
  {
    id: 'conventional-consciousness-homophone',
    pattern: /世俗四/g,
    replacement: '世俗識',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 世俗識 / 名言識']
  },
  {
    id: 'buddha-epithet-homophone',
    pattern: /人人說(?=為世俗諦)/g,
    replacement: '能仁說',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:12: 能仁說']
  },
  {
    id: 'echo-homophone',
    pattern: /古[生神](?=(?:啊|等|的|這些|這種|[，。！？；：]|$))/g,
    replacement: '谷響',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 影像、谷響'],
    when: ({ sourceText }) => sourceText.includes('谷響')
  },
  {
    id: 'mirage-homophone',
    pattern: /揚言/g,
    replacement: '陽焰',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_098.txt:18: 陽焰']
  },
  {
    id: 'three-types-homophone',
    pattern: /三略/g,
    replacement: '三類',
    confidence: 'CONFIRMED',
    evidence: ['source heading: 三類補特伽羅']
  },
  {
    id: 'explains-conventional-truth',
    pattern: /世民世俗諦/g,
    replacement: '是明世俗諦',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:3: 是明世俗諦為於何世俗前']
  },
  {
    id: 'which-conventionality',
    pattern: /為和世俗/g,
    replacement: '為何世俗',
    confidence: 'CONFIRMED',
    evidence: ['source heading: 於何世俗前為諦']
  },
  {
    id: 'conventional-language-homophone',
    pattern: /明眼(?=(?:[，。！？；：]|$))/g,
    replacement: '名言',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 名言量 / 名言識']
  },
  {
    id: 'conventional-truth-phrase',
    pattern: /四所地/g,
    replacement: '世俗諦',
    confidence: 'CONFIRMED',
    evidence: ['same passage: 瓶等世俗諦法']
  },
  {
    id: 'true-existence-appearance',
    pattern: /十有限/g,
    replacement: '實有現',
    confidence: 'CONFIRMED',
    evidence: ['course terminology: 實有現 / 現為實有']
  },
  {
    id: 'pure-ground-person',
    pattern: /禁地的人/g,
    replacement: '清淨地的人',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_102.txt:19: 清淨地菩薩']
  },
  {
    id: 'first-ground-and-above',
    pattern: /出地上的那個菩薩/g,
    replacement: '初地以上的那個菩薩',
    confidence: 'CONFIRMED',
    evidence: ['course context: 初地以上菩薩']
  },
  {
    id: 'first-ground-bodhisattva',
    pattern: /出地菩薩/g,
    replacement: '初地菩薩',
    confidence: 'CONFIRMED',
    evidence: ['course terminology: 初地菩薩']
  },
  {
    id: 'pure-ground-homophone-short',
    pattern: /三境地/g,
    replacement: '清淨地',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_102.txt:19: 清淨地菩薩']
  },
  {
    id: 'face-homophone',
    pattern: /連面/g,
    replacement: '臉面',
    confidence: 'CONFIRMED',
    evidence: ['audio 2218-2258s consistently decodes 臉面']
  },
  {
    id: 'appears-as-real',
    pattern: /獻為真實/g,
    replacement: '現為真實',
    confidence: 'CONFIRMED',
    evidence: ['source terminology: 現為諦實']
  },
  {
    id: 'that-conventionality',
    pattern: /比世俗前/g,
    replacement: '彼世俗前',
    confidence: 'CONFIRMED',
    evidence: ['source phrase: 由於彼世俗前不諦實']
  },
  {
    id: 'two-truths-final-di-homophone',
    pattern: /(?<![初二三四五六七八九十淨境禁])地(?=[，。！？；：的實故了不]|$)/g,
    replacement: '諦',
    confidence: 'CONFIRMED',
    evidence: ['source section: 於何世俗前為諦何前不諦'],
    when: ({ sourceText }) => sourceText.includes('世俗前安立為諦')
  },
  {
    id: 'hearer-arhat-homophone',
    pattern: /生威阿羅漢/g,
    replacement: '聲聞阿羅漢',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_102.txt:14-20: 聲聞、獨覺']
  },
  {
    id: 'solitary-realizer-arhat-homophone',
    pattern: /獨角阿羅漢/g,
    replacement: '獨覺阿羅漢',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_102.txt:14-20: 聲聞、獨覺']
  },
  {
    id: 'entirely-false-homophone',
    pattern: /全權虛妄/g,
    replacement: '全然虛妄',
    confidence: 'CONFIRMED',
    evidence: ['sentence context: 完全是虛妄']
  },
  {
    id: 'not-appear-as-real',
    pattern: /不限為諦實/g,
    replacement: '不現為諦實',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_102.txt:13-20: 不現為諦實']
  },
  {
    id: 'not-real-before-that-conventionality',
    pattern: /由於彼世俗前不是蒂固/g,
    replacement: '由於彼世俗前不諦實故',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:14: 由於彼世俗前不諦實故']
  },
  {
    id: 'therefore-know-commentary-says',
    pattern: /以示當之論說/g,
    replacement: '以是當知論說',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:21: 以是當知論說']
  },
  {
    id: 'skilled-in-conventions',
    pattern: /一說善民眼/g,
    replacement: '意說善名言者',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:21: 意說善名言者']
  },
  {
    id: 'skilled-in-conventions-short',
    pattern: /善民眼/g,
    replacement: '善名言者',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:21: 善名言者']
  },
  {
    id: 'appears-as-form',
    pattern: /現世(?=[，。！？；：]|$)/g,
    replacement: '現似',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:21-22: 現似形質']
  },
  {
    id: 'substantial-form-homophone',
    pattern: /行止(?=[，。！？；：]|$)/g,
    replacement: '形質',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:21-22: 現似形質']
  },
  {
    id: 'already-known-homophone',
    pattern: /但是一知/g,
    replacement: '但是已知',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:21-22: 已知為妄']
  },
  {
    id: 'ignorance-homophone-discussion',
    pattern: /無名(?=(?:這個世俗|來說))/g,
    replacement: '無明',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:15-17: 具無明者']
  },
  {
    id: 'tibetan-language-homophone',
    pattern: /看贊文的話/g,
    replacement: '看藏文的話',
    confidence: 'CONFIRMED',
    evidence: ['local context immediately discusses the Tibetan wording and its Chinese rendering']
  },
  {
    id: 'who-establishes-conventional-truth-audio',
    pattern: /世俗諦是隨安立的。?/g,
    replacement: '世俗諦是誰去安立的？',
    confidence: 'LIKELY',
    evidence: [
      'audio 316-362s: three decodes yield 隨/隨意/隨於 before 安立',
      'local question-answer context suggests the phonemes as 誰去安立'
    ],
    when: ({ sentence }) => sentence.sourceSegmentId === 170
  },
  {
    id: 'conventional-consciousness-establishes',
    pattern: /那個其實明世俗是安立的了/g,
    replacement: '那個其實名言識安立的了',
    confidence: 'LIKELY',
    evidence: [
      'audio 316-362s slow decode: 其實明眼是安立的',
      'local context repeatedly contrasts 名言識 and 名言量'
    ],
    when: ({ sentence }) => sentence.sourceSegmentId === 171
  },
  {
    id: 'through-or-dependent-on',
    pattern: /是透有或者是說依有世俗諦/g,
    replacement: '是透由或者是說依由世俗諦',
    confidence: 'CONFIRMED',
    evidence: ['audio 316-362s: repeated 有 phonemes; sentence grammar resolves 透由 / 依由']
  },
  {
    id: 'in-summary-discourse-marker',
    pattern: /裝置了/g,
    replacement: '總之呢',
    confidence: 'LIKELY',
    evidence: [
      'audio 2248-2257s decodes 裝置了 / 種子了',
      'surrounding clause suggests: 顛倒識嘛，總之呢，就變成這樣'
    ],
    when: ({ sentence }) => sentence.sourceSegmentId === 1307
  },
  {
    id: 'appears-as-chinese-rendering',
    pattern: /^(所以)?線尾(?=(?:是中文的)?[，。！？；：]|$)/g,
    replacement: '$1現為',
    confidence: 'CONFIRMED',
    evidence: ['same discussion contrasts Tibetan wording with Chinese 現為']
  },
  {
    id: 'appears-or-not-homophones',
    pattern: /無關限不限/g,
    replacement: '無關現不現',
    confidence: 'CONFIRMED',
    evidence: ['same discussion repeatedly contrasts 現與不現']
  },
  {
    id: 'not-appear-as-discussion',
    pattern: /不限為/g,
    replacement: '不現為',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:13: 三種人前不現為諦實']
  },
  {
    id: 'three-person-source-phrase',
    pattern: /由於三種前不現為第四/g,
    replacement: '由於三種人前不現為諦實',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:13: 由於三種人前不現為諦實']
  },
  {
    id: 'not-appear-as-real-short',
    pattern: /他們不現為第四/g,
    replacement: '他們不現為諦實',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:13: 三種人前不現為諦實']
  },
  {
    id: 'ignorant-never-see-reality',
    pattern: /則具無明則畢竟不限/g,
    replacement: '則具無明者畢竟不見',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:16: 則具無明者畢竟不見']
  },
  {
    id: 'also-seen-as-false',
    pattern: /意見為虛妄者/g,
    replacement: '亦見為虛妄者',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:15,18: 亦見其虛妄 / 亦見為虛妄']
  },
  {
    id: 'not-contradictory-homophone',
    pattern: /並不相為/g,
    replacement: '並不相違',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:20: 並不相違']
  },
  {
    id: 'relative-to-that-mind',
    pattern: /是觀待比心/g,
    replacement: '是觀待彼心',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:22: 是觀待彼心']
  },
  {
    id: 'is-conventional-truth',
    pattern: /知世俗諦也/g,
    replacement: '是世俗諦也',
    confidence: 'CONFIRMED',
    evidence: ['source_text/page_101.txt:22-23: 所說之世俗諦也']
  }
];

const SUSPICIOUS_PATTERNS = [
  { id: 'unresolved-wuming-homophone', pattern: /五米/g },
  { id: 'unresolved-eye-consciousness', pattern: /演示/g },
  { id: 'unresolved-face-homophone', pattern: /連面/g },
  { id: 'unresolved-ground-homophone', pattern: /(?<![初二三四五六七八九十淨])地(?=[，。！？；：實]|$)/g },
  { id: 'unresolved-echo-homophone', pattern: /古[生神]/g },
  { id: 'unresolved-false-appearance', pattern: /虛望/g },
  { id: 'ambiguous-conventional-measure', pattern: /世俗量/g },
  { id: 'ambiguous-establishment-question', pattern: /世俗諦是隨安立的/g },
  { id: 'ambiguous-existence-phrase', pattern: /(?:透有|依有)/g },
  { id: 'ambiguous-explains-conventionality', pattern: /其實明世俗/g },
  { id: 'ambiguous-discourse-marker', pattern: /裝置了/g }
];

function evidenceFor(rule, sourceText) {
  const evidence = [...rule.evidence];
  const sourceTerms = rule.replacement.match(/[\p{Script=Han}]{2,}/gu) || [];
  const grounded = sourceTerms.find((term) => sourceText.includes(term));
  if (grounded) evidence.push(`source text contains: ${grounded}`);
  return evidence;
}

export function auditSentence(sentence, { sourceText = '' } = {}) {
  let suggestedText = sentence.text;
  const candidates = [];

  for (const rule of RULES) {
    if (rule.when && !rule.when({ sentence, sourceText, suggestedText })) continue;
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(suggestedText)) continue;
    rule.pattern.lastIndex = 0;
    const before = suggestedText;
    suggestedText = suggestedText.replace(rule.pattern, rule.replacement);
    candidates.push({
      ruleId: rule.id,
      before,
      after: suggestedText,
      confidence: rule.confidence,
      evidence: evidenceFor(rule, sourceText)
    });
  }

  const residualWarnings = [];
  for (const warning of SUSPICIOUS_PATTERNS) {
    warning.pattern.lastIndex = 0;
    for (const match of suggestedText.matchAll(warning.pattern)) {
      residualWarnings.push({
        warningId: warning.id,
        matched: match[0],
        offset: match.index
      });
    }
  }

  return {
    sourceSegmentId: sentence.sourceSegmentId,
    start: sentence.start,
    end: sentence.end,
    originalText: sentence.text,
    suggestedText,
    confidence: candidates.some((candidate) => candidate.confidence === 'LIKELY')
      ? 'LIKELY'
      : candidates.length > 0 ? 'CONFIRMED' : null,
    candidates,
    residualWarnings
  };
}

export function auditSession(session, { sourceText = '' } = {}) {
  const sentences = session.paragraphs.flatMap((paragraph) => paragraph.sentences || []);
  const reviewedExceptions = new Map(
    (session._meta?.candidateEvidence?.reviewedExceptions || [])
      .filter((item) => item.disposition === 'ACCEPTED_AS_SPOKEN' && item.text && item.evidence?.length > 0)
      .map((item) => [`${item.sourceSegmentId}\u0000${item.text}`, item])
  );
  let acceptedExceptions = 0;
  const items = sentences
    .map((sentence) => auditSentence(sentence, { sourceText }))
    .map((item) => {
      const exception = reviewedExceptions.get(`${item.sourceSegmentId}\u0000${item.suggestedText}`);
      if (!exception || item.candidates.length > 0 || item.residualWarnings.length === 0) return item;
      acceptedExceptions += 1;
      return { ...item, residualWarnings: [] };
    })
    .filter((item) => item.candidates.length > 0 || item.residualWarnings.length > 0);
  const itemIds = new Set(items.map((item) => item.sourceSegmentId));
  const sentenceById = new Map(sentences.map((sentence) => [sentence.sourceSegmentId, sentence]));
  for (const pending of session._meta?.candidateEvidence?.manualReviewQueue || []) {
    const sentence = sentenceById.get(pending.sourceSegmentId);
    const exception = reviewedExceptions.get(`${pending.sourceSegmentId}\u0000${pending.text}`);
    if (!sentence || sentence.text !== pending.text || exception || itemIds.has(pending.sourceSegmentId)) continue;
    items.push({
      sourceSegmentId: pending.sourceSegmentId,
      start: sentence.start,
      end: sentence.end,
      originalText: sentence.text,
      suggestedText: sentence.text,
      confidence: null,
      candidates: [],
      residualWarnings: [{
        warningId: 'manual-review-pending',
        matched: sentence.text,
        offset: 0
      }]
    });
  }
  items.sort((left, right) => left.sourceSegmentId - right.sourceSegmentId);

  return {
    schemaVersion: 1,
    sessionId: session.sessionId,
    generatedBy: 'transcript_candidate_auditor.mjs',
    summary: {
      scanned: sentences.length,
      candidates: items.length,
      confirmed: items.filter((item) => item.confidence === 'CONFIRMED').length,
      likely: items.filter((item) => item.confidence === 'LIKELY').length,
      warnings: items.reduce((count, item) => count + item.residualWarnings.length, 0),
      acceptedExceptions
    },
    items
  };
}

export function applyConfirmedCandidates(sentences, auditedItems) {
  const confirmed = new Map(
    auditedItems
      .filter((item) => item.confidence === 'CONFIRMED')
      .map((item) => [item.sourceSegmentId, item])
  );

  return sentences.map((sentence) => {
    const item = confirmed.get(sentence.sourceSegmentId);
    if (!item || item.originalText !== sentence.text) return { ...sentence };
    return {
      ...sentence,
      text: item.suggestedText,
      proofreadText: item.suggestedText
    };
  });
}

export function applyAuditToSession(session, report) {
  const output = structuredClone(session);
  const confirmedItems = report.items.filter(
    (item) => item.confidence === 'CONFIRMED' && item.suggestedText !== item.originalText
  );

  for (const paragraph of output.paragraphs) {
    paragraph.sentences = applyConfirmedCandidates(paragraph.sentences || [], confirmedItems);
  }

  output._meta ||= {};
  output._meta.candidateEvidence ||= {};
  const existing = new Map(
    (output._meta.candidateEvidence.applied || []).map((item) => [item.sourceSegmentId, item])
  );
  for (const item of confirmedItems) {
    existing.set(item.sourceSegmentId, {
      sourceSegmentId: item.sourceSegmentId,
      before: item.originalText,
      after: item.suggestedText,
      confidence: item.confidence,
      ruleIds: item.candidates.map((candidate) => candidate.ruleId),
      evidence: [...new Set(item.candidates.flatMap((candidate) => candidate.evidence))]
    });
  }
  output._meta.candidateEvidence.applied = [...existing.values()]
    .sort((left, right) => left.sourceSegmentId - right.sourceSegmentId);
  const previousAudit = output._meta.candidateEvidence.automatedAudit;
  const previousTotal = previousAudit?.totalAutoApplied ?? previousAudit?.autoApplied ?? 0;
  const previousRuns = previousAudit?.runs || (previousAudit ? [{
    summary: previousAudit.summary,
    autoApplied: previousAudit.autoApplied,
    requiresReview: previousAudit.requiresReview
  }] : []);
  const currentRun = {
    summary: report.summary,
    autoApplied: confirmedItems.length,
    requiresReview: report.summary.warnings > 0 || report.summary.likely > 0
  };
  output._meta.candidateEvidence.automatedAudit = {
    schemaVersion: report.schemaVersion,
    generatedBy: report.generatedBy,
    summary: report.summary,
    autoApplied: confirmedItems.length,
    totalAutoApplied: previousTotal + confirmedItems.length,
    requiresReview: currentRun.requiresReview,
    runs: [...previousRuns, currentRun]
  };
  output._meta.candidateEvidence.manualReviewQueue = report.items
    .filter((item) => item.confidence === 'LIKELY' || item.residualWarnings.length > 0)
    .map((item) => ({
      sourceSegmentId: item.sourceSegmentId,
      start: item.start,
      end: item.end,
      text: item.suggestedText,
      warningIds: item.residualWarnings.map((warning) => warning.warningId)
    }));
  return output;
}

function loadSourceText(sourcePaths) {
  return sourcePaths.map((path) => readFileSync(path, 'utf8')).join('\n');
}

function parseArgs(argv) {
  const args = { sourcePaths: [], applyConfirmed: false, failOnReview: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--session') args.sessionPath = argv[++index];
    else if (value === '--source') args.sourcePaths.push(argv[++index]);
    else if (value === '--source-range') args.sourceRange = argv[++index];
    else if (value === '--report') args.reportPath = argv[++index];
    else if (value === '--apply-confirmed') args.applyConfirmed = true;
    else if (value === '--fail-on-review') args.failOnReview = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.sessionPath) throw new Error('--session is required');
  return args;
}

function resolveSourcePaths(args, sessionPath) {
  const paths = args.sourcePaths.map((path) => resolve(path));
  if (!args.sourceRange) return paths;

  const match = /^(\d+)-(\d+)$/.exec(args.sourceRange);
  if (!match) throw new Error('--source-range must use START-END, for example 95-105');
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > end) throw new Error('--source-range START must be <= END');
  const sourceDirectory = join(dirname(dirname(sessionPath)), 'source_text');
  for (let page = start; page <= end; page += 1) {
    paths.push(join(sourceDirectory, `page_${String(page).padStart(3, '0')}.txt`));
  }
  return paths;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const sessionPath = resolve(args.sessionPath);
  const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
  const sourceText = loadSourceText(resolveSourcePaths(args, sessionPath));
  const report = auditSession(session, { sourceText });

  if (args.reportPath) {
    writeFileSync(resolve(args.reportPath), `${JSON.stringify(report, null, 2)}\n`);
  }

  if (args.applyConfirmed) {
    const output = applyAuditToSession(session, report);
    writeFileSync(sessionPath, `${JSON.stringify(output, null, 2)}\n`);
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (args.failOnReview && (report.summary.warnings > 0 || report.summary.likely > 0)) {
    process.exitCode = 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  runCli();
}
