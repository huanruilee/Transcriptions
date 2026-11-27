#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findPossibleNameLeaks } from './study_group_preflight.mjs';

const END_PUNCT_RE = /[。？！…」』）"'：；]$/;
const SIMPLIFIED_ONLY_RE = /[虽却这为体学师义论说对问题发会国经时过还进异间]/g;
const CURLY_QUOTES_RE = /[“”‘’]/g;
const LAST_UPDATED_HM_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/;

export function computeSessionMetrics(session, rootDir = process.cwd(), relPath = '') {
  const paras = Array.isArray(session.paragraphs) ? session.paragraphs : [];
  const paraLens = paras.map(p => (Array.isArray(p.sentences) ? p.sentences.length : 0));
  const totalSentences = paraLens.reduce((a, b) => a + b, 0);

  let noEndPunct = 0;
  let shortFragments = 0;
  let headingsCount = 0;
  let longHeadingsOver35Chars = 0;
  let emptyParas = 0;
  let missingParaIds = 0;
  let missingReviewNeeded = 0;
  let simplifiedChars = 0;
  let curlyQuotes = 0;
  let possibleNameLeaks = 0;
  const speakersSet = new Set();

  const countSimplified = (str) => {
    if (!str) return 0;
    const m = String(str).match(SIMPLIFIED_ONLY_RE);
    return m ? m.length : 0;
  };

  for (const p of paras) {
    const spk = String(p.speaker || '').trim();
    if (spk) speakersSet.add(spk);
    if (!p.id) missingParaIds += 1;
    const sents = Array.isArray(p.sentences) ? p.sentences : [];
    if (sents.length === 0) emptyParas += 1;
    const h = String(p.heading || p.title || p.sectionTitle || '').trim();
    if (h) {
      headingsCount += 1;
      if (h.length > 35) longHeadingsOver35Chars += 1;
      simplifiedChars += countSimplified(h);
    }
    for (const st of sents) {
      if (typeof st.reviewNeeded !== 'boolean') missingReviewNeeded += 1;
      const t = String(st.text || '').trim();
      if (!t) continue;
      simplifiedChars += countSimplified(t);
      const cq = t.match(CURLY_QUOTES_RE);
      if (cq) curlyQuotes += cq.length;
      possibleNameLeaks += findPossibleNameLeaks(t).length;
      if (t.length <= 3) shortFragments += 1;
      if (!END_PUNCT_RE.test(t)) noEndPunct += 1;
    }
  }

  const maxPara = paraLens.length ? Math.max(...paraLens) : 0;
  const minPara = paraLens.length ? Math.min(...paraLens) : 0;
  const avgPara = paraLens.length ? Number((totalSentences / paraLens.length).toFixed(1)) : 0;
  const noEndPunctPct = totalSentences ? Number(((100 * noEndPunct) / totalSentences).toFixed(1)) : 0;
  const shortFragmentPct = totalSentences ? Number(((100 * shortFragments) / totalSentences).toFixed(1)) : 0;

  let rawTextDiffCount = null;
  if (relPath) {
    try {
      const baseJson = execFileSync('git', ['show', `origin/main:${relPath}`], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const baseSession = JSON.parse(baseJson);
      const baseMap = new Map();
      for (const p of baseSession.paragraphs || []) {
        for (const st of p.sentences || []) {
          if (st.id) baseMap.set(st.id, String(st.rawText || ''));
        }
      }
      let diffs = 0;
      for (const p of paras) {
        for (const st of p.sentences || []) {
          if (st.id && baseMap.has(st.id) && baseMap.get(st.id) !== String(st.rawText || '')) {
            diffs += 1;
          }
        }
      }
      rawTextDiffCount = diffs;
    } catch {
      rawTextDiffCount = null;
    }
  }

  const co = session.contentOverview || {};
  const dq = session.discussionQuestions || session.discussionTopics || [];
  for (const item of dq) {
    simplifiedChars += countSimplified(
      typeof item === 'string' ? item : (item?.displayQuestion || item?.question || '')
    );
  }
  simplifiedChars += countSimplified(co.sourceDigest);
  for (const mp of co.mainPoints || []) {
    simplifiedChars += countSimplified(typeof mp === 'string' ? mp : (mp?.text || mp?.summary || ''));
  }

  return {
    paragraphs: paras.length,
    paraSents: { min: minPara, avg: avgPara, max: maxPara },
    totalSentences,
    noEndPunctPct,
    shortFragmentPct,
    maxParaOver35: paraLens.filter(n => n > 35).length,
    headingsCount,
    longHeadingsOver35Chars,
    discussionQuestionsCount: dq.length,
    contentOverview: {
      status: co.status || null,
      mainPointsCount: Array.isArray(co.mainPoints) ? co.mainPoints.length : 0,
      hasSourceDigest: Boolean(co.sourceDigest),
    },
    rawTextDiffCount,
    qualityFlags: {
      speakers: [...speakersSet].sort(),
      emptyParas,
      missingParaIds,
      missingReviewNeeded,
      simplifiedChars,
      curlyQuotes,
      possibleNameLeaks,
    },
  };
}

function resolveCourse(catalog, courseArg) {
  const norm = courseArg.replace(/\/+$/, '');
  const withPrefix = norm.startsWith('courses/') ? norm : `courses/${norm}`;
  return (catalog.courses || []).find(
    c => c.id === courseArg || c.path === norm || c.path === withPrefix
  );
}

function resolveSessionFile(courseDir, sessionArg) {
  const clean = sessionArg.replace(/^sessions\//, '').replace(/\.json$/, '');
  const m = clean.match(/^(?:session[_-])?(\d+)$/i);
  const fileName = m ? `session_${m[1].padStart(2, '0')}.json` : `${clean}.json`;
  return path.join(courseDir, 'sessions', fileName);
}

function collectRelatedFiles(rootDir, courseId, courseDir, sessionPath) {
  const related = [];
  const tocPath = path.join(courseDir, 'toc.json');
  if (fs.existsSync(path.join(rootDir, tocPath))) related.push(tocPath);

  const outlinesDir = path.join(courseDir, 'source_outlines');
  if (fs.existsSync(path.join(rootDir, outlinesDir))) related.push(outlinesDir);

  const numMatch = path.basename(sessionPath).match(/session_(\d+)\.json$/);
  if (numMatch && courseId === 'shi-liang-lun-study-group-2025') {
    const num = numMatch[1];
    const bundlePath = path.join('reviews/evidence/study-group-2025', `playlist-${num}`, 'remote_reviewer_bundle.json');
    if (fs.existsSync(path.join(rootDir, bundlePath))) related.push(bundlePath);
  }
  return related;
}

export function inspectSession(courseArg, sessionArg, rootDir = process.cwd()) {
  const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'courses/catalog.json'), 'utf8'));
  const course = resolveCourse(catalog, courseArg);
  if (!course || !course.path) {
    throw new Error(`Course not found in catalog.json: ${courseArg}`);
  }
  const sessionRelPath = resolveSessionFile(course.path, sessionArg);
  const absSessionPath = path.join(rootDir, sessionRelPath);
  if (!fs.existsSync(absSessionPath)) {
    throw new Error(`Session file not found: ${sessionRelPath}`);
  }
  const session = JSON.parse(fs.readFileSync(absSessionPath, 'utf8'));
  const metrics = computeSessionMetrics(session, rootDir, sessionRelPath);

  return {
    courseId: course.id,
    sessionFile: sessionRelPath,
    publicationState: course.publicationState ?? null,
    hasGrounding: fs.existsSync(path.join(rootDir, course.path, 'grounding.json')),
    hasCourseGuide: fs.existsSync(path.join(rootDir, course.path, 'COURSE_GUIDE.md')),
    ...metrics,
    relatedFiles: collectRelatedFiles(rootDir, course.id, course.path, sessionRelPath),
  };
}


export function evaluateLastUpdatedBump(currentLastUpdated, baseLastUpdated = null) {
  const violations = [];
  const cur = currentLastUpdated == null ? '' : String(currentLastUpdated).trim();
  if (!cur || !LAST_UPDATED_HM_RE.test(cur)) {
    violations.push(`lastUpdated must be YYYY-MM-DD HH:MM (got: ${cur || 'missing'})`);
  } else if (baseLastUpdated !== null && cur === String(baseLastUpdated).trim()) {
    violations.push(`lastUpdated unchanged from base (${cur})`);
  }
  return { pass: violations.length === 0, violations };
}

export function evaluateStrictSession(summary) {
  const violations = [];
  if (summary.noEndPunctPct >= 5) violations.push(`noEndPunctPct=${summary.noEndPunctPct} (>= 5%)`);
  if (summary.shortFragmentPct >= 2) violations.push(`shortFragmentPct=${summary.shortFragmentPct} (>= 2%)`);
  if (summary.maxParaOver35 > 0) violations.push(`maxParaOver35=${summary.maxParaOver35}`);
  const qf = summary.qualityFlags || {};
  if ((qf.emptyParas || 0) > 0) violations.push(`emptyParas=${qf.emptyParas}`);
  if ((qf.missingParaIds || 0) > 0) violations.push(`missingParaIds=${qf.missingParaIds}`);
  if ((qf.missingReviewNeeded || 0) > 0) violations.push(`missingReviewNeeded=${qf.missingReviewNeeded}`);
  if ((qf.simplifiedChars || 0) > 0) violations.push(`simplifiedChars=${qf.simplifiedChars}`);
  if ((qf.curlyQuotes || 0) > 0) violations.push(`curlyQuotes=${qf.curlyQuotes}`);
  if ((qf.possibleNameLeaks || 0) > 0) violations.push(`possibleNameLeaks=${qf.possibleNameLeaks}`);
  return { pass: violations.length === 0, violations };
}

export function inspectSessionByFile(filePath, rootDir = process.cwd()) {
  const relPath = path.isAbsolute(filePath) ? path.relative(rootDir, filePath) : filePath;
  const norm = relPath.replace(/\\/g, "/");
  const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, "courses/catalog.json"), "utf8"));
  const course = (catalog.courses || []).find(c => c.path && norm.startsWith(`${c.path}/`));
  const absSessionPath = path.join(rootDir, norm);
  if (!fs.existsSync(absSessionPath)) {
    throw new Error(`Session file not found: ${norm}`);
  }
  const session = JSON.parse(fs.readFileSync(absSessionPath, "utf8"));
  const metrics = computeSessionMetrics(session, rootDir, norm);
  return {
    courseId: course ? course.id : null,
    sessionFile: norm,
    publicationState: course ? (course.publicationState ?? null) : null,
    hasGrounding: course ? fs.existsSync(path.join(rootDir, course.path, "grounding.json")) : false,
    hasCourseGuide: course ? fs.existsSync(path.join(rootDir, course.path, "COURSE_GUIDE.md")) : false,
    ...metrics,
    relatedFiles: course ? collectRelatedFiles(rootDir, course.id, course.path, norm) : [],
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const rawArgs = process.argv.slice(2);
  const strict = rawArgs.includes('--strict');
  const fileIdx = rawArgs.indexOf('--file');
  const fileArg = fileIdx >= 0 ? rawArgs[fileIdx + 1] : null;
  const baseRefIdx = rawArgs.indexOf('--base-ref');
  const baseRefArg = baseRefIdx >= 0 ? rawArgs[baseRefIdx + 1] : null;
  const positional = rawArgs.filter(
    (a, i) => !a.startsWith('--') && (fileIdx < 0 || i !== fileIdx + 1) && (baseRefIdx < 0 || i !== baseRefIdx + 1)
  );

  if (!fileArg && positional.length < 2) {
    console.error('Usage: node scripts/check_session.mjs <course_dir_or_id> <session_num_or_file> [--strict] | --file <path> [--strict]');
    process.exit(2);
  }
  const summary = fileArg ? inspectSessionByFile(fileArg) : inspectSession(positional[0], positional[1]);
  const compact = Object.fromEntries(
    Object.entries(summary).map(([k, v]) => [k, v])
  );
  // Keep output <= 20 lines by serializing nested objects/arrays on one line
  const lines = ['{'];
  const entries = Object.entries(compact);
  entries.forEach(([k, v], idx) => {
    const comma = idx < entries.length - 1 ? ',' : '';
    lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
  });
  lines.push('}');
  console.log(lines.join('\n'));
  if (strict) {
    const res = evaluateStrictSession(summary);
    if (baseRefArg && fileArg) {
      const curSession = JSON.parse(fs.readFileSync(fileArg, 'utf8'));
      let baseLastUpdated = null;
      try {
        const baseRaw = execFileSync('git', ['show', `${baseRefArg}:${summary.sessionFile}`], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        baseLastUpdated = JSON.parse(baseRaw).lastUpdated ?? null;
      } catch {
        baseLastUpdated = null;
      }
      const luRes = evaluateLastUpdatedBump(curSession.lastUpdated ?? null, baseLastUpdated);
      if (!luRes.pass) {
        res.violations.push(...luRes.violations);
        res.pass = false;
      }
    }
    if (!res.pass) {
      console.error(`STRICT_CHECK_FAILED: ${res.violations.join(', ')}`);
      process.exit(1);
    }
  }
}
