#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FILLER_ONLY_RE = /^(呃|嗯|啊|喔|哦|欸|唉|嘿|那|好|就是說|對|是)[，。、！？\s]*$/u;
const END_PUNCT_RE = /[。？！…」》）】；：，、]$/u;
const NON_NFKC_CJK_RE = /[\u2F00-\u2FDF\u3190-\u319F\u3200-\u32FF\u3300-\u33FF\uF900-\uFAFF]/g;

// R2: Known Whisper hallucination phrases (near-zero false positive)
const WHISPER_HALLUCINATION_RE = /(明鏡與點點欄目|明镜与点点栏目|不吝點讚|不吝点赞|訂閱打賞|打赏支持|Amara\.org|Subtitles by|請不吝點讚)/iu;

// R3: Trailing dangling connective cut by period (near-zero false positive)
const TRAILING_DANGLING_CONNECTIVE_RE = /[，。；：]\s*(因此|所以|同時|此外|此時|但是|不過|然而|也就是說|也就是|換句話說|而且|並且)[。]$/u;

// Y1: Suspect chopped incomplete clause ending in period (Yellow Radar)
const CHOPPED_CLAUSE_WHITELIST_RE = /(是的|肯定的|否定的|沒有|有的|不是|對的|錯的|正確的|錯誤的|必然的|自然的|真實的|一樣的|相同的|不同的|重要的|清楚的|明顯的|這樣的|那樣的|如此的)[。]$/u;
const SUSPECT_CHOPPED_CLAUSE_RE = /(覺得|認為|以為|視為|稱為|強調的是|說明的是|注意的是|關心的是|核心原理是|最關鍵的是|直覺反應都是|意思是|指的是|代表的是|進入這個|進入那個|這個|那個|這些|那些|情況下|的時候|之時|之中|當中|裡面|的話|而言|來說|把|被|將|從|向|往|給|讓|使)[。]$/u;

// Y2: Suspect question ending in period (Yellow Radar)
const SUSPECT_QUESTION_PERIOD_RE = /(請問|為什麼|為何|是不是|對不對|有沒有|會不會|能不能|可不可以|怎麼樣|怎麼會|哪裡|如何|嗎|呢).*。$/u;
const QUOTED_QUESTION_RE = /[「『][^」』]*[？?][^」』]*[」』]/u;

// Y3: Generic Level-1 headings exempt from keyword overlap check
const GENERIC_HEADING_RE = /(重點複習|補充說明|破除質疑|重點統整|結行迴向|開場|綱領|前言|總結|導論)/u;
const MID_PARA_CONTINUATION_RE = /^(甚至|進而|而且|並且|同時|因此|所以|也就是|會看見|此外|此時|接著)/u;

// Y4: High-risk Buddhist homophone traps (Yellow Radar)
const HOMOPHONE_TRAPS = [
  { re: /稱心(?!如意)/u, term: '稱心', hint: '確認是否為「瞋心」' },
  { re: /稱恚/u, term: '稱恚', hint: '確認是否為「瞋恚」' },
  { re: /貪稱/u, term: '貪稱', hint: '確認是否為「貪瞋」' },
  { re: /對峙/u, term: '對峙', hint: '確認是否為「對治」（佛法對治煩惱）' },
  { re: /關帶/u, term: '關帶', hint: '確認是否為「觀待」' },
  { re: /自信樂/u, term: '自信樂', hint: '確認是否為「自性樂」' },
  { re: /淺層?苦/u, term: '淺苦', hint: '確認是否為「前苦」' },
  { re: /無名我直|無明我直/u, term: '無名我直', hint: '確認是否為「無明我執」' },
  { re: /二地(?!以上|以下|菩薩)/u, term: '二地', hint: '確認是否為「二諦」（世俗諦/勝義諦）' },
  { re: /四地(?!以上|以下|菩薩)/u, term: '四地', hint: '確認是否為「四諦」（苦集滅道）' },
  { re: /三歸一/u, term: '三歸一', hint: '確認是否為「三皈依」' },
  { re: /十六形象/u, term: '十六形象', hint: '確認是否為「十六行相」' },
  { re: /苦地/u, term: '苦地', hint: '確認是否為「苦諦」' },
  { re: /極地(?!氣候|探險)/u, term: '極地', hint: '確認是否為「集諦」' },
];

export const DEFAULT_THRESHOLDS = {
  maxMissingEndPunctRatio: 0.05,
  maxShortFragmentRatio: 0.02,
  maxParagraphSentences: 35,
  minDiscussionTopics: 3,
  maxDiscussionTopics: 7,
  maxAudioYoutubeDriftSec: 10,
};

function extractSentences(session) {
  if (Array.isArray(session.paragraphs) && session.paragraphs.length > 0) {
    return session.paragraphs.flatMap((p) => (Array.isArray(p.sentences) ? p.sentences : []));
  }
  return Array.isArray(session.sentences) ? session.sentences : [];
}

function getNumericCount(val) {
  if (typeof val === 'number') return val;
  if (Array.isArray(val)) return val.length;
  return 0;
}

function cjkBigrams(text) {
  const clean = String(text || '').replace(/[^\p{Script=Han}]/gu, '');
  const set = new Set();
  for (let i = 0; i + 1 < clean.length; i += 1) {
    set.add(clean.slice(i, i + 2));
  }
  return set;
}

export function auditSession(session, opts = {}) {
  const cfg = { ...DEFAULT_THRESHOLDS, ...opts };
  const violations = [];
  const warnings = [];
  const radarCards = [];
  const sentences = extractSentences(session);
  const totalSentences = sentences.length;

  let emptySentences = 0;
  let fillerOnlySentences = 0;
  let missingEndPunct = 0;
  let shortFragments = 0;
  let hallucinationMatches = 0;
  let trailingConnectiveMatches = 0;

  let consecutiveDupCount = 1;
  let hasRepeatedLoop = false;

  for (let i = 0; i < sentences.length; i += 1) {
    const s = sentences[i];
    const txt = String(s?.text ?? '').trim();
    const prevTxt = i > 0 ? String(sentences[i - 1]?.text ?? '').trim() : '';
    const nextTxt = i + 1 < sentences.length ? String(sentences[i + 1]?.text ?? '').trim() : '';

    if (!txt) {
      emptySentences += 1;
      continue;
    }
    if (FILLER_ONLY_RE.test(txt)) {
      fillerOnlySentences += 1;
    }
    if (!END_PUNCT_RE.test(txt)) {
      missingEndPunct += 1;
    }
    const bare = txt.replace(/[，。、！？；：「」『』（）《》\s]/g, '');
    if (bare.length > 0 && bare.length <= 3) {
      shortFragments += 1;
    }

    // R2: Whisper hallucination phrases or 3+ identical consecutive segments
    if (WHISPER_HALLUCINATION_RE.test(txt)) {
      hallucinationMatches += 1;
    }
    if (i > 0 && txt === prevTxt && bare.length >= 4) {
      consecutiveDupCount += 1;
      if (consecutiveDupCount >= 3) hasRepeatedLoop = true;
    } else {
      consecutiveDupCount = 1;
    }

    // R3: Trailing dangling connective cut by period
    if (TRAILING_DANGLING_CONNECTIVE_RE.test(txt)) {
      trailingConnectiveMatches += 1;
    }

    // Y1: Suspect chopped incomplete clause ending in '。'
    if (
      SUSPECT_CHOPPED_CLAUSE_RE.test(txt) &&
      !CHOPPED_CLAUSE_WHITELIST_RE.test(txt) &&
      i + 1 < sentences.length
    ) {
      const card = {
        id: s.id || `idx-${i}`,
        ruleCode: 'Y1_SUSPECT_CHOPPED_CLAUSE',
        prev: prevTxt,
        cur: txt,
        next: nextTxt,
        hint: '疑似未完子句被句號切斷；請判斷改為逗號、併入下句或維持原句',
        allowedActions: ['FIX', 'MERGE_NEXT', 'KEEP'],
      };
      warnings.push({ code: card.ruleCode, sentenceId: card.id, message: `Suspect chopped clause: "${txt}"` });
      radarCards.push(card);
    }

    // Y2: Suspect question ending in '。'
    if (
      SUSPECT_QUESTION_PERIOD_RE.test(txt) &&
      !QUOTED_QUESTION_RE.test(txt) &&
      !/？/.test(txt)
    ) {
      const card = {
        id: s.id || `idx-${i}`,
        ruleCode: 'Y2_SUSPECT_QUESTION_PERIOD',
        prev: prevTxt,
        cur: txt,
        next: nextTxt,
        hint: '含疑問詞卻以句號結尾；若屬實問請改為全形問號「？」',
        allowedActions: ['FIX', 'KEEP'],
      };
      warnings.push({ code: card.ruleCode, sentenceId: card.id, message: `Suspect question with period: "${txt}"` });
      radarCards.push(card);
    }

    // Y4: High-risk Buddhist homophone traps
    for (const trap of HOMOPHONE_TRAPS) {
      if (trap.re.test(txt)) {
        const card = {
          id: s.id || `idx-${i}`,
          ruleCode: 'Y4_SUSPECT_HOMOPHONE_TERM',
          prev: prevTxt,
          cur: txt,
          next: nextTxt,
          hint: trap.hint,
          allowedActions: ['FIX', 'KEEP'],
        };
        warnings.push({ code: card.ruleCode, sentenceId: card.id, message: `Suspect homophone "${trap.term}": "${txt}"` });
        radarCards.push(card);
        break;
      }
    }
  }

  const missingEndPunctRatio = totalSentences > 0 ? missingEndPunct / totalSentences : 0;
  const shortFragmentRatio = totalSentences > 0 ? shortFragments / totalSentences : 0;

  if (emptySentences > 0) {
    violations.push({
      code: 'EMPTY_SENTENCES',
      message: `Found ${emptySentences} empty sentence(s); remove empty objects instead of leaving "".`,
    });
  }
  if (fillerOnlySentences > 0) {
    violations.push({
      code: 'FILLER_ONLY_SENTENCES',
      message: `Found ${fillerOnlySentences} pure filler/single-word response sentence(s).`,
    });
  }
  if (missingEndPunctRatio > cfg.maxMissingEndPunctRatio) {
    violations.push({
      code: 'MISSING_END_PUNCTUATION',
      message: `Missing end punctuation ratio ${(missingEndPunctRatio * 100).toFixed(1)}% exceeds ${(cfg.maxMissingEndPunctRatio * 100).toFixed(1)}% (${missingEndPunct}/${totalSentences}).`,
    });
  }
  if (shortFragmentRatio > cfg.maxShortFragmentRatio) {
    violations.push({
      code: 'SHORT_FRAGMENT_RATIO',
      message: `Isolated 1-3 char fragment ratio ${(shortFragmentRatio * 100).toFixed(1)}% exceeds ${(cfg.maxShortFragmentRatio * 100).toFixed(1)}% (${shortFragments}/${totalSentences}).`,
    });
  }
  if (hallucinationMatches > 0 || hasRepeatedLoop) {
    violations.push({
      code: 'WHISPER_HALLUCINATION',
      message: `Detected Whisper hallucination (${hallucinationMatches} phrase match(es), repeatedLoop=${hasRepeatedLoop}).`,
    });
  }
  if (trailingConnectiveMatches > 0) {
    violations.push({
      code: 'TRAILING_DANGLING_CONNECTIVE',
      message: `Found ${trailingConnectiveMatches} sentence(s) ending with a dangling connective + period (e.g. "，此外。" / "。因此。").`,
    });
  }

  // R1: Audio vs YouTube duration drift check
  const meta = session._meta || {};
  const audioDur = Number(meta.audioDurationSec ?? meta.audioDuration ?? NaN);
  const ytDur = Number(meta.youtubeDurationSec ?? cfg.youtubeDurationSec ?? NaN);
  const hasOffsetCalibration =
    meta.timeAlignment?.offsetSec !== undefined ||
    meta.timeAlignment?.offsetCalibrated === true ||
    meta.offsetCalibrated === true;
  if (
    Number.isFinite(audioDur) &&
    Number.isFinite(ytDur) &&
    Math.abs(audioDur - ytDur) > cfg.maxAudioYoutubeDriftSec &&
    !hasOffsetCalibration
  ) {
    violations.push({
      code: 'AUDIO_YOUTUBE_DURATION_DRIFT',
      message: `Audio duration (${audioDur}s) differs from YouTube duration (${ytDur}s) by ${Math.abs(audioDur - ytDur).toFixed(1)}s (> ${cfg.maxAudioYoutubeDriftSec}s) without _meta.timeAlignment.offsetSec calibration.`,
    });
  }

  const paragraphs = Array.isArray(session.paragraphs) ? session.paragraphs : [];
  let maxParagraphSentences = 0;
  let longestParagraphId = null;
  for (const p of paragraphs) {
    const pSents = Array.isArray(p.sentences) ? p.sentences : [];
    const n = pSents.length;
    if (n > maxParagraphSentences) {
      maxParagraphSentences = n;
      longestParagraphId = p.id || null;
    }

    // Y3: Suspect Level-1 chapter heading drift
    const heading = String(p.heading || '').trim();
    const mHead = heading.match(/^\d+[.、]\s*(.+)$/);
    if (mHead && pSents.length > 0 && !GENERIC_HEADING_RE.test(mHead[1])) {
      const firstSent = pSents[0];
      const firstTxt = String(firstSent?.text || '').trim();
      const headBigrams = cjkBigrams(mHead[1]);
      const firstWindow = pSents.slice(0, 2).map((x) => x.text || '').join('');
      const firstBigrams = cjkBigrams(firstWindow);
      let overlap = 0;
      for (const bg of headBigrams) {
        if (firstBigrams.has(bg)) overlap += 1;
      }
      if (MID_PARA_CONTINUATION_RE.test(firstTxt) || (headBigrams.size >= 2 && overlap === 0)) {
        const card = {
          id: firstSent.id || p.id,
          paragraphId: p.id,
          ruleCode: 'Y3_SUSPECT_HEADING_DRIFT',
          heading,
          prev: '',
          cur: firstTxt,
          next: pSents[1]?.text || '',
          hint: '章節首句與標題關鍵詞脫節或以承接詞開頭，請確認章節切點是否因時間軸偏移錯位',
          allowedActions: ['KEEP', 'RELOCATE_HEADING'],
        };
        warnings.push({ code: card.ruleCode, sentenceId: card.id, message: `Heading "${heading}" starts with "${firstTxt.slice(0, 30)}"` });
        radarCards.push(card);
      }
    }
  }
  if (maxParagraphSentences > cfg.maxParagraphSentences) {
    violations.push({
      code: 'PARAGRAPH_TOO_LONG',
      message: `Paragraph ${longestParagraphId ?? '(unknown)'} has ${maxParagraphSentences} sentences (max allowed: ${cfg.maxParagraphSentences}). Split into Level-2 natural paragraphs (150-350 chars).`,
    });
  }

  const hasAdjudication = Boolean(meta.adjudicationRecord);
  const correctionsPending = getNumericCount(meta.correctionsPending);
  const hallucinationSuspects = getNumericCount(meta.hallucinationSuspects);

  if (correctionsPending > 0 && !hasAdjudication) {
    violations.push({
      code: 'CORRECTIONS_PENDING',
      message: `_meta.correctionsPending is ${correctionsPending}; resolve to 0 before Stage 6 / merge.`,
    });
  }
  if (hallucinationSuspects > 0 && !hasAdjudication) {
    violations.push({
      code: 'HALLUCINATION_SUSPECTS',
      message: `_meta.hallucinationSuspects is ${hallucinationSuspects}; resolve to 0 before Stage 6 / merge.`,
    });
  }

  const topics =
    session.contentOverview?.discussionTopics ??
    session.discussionQuestions ??
    null;

  if (!Array.isArray(topics)) {
    violations.push({
      code: 'DISCUSSION_TOPICS_COUNT',
      message: `discussionTopics/discussionQuestions is missing; expected ${cfg.minDiscussionTopics}..${cfg.maxDiscussionTopics}.`,
    });
  } else {
    if (topics.length < cfg.minDiscussionTopics || topics.length > cfg.maxDiscussionTopics) {
      violations.push({
        code: 'DISCUSSION_TOPICS_COUNT',
        message: `discussionTopics/discussionQuestions count is ${topics.length}; expected ${cfg.minDiscussionTopics}..${cfg.maxDiscussionTopics}.`,
      });
    }
    const invalidQMark = topics.filter((item) => {
      const q = typeof item === 'string'
        ? item.trim()
        : String(item?.displayQuestion ?? item?.text ?? item?.rawQuestion ?? '').trim();
      return q.length === 0 || !q.endsWith('？');
    });
    if (invalidQMark.length > 0) {
      violations.push({
        code: 'DISCUSSION_TOPICS_QUESTION_MARK',
        message: `${invalidQMark.length} discussion topic(s) are empty or do not end with full-width "？".`,
      });
    }
  }

  return {
    sessionId: session.sessionId || null,
    ok: violations.length === 0,
    metrics: {
      totalSentences,
      emptySentences,
      fillerOnlySentences,
      missingEndPunct,
      missingEndPunctRatio,
      shortFragments,
      shortFragmentRatio,
      hallucinationMatches,
      trailingConnectiveMatches,
      paragraphCount: paragraphs.length,
      maxParagraphSentences,
      correctionsPending,
      hallucinationSuspects,
      discussionTopicCount: Array.isArray(topics) ? topics.length : 0,
      warningCount: warnings.length,
    },
    violations,
    warnings,
    radarCards,
  };
}

export function auditBaseTextNfkc(text) {
  const matches = String(text ?? '').match(NON_NFKC_CJK_RE) || [];
  return {
    ok: matches.length === 0,
    nonNfkcCount: matches.length,
    samples: [...new Set(matches)].slice(0, 10),
  };
}

export function auditCourseDir(courseDir, opts = {}) {
  const sessionsDir = path.join(courseDir, 'sessions');
  const sourceTextDir = path.join(courseDir, 'source_text');
  const sessionReports = [];
  const sourceTextReports = [];

  if (fs.existsSync(sessionsDir)) {
    const files = fs
      .readdirSync(sessionsDir)
      .filter((f) => /^session_.*\.json$/.test(f))
      .sort();
    for (const file of files) {
      const fullPath = path.join(sessionsDir, file);
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const res = auditSession(data, opts);
      sessionReports.push({ file, ...res });
    }
  }

  if (fs.existsSync(sourceTextDir)) {
    const files = fs
      .readdirSync(sourceTextDir)
      .filter((f) => f.endsWith('.txt'))
      .sort();
    for (const file of files) {
      const fullPath = path.join(sourceTextDir, file);
      const txt = fs.readFileSync(fullPath, 'utf8');
      const res = auditBaseTextNfkc(txt);
      sourceTextReports.push({ file, ...res });
    }
  }

  const errors = [];
  if (sessionReports.length === 0) {
    errors.push({
      code: 'NO_SESSIONS_FOUND',
      message: 'No sessions/session_*.json files found in course directory.',
    });
  }

  const ok =
    errors.length === 0 &&
    sessionReports.every((r) => r.ok) &&
    sourceTextReports.every((r) => r.ok);

  return {
    courseDir,
    ok,
    errors,
    sessions: sessionReports,
    sourceTexts: sourceTextReports,
  };
}

function getArgValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${flag}=`;
  const eq = args.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : null;
}

function main(argv) {
  const args = argv.slice(2);
  const asJson = args.includes('--json');
  const radarOut = getArgValue(args, '--radar-out');
  const skipValues = new Set(radarOut ? [radarOut] : []);
  const target = args.find((a) => !a.startsWith('--') && !skipValues.has(a));
  if (!target) {
    console.error('Usage: node scripts/audit_reading_quality.mjs <courseDir|session.json> [--json] [--radar-out <path>]');
    process.exit(2);
  }

  const absTarget = path.resolve(target);
  if (!fs.existsSync(absTarget)) {
    console.error(`Target not found: ${absTarget}`);
    process.exit(2);
  }

  const stat = fs.statSync(absTarget);
  const report = stat.isDirectory()
    ? auditCourseDir(absTarget)
    : auditSession(JSON.parse(fs.readFileSync(absTarget, 'utf8')));

  if (radarOut) {
    const radarPayload = stat.isDirectory()
      ? {
          target,
          generatedAt: new Date().toISOString(),
          sessions: report.sessions.map((s) => ({
            sessionId: s.sessionId,
            file: s.file,
            totalWarnings: s.radarCards.length,
            cards: s.radarCards,
          })),
        }
      : {
          target,
          sessionId: report.sessionId,
          generatedAt: new Date().toISOString(),
          totalWarnings: report.radarCards.length,
          cards: report.radarCards,
        };
    fs.mkdirSync(path.dirname(path.resolve(radarOut)), { recursive: true });
    fs.writeFileSync(path.resolve(radarOut), `${JSON.stringify(radarPayload, null, 2)}\n`, 'utf8');
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else if (stat.isDirectory()) {
    console.log(`Reading Quality Audit: ${target} -> ${report.ok ? 'PASS' : 'FAIL'}`);
    for (const err of report.errors || []) {
      console.log(`  [FAIL] ${err.code}: ${err.message}`);
    }
    for (const s of report.sessions) {
      const status = s.ok ? 'PASS' : 'FAIL';
      console.log(`  [${status}] ${s.file} (sents=${s.metrics.totalSentences}, noPunct=${(s.metrics.missingEndPunctRatio * 100).toFixed(1)}%, short=${(s.metrics.shortFragmentRatio * 100).toFixed(1)}%, maxPara=${s.metrics.maxParagraphSentences}, warnings=${s.metrics.warningCount})`);
      for (const v of s.violations) {
        console.log(`      - [RED] ${v.code}: ${v.message}`);
      }
    }
    for (const st of report.sourceTexts) {
      if (!st.ok) {
        console.log(`  [FAIL] source_text/${st.file}: ${st.nonNfkcCount} non-NFKC CJK char(s), samples=${st.samples.join(',')}`);
      }
    }
  } else {
    console.log(`Reading Quality Audit: ${target} -> ${report.ok ? 'PASS' : 'FAIL'} (warnings=${report.metrics.warningCount})`);
    for (const v of report.violations) {
      console.log(`  - [RED] ${v.code}: ${v.message}`);
    }
    if (report.warnings.length > 0) {
      console.log(`  [YELLOW] ${report.warnings.length} review radar warning(s)${radarOut ? ` -> saved to ${radarOut}` : ''}`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv);
}
