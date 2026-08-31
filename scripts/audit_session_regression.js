#!/usr/bin/env node

/**
 * 🧘 Buddhist Transcription Session Quality Audit & Regression Runner
 * 
 * Usage:
 *   node scripts/audit_session_regression.js 97B
 *   node scripts/audit_session_regression.js all
 *   node scripts/audit_session_regression.js legacy
 *   node scripts/audit_session_regression.js converted
 */

import fs from 'node:fs';
import path from 'node:path';

const SESSIONS_DIR = path.resolve('courses/入中論善顯密意疏/sessions');
const SOURCE_DIR = path.resolve('courses/入中論善顯密意疏/source_text');
const COURSE_PATH = path.resolve('courses/入中論善顯密意疏/course.json');
const AUDIO_MAP_PATH = path.resolve('courses/入中論善顯密意疏/audio_map.json');

const courseData = fs.existsSync(COURSE_PATH) ? JSON.parse(fs.readFileSync(COURSE_PATH, 'utf8')) : { sessions: [] };
const audioMap = fs.existsSync(AUDIO_MAP_PATH) ? JSON.parse(fs.readFileSync(AUDIO_MAP_PATH, 'utf8')) : {};

// Negative forbidden homophone patterns that MUST NEVER appear in quality-assured transcripts
const FORBIDDEN_HOMOPHONES = [
  { pattern: /非紋症|肺紋症/, name: '非紋症/肺紋症', expected: '飛蚊症' },
  { pattern: /至向有|自向有/, name: '至向有/自向有', expected: '自相有' },
  { pattern: /損壞羹|損壞更/, name: '損壞羹/更', expected: '損壞根' },
  { pattern: /設法心法/, name: '設法心法', expected: '色法心法' },
  { pattern: /不先一心法/, name: '不先一心法', expected: '不相應行法' },
  { pattern: /生一地|生意地/, name: '生一地/生意地', expected: '勝義諦' },
  { pattern: /七[狂況]法/, name: '七狂法/七況法', expected: '欺誑法' },
  { pattern: /執陽眼為水|羊眼/, name: '陽眼/羊眼', expected: '陽焰' },
  { pattern: /執那個正的是/, name: '執那個正的是', expected: '執那個正的識' },
  { pattern: /人以四十/, name: '人以四十', expected: '但以世俗' },
  { pattern: /聖意菩提心/, name: '聖意菩提心', expected: '勝義菩提心' },
  { pattern: /聖意地|圣意地|聖一地|圣一地|圣义地|圣与地|聖義地|聖與地/, name: '聖意地等', expected: '勝義諦' },
  { pattern: /四肢低|身意低|身識低|四书/, name: '四肢低/身意低等', expected: '世俗諦/勝義諦' },
  { pattern: /二體型|二题性/, name: '二體型/二题性', expected: '二諦性/二體性' },
  { pattern: /果二生/, name: '果二生', expected: '菩提心生' },
  { pattern: /十一作事念持/, name: '十一作事念持', expected: '是以作意受持' }
];

const STRICT_SIMP_REGEX = /[为这样个说体经论门从对么变实证觉关开边过问题时间还会点现显义极胜广当无师发与见随应处观摄识别业释难车声闻缘执许计总种听讲话导读记诵辩净谛]/g;

function getSourcePages(pageRange) {
  if (!pageRange) return [];
  const matches = pageRange.match(/\d+/g);
  if (!matches) return [];
  const pages = [];
  if (matches.length === 1) {
    pages.push(parseInt(matches[0], 10));
  } else if (matches.length >= 2) {
    const start = parseInt(matches[0], 10);
    const end = parseInt(matches[1], 10);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
  }
  return pages;
}

function loadTreatiseText(pages) {
  let combined = '';
  for (const pageNum of pages) {
    const pStr = String(pageNum).padStart(3, '0');
    const pPath = path.join(SOURCE_DIR, `page_${pStr}.txt`);
    if (fs.existsSync(pPath)) {
      combined += fs.readFileSync(pPath, 'utf8') + '\n';
    }
  }
  return combined;
}

export function auditSession(sessionId) {
  const normId = sessionId.replace(/^session_/, '').replace(/\.json$/, '');
  const fileName = `session_${normId}.json`;
  const filePath = path.join(SESSIONS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Session file not found: ${filePath}`);
    return { passed: false, error: 'File not found' };
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const courseMeta = courseData.sessions.find(s => s.sessionId === normId || s.id === normId) || {};
  const expectedAudioUrl = audioMap[normId] || courseMeta.officialAudioUrl || courseMeta.flydayAudioUrl || '';
  const pages = getSourcePages(courseMeta.pageRange || data.title);
  const sourceText = loadTreatiseText(pages);

  console.log(`\n================================================================`);
  console.log(`  🧘 Session Quality Audit & Regression Report: ${normId}`);
  console.log(`  Title: ${data.title || courseMeta.title || 'N/A'}`);
  console.log(`  Source Page(s): ${pages.length > 0 ? pages.map(p => `p.${p}`).join(', ') : 'Unknown'}`);
  console.log(`================================================================`);

  const results = {
    sessionId: normId,
    checks: [],
    failures: 0,
    warnings: 0
  };

  // 1. Metadata Check
  const hasMeta = !!(data._meta && data._meta.engine);
  const isUpgraded = hasMeta && data._meta.engine.includes('whisper');
  if (isUpgraded) {
    results.checks.push({
      pattern: 'Pattern 1: Metadata & Engine Provenance',
      status: 'PASS',
      details: `Engine: ${data._meta.engine}, LLM: ${data._meta.llm_proofread || 'N/A'}, Date: ${data.lastUpdated || data._meta.last_updated || 'N/A'}`
    });
  } else {
    results.failures++;
    results.checks.push({
      pattern: 'Pattern 1: Metadata & Engine Provenance',
      status: 'FAIL',
      details: `Session is in legacy draft state without Whisper Large-v3 / LLM _meta metadata block.`
    });
  }

  // 2. Audio Stream URL Check
  if (expectedAudioUrl && data.audioUrl && data.audioUrl.toLowerCase() === expectedAudioUrl.toLowerCase()) {
    results.checks.push({
      pattern: 'Pattern 2: Official Remote Audio Stream',
      status: 'PASS',
      details: `Matches official Flyday URL: ${data.audioUrl}`
    });
  } else {
    results.failures++;
    results.checks.push({
      pattern: 'Pattern 2: Official Remote Audio Stream',
      status: 'FAIL',
      details: `Audio URL is "${data.audioUrl}", expected Flyday remote stream "${expectedAudioUrl}"`
    });
  }

  // 3. Headings & Semantic Structure
  const headings = (data.paragraphs || []).filter(p => p.heading && p.heading.trim().length > 0);
  const validHeadingSyntax = headings.every(p => /^【.+】.+$/.test(p.heading));
  if (headings.length >= 6 && validHeadingSyntax) {
    results.checks.push({
      pattern: 'Pattern 3: Semantic Headings & Structure',
      status: 'PASS',
      details: `Found ${headings.length} thematic headings strictly matching '【主題】說明' syntax.`
    });
  } else {
    results.failures++;
    results.checks.push({
      pattern: 'Pattern 3: Semantic Headings & Structure',
      status: 'FAIL',
      details: `Found ${headings.length} headings (Expected >= 6 matching '【主題】說明' syntax).`
    });
  }

  // 4. Forbidden Homophone Errors
  const fullText = (data.paragraphs || []).flatMap(p => (p.sentences || []).map(s => s.text)).join(' ');
  const homophoneErrors = [];
  FORBIDDEN_HOMOPHONES.forEach(({ pattern, name, expected }) => {
    const match = fullText.match(pattern);
    if (match) {
      homophoneErrors.push(`"${match[0]}" (${name} -> 應為「${expected}」)`);
    }
  });
  if (homophoneErrors.length === 0) {
    results.checks.push({
      pattern: 'Pattern 4: Buddhist Terminology & Homophone Purity',
      status: 'PASS',
      details: `Zero forbidden ASR homophone errors detected.`
    });
  } else {
    results.failures++;
    results.checks.push({
      pattern: 'Pattern 4: Buddhist Terminology & Homophone Purity',
      status: 'FAIL',
      details: `Detected ${homophoneErrors.length} forbidden errors:\n     - ` + homophoneErrors.join('\n     - ')
    });
  }

  // 5. Monotonicity & Synthetic Uniform Duration
  let monoErrors = 0;
  let prevEnd = 0.0;
  (data.paragraphs || []).forEach(p => {
    (p.sentences || []).forEach(s => {
      if (s.start < prevEnd - 0.05) monoErrors++;
      if (s.end <= s.start) monoErrors++;
      prevEnd = s.end;
    });
  });

  const sentences = (data.paragraphs || []).flatMap(p => p.sentences || []);
  const durations = sentences.map(s => Math.round((s.end - s.start) * 100) / 100);
  const counts = {};
  durations.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
  const maxCount = Math.max(...Object.values(counts), 0);
  const uniformRatio = durations.length > 0 ? maxCount / durations.length : 0;

  if (monoErrors === 0 && uniformRatio <= 0.35) {
    results.checks.push({
      pattern: 'Pattern 5: Timestamp Monotonicity & Acoustic Naturalness',
      status: 'PASS',
      details: `Strictly monotonic forward progression with authentic acoustic duration variance.`
    });
  } else {
    results.failures++;
    results.checks.push({
      pattern: 'Pattern 5: Timestamp Monotonicity & Acoustic Naturalness',
      status: 'FAIL',
      details: `Monotonicity errors: ${monoErrors}, Max uniform duration ratio: ${(uniformRatio * 100).toFixed(1)}%`
    });
  }

  // 6. Traditional Chinese Purity
  const simpMatches = JSON.stringify(data).match(STRICT_SIMP_REGEX);
  if (!simpMatches || simpMatches.length === 0) {
    results.checks.push({
      pattern: 'Pattern 6: Traditional Chinese Purity',
      status: 'PASS',
      details: `0 simplified characters detected.`
    });
  } else {
    results.warnings++;
    results.checks.push({
      pattern: 'Pattern 6: Traditional Chinese Purity',
      status: 'WARN',
      details: `Detected ${simpMatches.length} simplified characters: [${[...new Set(simpMatches)].slice(0, 10).join(', ')}]`
    });
  }

  // 7. Source Text Grounding Check
  if (sourceText) {
    // Extract key sentences / technical terms from source text (lines >= 6 chars)
    const sourceLines = sourceText
      .split('\n')
      .map(l => l.trim().replace(/^\d+\s*/, ''))
      .filter(l => l.length >= 6 && !l.startsWith('【') && !l.startsWith('科判'));
    
    let matchedLines = 0;
    const missingSamples = [];
    sourceLines.slice(0, 10).forEach(line => {
      // check if key chunks of line appear in transcript
      const chunk = line.slice(0, 8);
      if (fullText.includes(chunk)) {
        matchedLines++;
      } else {
        missingSamples.push(chunk);
      }
    });

    if (matchedLines >= 3 || sourceLines.length === 0) {
      results.checks.push({
        pattern: 'Treatise Ground Truth Grounding (source_text/page_XXX.txt)',
        status: 'PASS',
        details: `Correlated with page text (${pages.map(p => `p.${p}`).join(', ')}), treatise phrases verified.`
      });
    } else {
      results.warnings++;
      results.checks.push({
        pattern: 'Treatise Ground Truth Grounding (source_text/page_XXX.txt)',
        status: 'WARN',
        details: `Low alignment with treatise page_${pages.map(p => String(p).padStart(3, '0')).join(', ')}.txt text.\n     Sample treatise phrases not clearly found: "${missingSamples.slice(0, 4).join('", "')}"`
      });
    }
  }

  // Print results
  results.checks.forEach(c => {
    const icon = c.status === 'PASS' ? '✅' : (c.status === 'WARN' ? '⚠️' : '❌');
    console.log(`\n[${icon} ${c.status}] ${c.pattern}`);
    console.log(`   ${c.details}`);
  });

  console.log(`\n----------------------------------------------------------------`);
  if (results.failures === 0) {
    console.log(`✨ AUDIT RESULT: PASSED (29A Golden Standard Compliant)`);
  } else {
    console.log(`⚠️ AUDIT RESULT: FAILED (${results.failures} failures, ${results.warnings} warnings)`);
    console.log(`👉 Recommendation: Run Grounded Whisper + LLM proofreading pipeline for session ${normId}.`);
  }
  console.log(`================================================================\n`);

  return results;
}

// CLI entry point
const args = process.argv.slice(2);
const target = args[0] || '97B';

if (target === 'all' || target === 'legacy' || target === 'converted') {
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith('session_') && f.endsWith('.json') && !f.includes('bak'));
  let total = 0;
  let passCount = 0;
  let failCount = 0;

  files.forEach(f => {
    const sid = f.replace(/^session_/, '').replace(/\.json$/, '');
    const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
    const isConverted = !!(data._meta && data._meta.engine);

    if (target === 'legacy' && isConverted) return;
    if (target === 'converted' && !isConverted) return;

    total++;
    const res = auditSession(sid);
    if (res.failures === 0) passCount++;
    else failCount++;
  });

  console.log(`\n📊 Batch Audit Summary for mode "${target}":`);
  console.log(`   Total Audited: ${total}`);
  console.log(`   Passed (Golden Standard): ${passCount}`);
  console.log(`   Failed (Needs Upgrade): ${failCount}\n`);
} else {
  const res = auditSession(target);
  process.exit(res.failures > 0 ? 1 : 0);
}
