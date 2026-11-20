#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FILLER_ONLY_RE = /^(呃|嗯|啊|喔|哦|欸|唉|嘿|那|好|就是說|對|是)[，。、！？\s]*$/;
const END_PUNCT_RE = /[。？！…」》）】；：，、]$/;
const NON_NFKC_CJK_RE = /[\u2F00-\u2FDF\u3190-\u319F\u3200-\u32FF\u3300-\u33FF\uF900-\uFAFF]/g;

export const DEFAULT_THRESHOLDS = {
  maxMissingEndPunctRatio: 0.05,
  maxShortFragmentRatio: 0.02,
  maxParagraphSentences: 35,
  minDiscussionTopics: 3,
  maxDiscussionTopics: 7,
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

export function auditSession(session, opts = {}) {
  const cfg = { ...DEFAULT_THRESHOLDS, ...opts };
  const violations = [];
  const sentences = extractSentences(session);
  const totalSentences = sentences.length;

  let emptySentences = 0;
  let fillerOnlySentences = 0;
  let missingEndPunct = 0;
  let shortFragments = 0;

  for (const s of sentences) {
    const txt = String(s?.text ?? '').trim();
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

  const paragraphs = Array.isArray(session.paragraphs) ? session.paragraphs : [];
  let maxParagraphSentences = 0;
  let longestParagraphId = null;
  for (const p of paragraphs) {
    const n = Array.isArray(p.sentences) ? p.sentences.length : 0;
    if (n > maxParagraphSentences) {
      maxParagraphSentences = n;
      longestParagraphId = p.id || null;
    }
  }
  if (maxParagraphSentences > cfg.maxParagraphSentences) {
    violations.push({
      code: 'PARAGRAPH_TOO_LONG',
      message: `Paragraph ${longestParagraphId ?? '(unknown)'} has ${maxParagraphSentences} sentences (max allowed: ${cfg.maxParagraphSentences}). Split into Level-2 natural paragraphs (150-350 chars).`,
    });
  }

  const meta = session._meta || {};
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

  if (Array.isArray(topics)) {
    if (topics.length < cfg.minDiscussionTopics || topics.length > cfg.maxDiscussionTopics) {
      violations.push({
        code: 'DISCUSSION_TOPICS_COUNT',
        message: `discussionTopics/discussionQuestions count is ${topics.length}; expected ${cfg.minDiscussionTopics}..${cfg.maxDiscussionTopics}.`,
      });
    }
    const missingQMark = topics.filter((item) => {
      const q = typeof item === 'string' ? item.trim() : String(item?.text ?? '').trim();
      return q.length > 0 && !q.endsWith('？');
    });
    if (missingQMark.length > 0) {
      violations.push({
        code: 'DISCUSSION_TOPICS_QUESTION_MARK',
        message: `${missingQMark.length} discussion topic(s) do not end with full-width "？".`,
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
      paragraphCount: paragraphs.length,
      maxParagraphSentences,
      correctionsPending,
      hallucinationSuspects,
      discussionTopicCount: Array.isArray(topics) ? topics.length : null,
    },
    violations,
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

  const ok =
    sessionReports.every((r) => r.ok) && sourceTextReports.every((r) => r.ok);

  return {
    courseDir,
    ok,
    sessions: sessionReports,
    sourceTexts: sourceTextReports,
  };
}

function main(argv) {
  const args = argv.slice(2);
  const asJson = args.includes('--json');
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    console.error('Usage: node scripts/audit_reading_quality.mjs <courseDir|session.json> [--json]');
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

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else if (stat.isDirectory()) {
    console.log(`Reading Quality Audit: ${target} -> ${report.ok ? 'PASS' : 'FAIL'}`);
    for (const s of report.sessions) {
      const status = s.ok ? 'PASS' : 'FAIL';
      console.log(`  [${status}] ${s.file} (sents=${s.metrics.totalSentences}, noPunct=${(s.metrics.missingEndPunctRatio * 100).toFixed(1)}%, short=${(s.metrics.shortFragmentRatio * 100).toFixed(1)}%, maxPara=${s.metrics.maxParagraphSentences})`);
      for (const v of s.violations) {
        console.log(`      - ${v.code}: ${v.message}`);
      }
    }
    for (const st of report.sourceTexts) {
      if (!st.ok) {
        console.log(`  [FAIL] source_text/${st.file}: ${st.nonNfkcCount} non-NFKC CJK char(s), samples=${st.samples.join(',')}`);
      }
    }
  } else {
    console.log(`Reading Quality Audit: ${target} -> ${report.ok ? 'PASS' : 'FAIL'}`);
    for (const v of report.violations) {
      console.log(`  - ${v.code}: ${v.message}`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv);
}
