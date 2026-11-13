/**
 * 教理名相殘缺／ASR 吞字稽核工具
 *
 * 針對已完成初轉或詞庫替換的講次逐字稿，偵測「固定搭配名相殘缺」或「語意疑似掉字」的句子，
 * 並產生局部高精重辨識（re-ASR）所需的時間區間與領域提示詞（initial_prompt）。
 */

const PARAMITA_PREFIX_RE =
  /(?:布施|檀那|持戒|戒|忍辱|羼提|精進|毗梨耶|禪定|靜慮|禪那|般若|智慧|方便|願|力|智|六|十)波羅蜜多?$/;

const PARAMITA_ANY_RE = /波羅蜜多?/g;

const SIX_PARAMITAS_HINTS = [
  '六度',
  '布施、持戒、忍辱、精進、禪定、般若',
  '般若波羅蜜多',
];

/**
 * 檢查單句內「波羅蜜多」是否缺少前綴修飾詞。
 * @param {object} ctx
 * @returns {Array<object>}
 */
function checkParamitaPrefix({ sentence, prevSentence, nextSentence, paragraph, session }) {
  const text = String(sentence.text ?? '');
  const findings = [];
  const contextText = [
    session?.title ?? '',
    paragraph?.heading ?? '',
    prevSentence?.text ?? '',
    text,
    nextSentence?.text ?? '',
  ].join(' ');

  for (const match of text.matchAll(PARAMITA_ANY_RE)) {
    const endIdx = match.index + match[0].length;
    const prefixSlice = text.slice(Math.max(0, match.index - 6), endIdx);
    if (PARAMITA_PREFIX_RE.test(prefixSlice)) {
      continue;
    }
    // 排除前綴與波羅蜜多之間僅有頓號/逗號/空白的「這一波，那一波，波羅蜜多」諧音雙關句，
    // 這類句子在「衝這一波，那一波，波羅蜜多」也可能是 ASR 漏掉「般若」。
    const hasPrajnaContext =
      /六度.*最後|最後.*六度|空性|空三摩地|般若/.test(contextText);
    const suggestedTerm = hasPrajnaContext ? '般若波羅蜜多' : null;
    findings.push({
      ruleId: 'missing-paramita-prefix',
      severity: hasPrajnaContext ? 'high' : 'medium',
      matchedText: match[0],
      suggestedTerm,
      reason: hasPrajnaContext
        ? '上下文提及六度最後一度／空性／空三摩地，單獨出現「波羅蜜多」疑似漏掉前綴「般若」'
        : '單獨出現「波羅蜜多」且無前綴度別（如布施／持戒／般若）修飾，疑似 ASR 吞字',
      promptHints: [
        ...SIX_PARAMITAS_HINTS,
        ...(paragraph?.heading ? [paragraph.heading] : []),
      ],
    });
  }
  return findings;
}

/**
 * 檢查常見雙字／三字佛學名相被 ASR 吞掉首字的情況。
 */
const TRUNCATED_TERM_RULES = [
  {
    ruleId: 'truncated-chulixin',
    pattern: /(?<![出])離心/g,
    contextPattern: /三主要道|厭離|輪迴|出離/,
    suggestedTerm: '出離心',
    reason: '出現單字「離心」，依上下文疑似漏掉「出」字（出離心）',
    promptHints: ['三主要道', '出離心', '菩提心', '空正見'],
  },
  {
    ruleId: 'truncated-putixin',
    pattern: /(?<![菩])提心/g,
    contextPattern: /三主要道|發心|大乘|菩薩|菩提/,
    suggestedTerm: '菩提心',
    reason: '出現「提心」，依上下文疑似漏掉「菩」字（菩提心）',
    promptHints: ['三主要道', '出離心', '菩提心', '空正見'],
  },
  {
    ruleId: 'truncated-samadhi',
    pattern: /(?<![空無願相定念止三幻])三摩地/g,
    contextPattern: /空三摩地|無相|無願|三解脫門/,
    suggestedTerm: '空三摩地 / 無相三摩地 / 無願三摩地',
    reason: '單獨出現「三摩地」且無前綴，依上下文確認是否漏掉「空／無相／無願」',
    promptHints: ['空三摩地', '無相三摩地', '無願三摩地', '如幻三摩地', '三三摩地', '三解脫門'],
  },
];

function checkTruncatedTerms({ sentence, prevSentence, nextSentence, paragraph, session }) {
  const text = String(sentence.text ?? '');
  const contextText = [
    session?.title ?? '',
    paragraph?.heading ?? '',
    prevSentence?.text ?? '',
    text,
    nextSentence?.text ?? '',
  ].join(' ');
  const findings = [];

  for (const rule of TRUNCATED_TERM_RULES) {
    if (!rule.contextPattern.test(contextText)) continue;
    for (const match of text.matchAll(rule.pattern)) {
      findings.push({
        ruleId: rule.ruleId,
        severity: 'medium',
        matchedText: match[0],
        suggestedTerm: rule.suggestedTerm,
        reason: rule.reason,
        promptHints: rule.promptHints,
      });
    }
  }
  return findings;
}

const REPETITION_LOOP_RE = /([\u4e00-\u9fff]{2,12}[，、。]?)\1{3,}/;
const GIBBERISH_ASCII_RE = /(?:\b\d+[a-zA-Z]{2,}\b|(?:[a-z]{3,}[\s，。、,]*){3,}|[\u4e00-\u9fff].*\b[a-z]{2,}\b|\b[a-z]{2,}\b.*[\u4e00-\u9fff])/;

/**
 * 偵測 Whisper 初轉時的「異常重複迴圈」（如連續 4 次以上相同詞組）或「亂碼崩潰」。
 * @param {object} ctx
 * @returns {Array<object>}
 */
function checkWhisperHallucinations({ sentence, paragraph }) {
  const text = String(sentence.text ?? '');
  const findings = [];
  const hints = paragraph?.heading ? [paragraph.heading] : [];

  if (REPETITION_LOOP_RE.test(text)) {
    findings.push({
      ruleId: 'whisper-hallucination-loop',
      severity: 'high',
      matchedText: text.match(REPETITION_LOOP_RE)?.[0]?.slice(0, 30) ?? text.slice(0, 30),
      suggestedTerm: null,
      reason: '偵測到疑似 Whisper 重複迴圈幻覺（同一詞組連續重複 4 次以上），需局部重辨識還原',
      promptHints: hints,
    });
  } else if (GIBBERISH_ASCII_RE.test(text)) {
    findings.push({
      ruleId: 'whisper-hallucination-gibberish',
      severity: 'high',
      matchedText: text.match(GIBBERISH_ASCII_RE)?.[0]?.slice(0, 30) ?? text.slice(0, 30),
      suggestedTerm: null,
      reason: '偵測到疑似 Whisper 亂碼／外文雜訊崩潰，需局部重辨識還原',
      promptHints: hints,
    });
  }
  return findings;
}

/**
 * 正規化句子文字以偵測跨句連續重複幻覺。
 * @param {string} text
 * @returns {string}
 */
function normalizeForRepeatCheck(text) {
  return String(text ?? '')
    .replace(/[\s，。、？！：；「」『』《》〈〉,.?!:;'"()（）]/g, '')
    .trim();
}

/**
 * 掃描整份講次 JSON，回傳所有名相殘缺／疑似掉字／Whisper 幻覺清單。
 * @param {object} session
 * @returns {Array<object>}
 */
export function auditSessionDharmaTerms(session) {
  const paragraphs = Array.isArray(session?.paragraphs) ? session.paragraphs : [];
  const flat = [];
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences ?? []) {
      flat.push({ paragraph, sentence });
    }
  }

  // 偵測跨句連續重複幻覺（例如連續 3 句以上相同短句「有人不在乎」「歷史的」）
  const consecutiveRepeatIdx = new Set();
  let runStart = 0;
  while (runStart < flat.length) {
    const norm = normalizeForRepeatCheck(flat[runStart].sentence.text);
    let runEnd = runStart + 1;
    if (norm.length >= 2 && norm.length <= 24) {
      while (
        runEnd < flat.length &&
        normalizeForRepeatCheck(flat[runEnd].sentence.text) === norm
      ) {
        runEnd++;
      }
      if (runEnd - runStart >= 3) {
        for (let k = runStart; k < runEnd; k++) {
          consecutiveRepeatIdx.add(k);
        }
      }
    }
    runStart = runEnd;
  }

  const results = [];
  for (let i = 0; i < flat.length; i++) {
    const { paragraph, sentence } = flat[i];
    const prevSentence = i > 0 ? flat[i - 1].sentence : null;
    const nextSentence = i + 1 < flat.length ? flat[i + 1].sentence : null;

    const ctx = { sentence, prevSentence, nextSentence, paragraph, session };
    const findings = [
      ...checkParamitaPrefix(ctx),
      ...checkTruncatedTerms(ctx),
      ...checkWhisperHallucinations(ctx),
    ];

    if (
      consecutiveRepeatIdx.has(i) &&
      !findings.some((f) => f.ruleId === 'whisper-hallucination-loop')
    ) {
      findings.push({
        ruleId: 'whisper-hallucination-loop',
        severity: 'high',
        matchedText: String(sentence.text ?? '').slice(0, 30),
        suggestedTerm: null,
        reason: '偵測到疑似 Whisper 跨句連續重複幻覺（連續 3 句以上相同短句），需局部重辨識還原',
        promptHints: paragraph?.heading ? [paragraph.heading] : [],
      });
    }

    if (findings.length > 0) {
      results.push({
        sentenceId: sentence.id ?? `idx-${i}`,
        paragraphId: paragraph.id ?? null,
        heading: paragraph.heading ?? null,
        start: Number(sentence.start ?? 0),
        end: Number(sentence.end ?? 0),
        text: String(sentence.text ?? ''),
        prevText: prevSentence ? String(prevSentence.text ?? '') : '',
        nextText: nextSentence ? String(nextSentence.text ?? '') : '',
        findings,
      });
    }
  }
  return results;
}

/**
 * 將相鄰的疑慮句合併為連續的局部重辨識音訊視窗（避免相鄰兩句切碎語境）。
 * @param {Array<object>} findingsList
 * @param {object} [options]
 * @returns {Array<object>}
 */
export function buildReAsrWindows(findingsList, options = {}) {
  const paddingSeconds = Number(options.paddingSeconds ?? 2.0);
  const mergeGapSeconds = Number(options.mergeGapSeconds ?? 4.0);
  if (!Array.isArray(findingsList) || findingsList.length === 0) return [];

  const sorted = [...findingsList].sort((a, b) => a.start - b.start);
  const windows = [];

  for (const item of sorted) {
    const last = windows[windows.length - 1];
    if (last && item.start - last.rawEnd <= mergeGapSeconds) {
      last.rawEnd = Math.max(last.rawEnd, item.end);
      last.items.push(item);
      for (const f of item.findings) {
        for (const h of f.promptHints ?? []) last.promptHintSet.add(h);
        if (f.suggestedTerm) last.expectedTerms.add(f.suggestedTerm);
      }
    } else {
      const promptHintSet = new Set();
      const expectedTerms = new Set();
      for (const f of item.findings) {
        for (const h of f.promptHints ?? []) promptHintSet.add(h);
        if (f.suggestedTerm) expectedTerms.add(f.suggestedTerm);
      }
      windows.push({
        rawStart: item.start,
        rawEnd: item.end,
        items: [item],
        promptHintSet,
        expectedTerms,
      });
    }
  }

  return windows.map((w, idx) => {
    const clipStart = Math.max(0, Number((w.rawStart - paddingSeconds).toFixed(2)));
    const clipEnd = Number((w.rawEnd + paddingSeconds).toFixed(2));
    const hints = [...w.promptHintSet];
    const leadContext = w.items[0]?.prevText ? w.items[0].prevText : '';
    const prompt = [leadContext, hints.join('、')].filter(Boolean).join(' ');
    return {
      windowId: `win-${idx + 1}`,
      clipStart,
      clipEnd,
      clipDuration: Number((clipEnd - clipStart).toFixed(2)),
      sentenceIds: w.items.map((it) => it.sentenceId),
      originalTexts: w.items.map((it) => ({ id: it.sentenceId, text: it.text })),
      expectedTerms: [...w.expectedTerms],
      prompt,
      items: w.items,
    };
  });
}
