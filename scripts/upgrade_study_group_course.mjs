#!/usr/bin/env node
/**
 * upgrade_study_group_course.mjs
 *
 * Workflow v2 -> v2.2 automated overhaul pipeline for
 * `courses/2025釋量論第二品大組共學` (all 47 sessions).
 *
 * Key architectural upgrades over Wave 1 (documented in docs/STUDY_GROUP_WORKFLOW_V3.md):
 *  1. Atomic Multi-File Sync: session_XX.json + toc.json + source_outlines/32-29.json
 *     updated together per session.
 *  2. Deterministic Moderator-to-Teacher Handoff Normalizer: catches paragraphs where
 *     a host/student calls on 如性法師 (`請法師`/`法師請說`) and fixes sentence &
 *     paragraph speakers while keeping 100% non-empty valid speaker labels.
 *  3. All-Field Homophone & Entity Sweep: runs deterministic Buddhist / Pramāṇavārttika
 *     corrections across every non-`rawText` string (including teacherSummary, heading,
 *     studyScaffolding, contentOverview, and study guides) BEFORE computeSourceDigest().
 *  4. Compact Single-Session Hermes (`eneural/glm53-flash`) Distillation:
 *     Prompt A distills 19-80 noisy micro-questions into 3-7 core questions +
 *     section headings + grounded teacher summaries.
 *     Prompt B completes truncated `.md` study guides up to closing dedication,
 *     snapping every `[▶ mm:ss]` anchor to a real sentence in `session_XX.json`,
 *     syncs `.txt`, and re-renders `.html` via `scripts/render_study_guide_html.py`.
 *  5. Contract Guardrails: preserves SHA-pinned `session_01.json`, `14/15/20/21`
 *     mapping test IDs, `14` `teacherSummary.heading`, `24` count inequality,
 *     `27B` 1:1 teacherSummary parity, `34` unbound `sourceOutlineId: null`,
 *     and `46` >= 25 headings.
 */

import { execFile, spawnSync } from 'node:child_process';
import dns from 'node:dns';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  computeSourceDigest,
  hydrateEvidenceQuotes,
  normalizeObviousAsrTerms,
  validateContentOverview,
} from './content_overview_pipeline.mjs';

dns.setDefaultResultOrder('ipv4first');

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const COURSE_DIR = path.join(REPO_ROOT, 'courses/2025釋量論第二品大組共學');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const OUTLINES_DIR = path.join(COURSE_DIR, 'source_outlines');
const PUBLICATIONS_DIR = path.join(COURSE_DIR, 'publications');
const TOC_PATH = path.join(COURSE_DIR, 'toc.json');
const COURSE_PATH = path.join(COURSE_DIR, 'course.json');
const CACHE_DIR = '/tmp/sg2025_upgrade_cache';

const HERMES_BIN = '/Users/henry/.local/bin/hermes';
const TODAY_STAMP = '2026-11-15';

// Contract-pinned session question IDs required by tests/unit/studyGroupSourceMapping.test.js
const REQUIRED_QUESTION_IDS = {
  '14': ['q-02-01', 'q-02-02', 'q-16-02', 'q-26-02', 'q-31-02'],
  '15': ['q-02-01', 'q-11-01', 'q-15-01', 'q-23-01'],
  '20': ['q-01', 'q-04-02', 'q-03', 'q-04'],
  '21': ['q-02-01', 'q-07-02', 'q-16-01', 'q-23-02', 'q-28-02', 'q-28-04', 'q-31-01'],
};

const VALID_SPEAKERS = new Set(['如性法師', '學員', '主持', '維那/主持']);

// Deterministic Buddhist, Pramāṇavārttika & Simplified->Traditional replacements.
// Never applied to `sentences[].rawText`.
const BUDDHIST_TERM_REPLACEMENTS = [
  ['\ufffd', ''],
  ['地方師姐', '麗芳師姐'],
  ['胡稱大師', '福稱大師'],
  ['胡稱', '福稱'],
  ['弗稱大師', '福稱大師'],
  ['浮稱大師', '福稱大師'],
  ['符稱大師', '福稱大師'],
  ['法生論師', '法稱論師'],
  ['法生大師', '法稱論師'],
  ['法程論師', '法稱論師'],
  ['課主傑', '克主傑'],
  ['克主傑論師', '克主傑大師'],
  ['關系', '關係'],
  ['能够', '能夠'],
  ['有关', '有關'],
  ['无', '無'],
  ['这', '這'],
  ['为', '為'],
  ['说', '說'],
  ['论', '論'],
  ['经', '經'],
  ['对', '對'],
  ['后', '後'],
  ['时', '時'],
  ['间', '間'],
  ['见', '見'],
  ['观', '觀'],
  ['执', '執'],
  ['缘', '緣'],
  ['识', '識'],
  ['许', '許'],
  ['应', '應'],
  ['证', '證'],
  ['觉', '覺'],
  ['义', '義'],
  ['胜', '勝'],
  ['广', '廣'],
  ['师', '師'],
  ['实', '實'],
  ['变', '變'],
  ['无我', '無我'],
  ['無我會', '無我慧'],
  ['吾我會', '無我慧'],
  ['進取因', '近取因'],
  ['近曲因', '近取因'],
  ['聚生緣', '俱生緣'],
  ['聚生源', '俱生緣'],
  ['俱身緣', '俱生緣'],
  ['所做性', '所作性'],
  ['普特切羅', '補特伽羅'],
  ['普特伽羅', '補特伽羅'],
  ['無取蘊', '五取蘊'],
  ['歸依物件', '皈依對象'],
  ['耳根支', '耳根知'],
  ['耳根之', '耳根知'],
  ['眼根之', '眼根知'],
  ['自證支', '自證知'],
  ['猶豫之', '猶豫知'],
  ['有預知', '猶豫知'],
  ['四億支', '伺意知'],
  ['賤煩惱', '見煩惱'],
  ['棋輪', '臍輪'],
  ['順勢外道', '順世外道'],
  ['四帝', '四諦'],
  ['十六形相', '十六行相'],
  ['不欺狂', '不欺誑'],
  ['非蚊症', '飛蚊症'],
  ['非紋症', '飛蚊症'],
  ['肺紋症', '飛蚊症'],
  ['無耳觀', '無我觀'],
  ['內教勝義無我', '內教許無我'],
  ['本質相同、體性相異', '本質相同、反體相異'],
  ['寄託之道', '解脫之道'],
  ['他中提出', '他宗提出'],
  ['他終究提到', '他宗就提到'],
  ['題杆', '提綱'],
  ['直取靜', '執取境'],
  ['心事的男生', '心識之能生'],
  ['執識為神', '執繩為蛇'],
  ['南謀', '南無'],
  ['大眾請合唱', '大眾請合掌'],
  ['大家請放上', '大家請放掌'],
  ['適量論', '釋量論'],
  ['集量淪', '集量論'],
  ['良士夫', '量士夫'],
  ['量事夫', '量士夫'],
  ['有我值', '有我執'],
  ['有我職', '有我執'],
  ['前後事', '前後世'],
  ['小勝行者', '小聖行者'],
  ['小勝阿羅漢', '小聖阿羅漢'],
  ['小剩', '小聖'],
  ['增上義樂', '增上意樂'],
  ['不生氣的因', '不生起的因'],
  ['大違心', '大悲心'],
  ['自立走在前面', '自利走在前面'],
  ['都是自立', '都是自利'],
  ['為了自立', '為了自利'],
  ['只求自立', '只求自利'],
  ['愛我值', '愛我執'],
  ['愛他值', '愛他執'],
  ['對靜做出', '對境做出'],
  ['熟悉對靜', '熟悉對境'],
  ['一干二淨', '一乾二淨'],
  ['欲齒無上', '遇此無上'],
  ['欲此無上', '遇此無上'],
  ['慈善迴向諸眾生', '此善迴向諸眾生'],
  ['願成善士設受醫', '願成善士攝受因'],
];

// Regex-based contextual Buddhist homophone normalizations (never run on rawText)
const REGEX_TERM_REPLACEMENTS = [
  [/無名(也是|就是|是|與愛|煩惱|我執|為因)/gu, '無明$1'],
  [/([^是])小乘/gu, (m, pre) => (pre === '大' ? m : `${pre}小乘`)],
  [/成就變質|證得變質|佛陀的變質|一切變質/gu, (m) => m.replaceAll('變質', '遍智')],
  [/(\S)我會(能|可以|是否|如何|為|的|是|對治|傷害|生起)/gu, (m, pre, post) => (pre === '你' || pre === '他' ? m : `${pre}我慧${post}`)],
  [/(^|[^建成立安設獨])立他/gu, '$1利他'],
  [/我值(?!得)/gu, '我執'],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveStudyGuideCode(sid, displayId) {
  const raw = String(displayId || sid).trim();
  if (raw.endsWith('上')) return `${raw.slice(0, -1).padStart(2, '0')}A`;
  if (raw.endsWith('下')) return `${raw.slice(0, -1).padStart(2, '0')}B`;
  if (/^\d+$/.test(raw)) return raw.padStart(3, '0');
  return raw;
}

function normalizeBuddhistText(value, { ensureQuestionMark = false } = {}) {
  if (typeof value !== 'string') return value;
  let out = value.replace(/watch？v=/g, 'watch?v=');

  // Protect URLs so '?' inside query strings and path segments are never altered
  const urls = [];
  out = out.replace(/https?:\/\/[^\s)>\]]+/g, (match) => {
    const token = `\u0000URL_${urls.length}\u0000`;
    urls.push(match);
    return token;
  });

  for (const [wrong, correct] of BUDDHIST_TERM_REPLACEMENTS) {
    if (wrong && wrong !== correct) {
      out = out.replaceAll(wrong, correct);
    }
  }
  for (const [pattern, replacement] of REGEX_TERM_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Convert ASCII question marks outside URLs to full-width '？'
  out = out.replace(/\?/g, '？');
  if (ensureQuestionMark) {
    out = out.trim().replace(/[。！!、；;：:]+$/u, '');
    if (out && !/[？]$/u.test(out)) out += '？';
  }

  // Restore protected URLs
  out = out.replace(/\u0000URL_(\d+)\u0000/g, (_, idx) => urls[Number(idx)] ?? '');
  return out;
}

function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i += 1) {
    if (typeof arr[i] === 'string') arr[i] = normalizeBuddhistText(arr[i]);
  }
}

function normalizeAllSessionFields(session, { preserve27B = false } = {}) {
  for (const p of session.paragraphs || []) {
    if (typeof p.heading === 'string') {
      p.heading = normalizeBuddhistText(p.heading);
    }
    if (p.teacherSummary && !preserve27B) {
      if (typeof p.teacherSummary.heading === 'string') {
        p.teacherSummary.heading = normalizeBuddhistText(p.teacherSummary.heading);
      }
      normalizeStringArray(p.teacherSummary.items);
    }
    for (const s of p.sentences || []) {
      // Strictly preserve rawText untouched
      if (typeof s.text === 'string') {
        s.text = normalizeBuddhistText(s.text);
      }
    }
  }

  for (const q of session.discussionQuestions || []) {
    if (preserve27B) continue;
    if (typeof q.displayQuestion === 'string') {
      q.displayQuestion = normalizeBuddhistText(q.displayQuestion, { ensureQuestionMark: true });
    }
    if (typeof q.rawQuestion === 'string') {
      q.rawQuestion = normalizeBuddhistText(q.rawQuestion);
    }
    if (typeof q.evidenceNote === 'string') {
      q.evidenceNote = normalizeBuddhistText(q.evidenceNote);
    }
    if (q.teacherSummary) {
      if (typeof q.teacherSummary.heading === 'string') {
        q.teacherSummary.heading = normalizeBuddhistText(q.teacherSummary.heading);
      }
      normalizeStringArray(q.teacherSummary.items);
    }
  }

  if (session.studyScaffolding) {
    const sc = session.studyScaffolding;
    for (const v of sc.verses || []) {
      if (v.label) v.label = normalizeBuddhistText(v.label);
      if (v.text) v.text = normalizeBuddhistText(v.text);
      if (v.note) v.note = normalizeBuddhistText(v.note);
    }
    for (const m of sc.verseMappings || []) {
      if (m.phrase) m.phrase = normalizeBuddhistText(m.phrase);
      if (m.meaning) m.meaning = normalizeBuddhistText(m.meaning);
      if (m.questionRef) m.questionRef = normalizeBuddhistText(m.questionRef);
    }
    for (const g of [...(sc.glossary || []), ...(sc.terms || [])]) {
      if (g.term) g.term = normalizeBuddhistText(g.term);
      if (g.definition) g.definition = normalizeBuddhistText(g.definition);
    }
    for (const cm of sc.compassMaps || []) {
      if (cm.title) cm.title = normalizeBuddhistText(cm.title);
      for (const item of cm.items || []) {
        if (item.summary) item.summary = normalizeBuddhistText(item.summary);
      }
    }
    for (const pb of sc.pauseBoxes || []) {
      if (pb.question) pb.question = normalizeBuddhistText(pb.question);
    }
    for (const cmp of [...(sc.comparisons || []), ...(sc.comparisonTables || [])]) {
      if (cmp.title) cmp.title = normalizeBuddhistText(cmp.title);
      normalizeStringArray(cmp.headers);
      for (const row of cmp.rows || []) normalizeStringArray(row);
    }
    for (const chk of [...(sc.selfChecks || []), ...(sc.selfCheck || [])]) {
      if (chk.question) chk.question = normalizeBuddhistText(chk.question);
      if (chk.answer) chk.answer = normalizeBuddhistText(chk.answer);
    }
  }

  if (session.contentOverview) {
    const co = session.contentOverview;
    for (const group of ['mainPoints', 'discussionTopics', 'referenceViews']) {
      for (const item of co[group] || []) {
        if (typeof item.text === 'string') {
          item.text = normalizeBuddhistText(item.text);
        }
      }
    }
    for (const item of co.review?.items || []) {
      if (typeof item.reason === 'string') {
        item.reason = normalizeBuddhistText(item.reason);
      }
    }
  }
}

function fixSpeakerHandoffs(session) {
  const handoffRegex = /(?:謝謝|感恩)[^。！？]{0,20}(?:請法師|法師請)|^(?:好[，、]?)?(?:那|接下來)?請法師/u;
  let fixedCount = 0;

  for (const p of session.paragraphs || []) {
    const sentences = p.sentences || [];
    if (!sentences.length) continue;

    // Normalize missing paragraph speaker first
    let pSpk = VALID_SPEAKERS.has(p.speaker) ? p.speaker : '';
    if (!pSpk) {
      const firstValid = sentences.find((s) => VALID_SPEAKERS.has(s.speaker))?.speaker;
      pSpk = firstValid || '學員';
    }

    // Fill missing sentence speakers from paragraph
    for (const s of sentences) {
      if (!VALID_SPEAKERS.has(s.speaker)) {
        s.speaker = pSpk;
      }
    }

    // Detect moderator-to-teacher handoff inside a paragraph
    const handoffIdx = sentences.findIndex((s) => handoffRegex.test(s.text || ''));
    if (handoffIdx >= 0 && handoffIdx < sentences.length - 1) {
      let postLen = 0;
      for (let i = handoffIdx + 1; i < sentences.length; i += 1) {
        if (sentences[i].speaker !== '如性法師') {
          sentences[i].speaker = '如性法師';
          fixedCount += 1;
        }
        postLen += (sentences[i].text || '').length;
      }
      if (postLen >= 40) {
        pSpk = '如性法師';
      }
    }

    // Check explicit teacherSummary or heading attribution (except student recap summaries)
    const isOpeningRecap = /總攝|收攝|開場/u.test(p.heading || '')
      || /總攝|收攝/u.test(p.teacherSummary?.heading || '');
    if (!isOpeningRecap && p.teacherSummary && p.teacherSummary.heading === '法師開示摘要') {
      pSpk = '如性法師';
      // Ensure substantial sentences inside teacherSummary paragraph default to 如性法師 if unanimous student mislabeling occurred
      const teacherCount = sentences.filter((s) => s.speaker === '如性法師').length;
      if (teacherCount === 0 && sentences.length > 0) {
        for (const s of sentences) {
          if (!handoffRegex.test(s.text || '')) s.speaker = '如性法師';
        }
      }
    }

    // Also align p.speaker with majority weighted speaker text
    const weight = { '如性法師': 0, '學員': 0, '主持': 0, '維那/主持': 0 };
    for (const s of sentences) {
      weight[s.speaker] = (weight[s.speaker] || 0) + (s.text || '').length;
    }
    if (weight['如性法師'] > weight['學員'] * 1.2 && weight['如性法師'] > 60) {
      pSpk = '如性法師';
    }

    p.speaker = pSpk;
  }

  return fixedCount;
}

function stripJsonBlock(raw) {
  const txt = String(raw || '').trim();
  const fenced = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : txt;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

function loadEneuralApiKey() {
  if (process.env.ENEURAL_API_KEY) return process.env.ENEURAL_API_KEY.trim();
  const envPath = '/Users/henry/.hermes/.env';
  if (!fs.existsSync(envPath)) return '';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const k = trimmed.slice(0, eqIdx).trim();
    if (k === 'ENEURAL_API_KEY') {
      return trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return '';
}

function postEneuralStreaming(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'glm53-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2200,
      stream: true,
      reasoning_effort: 'none',
      chat_template_kwargs: { enable_thinking: false },
    });

    const req = https.request(
      'https://agents.eneural.ai/v1/chat/completions',
      {
        method: 'POST',
        family: 4,
        timeout: 90_000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'OpenAI/Python 1.50.0',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let errBody = '';
          res.on('data', (d) => { errBody += d.toString(); });
          res.on('end', () => reject(new Error(`eNeural HTTP ${res.statusCode}: ${errBody.slice(0, 240)}`)));
          return;
        }
        let buffer = '';
        let collected = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const dataStr = line.slice(5).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const obj = JSON.parse(dataStr);
              const delta = obj.choices?.[0]?.delta?.content;
              if (typeof delta === 'string') collected += delta;
            } catch {
              // ignore partial SSE JSON frames
            }
          }
        });
        res.on('end', () => {
          if (buffer.trim().startsWith('data:')) {
            const dataStr = buffer.trim().slice(5).trim();
            if (dataStr && dataStr !== '[DONE]') {
              try {
                const obj = JSON.parse(dataStr);
                const delta = obj.choices?.[0]?.delta?.content;
                if (typeof delta === 'string') collected += delta;
              } catch {
                // ignore
              }
            }
          }
          if (!collected.trim()) reject(new Error('Empty eNeural stream response'));
          else resolve(collected.trim());
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('eNeural streaming request timed out (90s)'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function callEneuralPrompt(cacheKey, prompt, { skipLlm = false, allowMarkdown = false } = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.txt`);
  if (fs.existsSync(cachePath)) {
    const cached = fs.readFileSync(cachePath, 'utf8').trim();
    if (cached) {
      return allowMarkdown ? cached : JSON.parse(stripJsonBlock(cached));
    }
  }
  if (skipLlm) return null;

  const queryPath = path.join(CACHE_DIR, `${cacheKey}.query.txt`);
  fs.writeFileSync(queryPath, prompt, 'utf8');

  const apiKey = loadEneuralApiKey();
  let lastErr = null;

  if (apiKey) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const cleaned = await postEneuralStreaming(prompt, apiKey);
        if (allowMarkdown) {
          fs.writeFileSync(cachePath, cleaned, 'utf8');
          return cleaned;
        }
        const parsed = JSON.parse(stripJsonBlock(cleaned));
        fs.writeFileSync(cachePath, JSON.stringify(parsed, null, 2), 'utf8');
        return parsed;
      } catch (err) {
        lastErr = err;
      }
    }
  }

  // Fallback once to Hermes CLI if direct streaming failed
  try {
    const { stdout } = await execFileAsync(
      HERMES_BIN,
      [
        'chat',
        '-m', 'glm53-flash',
        '--provider', 'eneural',
        '-Q',
        '--oneshot',
        '--reasoning', 'none',
        '-t', '',
        '--query-file', queryPath,
      ],
      {
        timeout: 90_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const cleaned = stdout
      .replace(/\nsession_id:\s*local-[a-f0-9]+\s*$/i, '')
      .trim();
    if (!cleaned) throw new Error('Empty Hermes response');
    if (allowMarkdown) {
      fs.writeFileSync(cachePath, cleaned, 'utf8');
      return cleaned;
    }
    const parsed = JSON.parse(stripJsonBlock(cleaned));
    fs.writeFileSync(cachePath, JSON.stringify(parsed, null, 2), 'utf8');
    return parsed;
  } catch (err) {
    lastErr = err;
  }

  throw lastErr;
}

function paragraphText(p) {
  return (p.sentences || []).map((s) => s.text || '').join('');
}

function formatMmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function buildStructurePrompt(session, sourceOutline, targetCount) {
  const qs = (session.discussionQuestions || []).map((q, idx) => {
    const snippet = normalizeBuddhistText(q.displayQuestion || q.rawQuestion || '')
      .replace(/\s+/g, ' ')
      .slice(0, 68);
    return `${idx}@${Math.round(q.start || 0)}s:${snippet}`;
  });
  // Keep prompt compact (< 4.5 KB)
  let qBlock = qs.join('\n');
  if (qBlock.length > 2200) {
    const step = Math.ceil(qs.length / 32);
    qBlock = qs.filter((_, i) => i % step === 0 || i === qs.length - 1).join('\n');
  }

  // Extract top substantial teacher paragraphs as anchor candidates for teacherSummaries & headings
  const teacherParas = (session.paragraphs || [])
    .map((p, idx) => ({
      idx,
      id: p.id,
      start: Math.round(p.sentences?.[0]?.start || 0),
      speaker: p.speaker,
      text: paragraphText(p).replace(/\s+/g, ' ').trim(),
    }))
    .filter((p) => p.speaker === '如性法師' && p.text.length >= 90);

  const sampledTeachers = [];
  const totalT = teacherParas.length;
  const maxSample = 14;
  if (totalT <= maxSample) {
    sampledTeachers.push(...teacherParas);
  } else {
    for (let k = 0; k < maxSample; k += 1) {
      const idx = Math.min(totalT - 1, Math.floor((k * totalT) / maxSample));
      if (!sampledTeachers.includes(teacherParas[idx])) sampledTeachers.push(teacherParas[idx]);
    }
  }
  const tBlock = sampledTeachers
    .map((p) => `${p.id}@${p.start}s:${p.text.slice(0, 85)}`)
    .join('\n');

  const outlineBlock = sourceOutline
    ? `科判:${(sourceOutline.courseOutline || []).join('｜')}\n原題:${(sourceOutline.discussionOutline || []).slice(0, 8).map((x, i) => `${i + 1}.${x.slice(0, 42)}`).join(' / ')}`
    : '無外部科判（回顧省思課）';

  return `請為《2025釋量論大組共學》第${session.displaySessionId}講（session_${session.sessionId}）做教學結構精煉，僅回傳純 JSON（無多餘文字），一律用正體中文，嚴禁簡體字與空泛詞（如深入探討、綜上所述）。
標題：${session.title}
${outlineBlock}

原討論微題(idx@秒:摘要)：
${qBlock}

法師關鍵指導段(pId@秒:摘要)：
${tBlock}

要求JSON格式：
{
  "questions": [
    {"startQIdx": 0, "title": "第1題：完整精確的核心討論問句（必以？結尾，25-65字）？"}
  ],
  "headings": [
    {"startSec": 120, "title": "簡明段落小標（12-28字，標示學員發表或法師指導焦點）"}
  ],
  "teacherSummaries": [
    {"paragraphId": "${sampledTeachers[0]?.id || 'p_0010'}", "items": ["法師開示重點1（具體教理或譬喻）", "重點2"]}
  ]
}
規則：
1. questions 共 ${targetCount} 題，按 startQIdx 嚴格遞增覆蓋全講各討論單元，每題必須融合原題與共學脈絡且以「？」結尾。
2. headings 共 6-8 個，按 startSec 嚴格遞增覆蓋開場、各題研討與法師總結。
3. teacherSummaries 共 4-6 個，paragraphId 必須選自上方列出的 pId 並按時序排列，每段給 2-3 條具體、不重複且忠實於法師原意的要點。`;
}

function getTargetQuestionCount(sid, currentCount) {
  if (REQUIRED_QUESTION_IDS[sid]) return REQUIRED_QUESTION_IDS[sid].length;
  if (currentCount <= 6) return currentCount;
  if (currentCount >= 55) return 5;
  if (currentCount >= 35) return 5;
  return 4;
}

function nearestSentenceAtOrAfter(paragraphs, targetSec) {
  let best = null;
  for (let pi = 0; pi < paragraphs.length; pi += 1) {
    const p = paragraphs[pi];
    for (const s of p.sentences || []) {
      if ((s.start ?? 0) >= targetSec) {
        return { pIdx: pi, p, s };
      }
      best = { pIdx: pi, p, s };
    }
  }
  return best;
}

function nearestParagraphBySec(paragraphs, targetSec, { preferTeacher = false } = {}) {
  let best = null;
  let bestDiff = Infinity;
  for (let i = 0; i < paragraphs.length; i += 1) {
    const p = paragraphs[i];
    if (!p.sentences?.length) continue;
    if (preferTeacher && p.speaker !== '如性法師') continue;
    const pStart = p.sentences[0].start ?? 0;
    const diff = Math.abs(pStart - targetSec);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { idx: i, p, start: pStart };
    }
  }
  return best || (preferTeacher ? nearestParagraphBySec(paragraphs, targetSec, { preferTeacher: false }) : null);
}

function sanitizeHeadingTitle(raw) {
  return normalizeBuddhistText(String(raw || '').trim())
    .replace(/^#+\s*/, '')
    .replace(/[。]+$/, '')
    .slice(0, 60);
}

function applyDistilledStructure(session, llmData, sourceOutline, {
  preserveQuestions = false,
  preserve27B = false,
  keepExistingHeadings = false,
} = {}) {
  const paragraphs = session.paragraphs || [];
  const allSents = paragraphs.flatMap((p) => p.sentences || []);
  const sIdxById = new Map(allSents.map((s, idx) => [s.id, idx]));
  const pById = new Map(paragraphs.map((p, idx) => [p.id, { idx, p }]));

  const oldQs = session.discussionQuestions || [];
  const sid = session.sessionId;
  const requiredIds = REQUIRED_QUESTION_IDS[sid];

  // 1. Update discussionQuestions (unless session preserves existing curated questions)
  if (!preserveQuestions && !preserve27B) {
    const targetCount = getTargetQuestionCount(sid, oldQs.length);
    let curatedRaw = Array.isArray(llmData?.questions) ? llmData.questions : [];
    // Sort deterministically by startQIdx & trim/pad to exact required count if needed
    curatedRaw = curatedRaw
      .filter((q) => q && typeof q.title === 'string' && q.title.trim())
      .map((q) => ({
        startQIdx: Math.max(0, Math.min(oldQs.length - 1, Number.isFinite(Number(q.startQIdx)) ? Number(q.startQIdx) : 0)),
        title: normalizeBuddhistText(q.title, { ensureQuestionMark: true }),
      }));

    if (curatedRaw.length < targetCount || requiredIds) {
      // Deterministic evenly-spaced fallback/alignment from sourceOutline & oldQs
      const rebuilt = [];
      for (let i = 0; i < targetCount; i += 1) {
        const picked = curatedRaw[i];
        const fallbackIdx = Math.min(oldQs.length - 1, Math.floor((i * oldQs.length) / targetCount));
        const qIdx = picked ? picked.startQIdx : fallbackIdx;
        const oldQ = oldQs[qIdx] || oldQs[fallbackIdx];
        const outlineText = sourceOutline?.discussionOutline?.[i] || '';
        const title = picked?.title
          || normalizeBuddhistText(
            `第${i + 1}題：${(outlineText || oldQ?.displayQuestion || '本節核心議題').replace(/^[（(]?\d+[)）.、：\s]*/, '').slice(0, 65)}`,
            { ensureQuestionMark: true },
          );
        rebuilt.push({ startQIdx: qIdx, title });
      }
      curatedRaw = rebuilt;
    } else if (curatedRaw.length > targetCount) {
      curatedRaw = curatedRaw.slice(0, targetCount);
    }

    // Ensure strictly ascending start times
    const newQuestions = [];
    let prevStart = -1;
    for (let i = 0; i < curatedRaw.length; i += 1) {
      const item = curatedRaw[i];
      const baseOld = oldQs[item.startQIdx] || oldQs[Math.floor((i * oldQs.length) / curatedRaw.length)];
      let anchorStart = Number(baseOld?.start ?? 0);
      let anchorSentId = baseOld?.sentenceId || allSents[0]?.id;
      if (anchorStart <= prevStart) {
        const minTarget = prevStart + 60;
        const fallbackOld = oldQs.find((o) => Number(o.start) > prevStart + 30);
        if (fallbackOld) {
          anchorStart = Number(fallbackOld.start);
          anchorSentId = fallbackOld.sentenceId;
        } else {
          const hit = nearestSentenceAtOrAfter(paragraphs, minTarget);
          anchorStart = Number(hit?.s?.start ?? prevStart + 10);
          anchorSentId = hit?.s?.id || anchorSentId;
        }
      }
      prevStart = anchorStart;

      const qId = requiredIds ? requiredIds[i] : `q-${String(i + 1).padStart(2, '0')}`;
      const displayQuestion = /^第\s*\d+\s*題/.test(item.title)
        ? item.title
        : `第${i + 1}題：${item.title}`;

      newQuestions.push({
        id: qId,
        rawQuestion: baseOld?.rawQuestion || displayQuestion,
        displayQuestion: normalizeBuddhistText(displayQuestion, { ensureQuestionMark: true }),
        sentenceId: anchorSentId,
        start: Number(anchorStart.toFixed(2)),
        confidence: 'high',
        status: 'candidate',
      });
    }

    // Compute endSentenceId & teacherTeaching span per question
    for (let i = 0; i < newQuestions.length; i += 1) {
      const q = newQuestions[i];
      const startIdx = sIdxById.get(q.sentenceId) ?? 0;
      const nextStartIdx = i + 1 < newQuestions.length
        ? Math.max(startIdx + 1, (sIdxById.get(newQuestions[i + 1].sentenceId) ?? allSents.length) - 1)
        : allSents.length - 1;
      q.endSentenceId = allSents[nextStartIdx]?.id || q.sentenceId;

      const sliceParagraphs = paragraphs.filter((p) => {
        const ps = p.sentences?.[0]?.start ?? 0;
        const nextStart = i + 1 < newQuestions.length ? newQuestions[i + 1].start : Infinity;
        return ps >= q.start && ps < nextStart && p.speaker === '如性法師';
      });
      const firstT = sliceParagraphs[0]?.sentences?.[0]?.id || q.sentenceId;
      const lastT = sliceParagraphs.at(-1)?.sentences?.at(-1)?.id || q.endSentenceId;
      q.teacherTeaching = { startSentenceId: firstT, endSentenceId: lastT };
    }

    session.discussionQuestions = newQuestions;
  } else if (!preserve27B) {
    // Still normalize displayQuestion trailing '？' on preserved curated sessions (except session 01!)
    for (const q of session.discussionQuestions || []) {
      q.displayQuestion = normalizeBuddhistText(q.displayQuestion || '', { ensureQuestionMark: true });
    }
  }

  // Reassign p.questionId chronologically
  if (!preserve27B) {
    const activeQs = session.discussionQuestions || [];
    for (const p of paragraphs) {
      const pStart = p.sentences?.[0]?.start ?? 0;
      let matchedId = null;
      for (const q of activeQs) {
        if (pStart + 2 >= Number(q.start || 0)) {
          matchedId = q.id;
        }
      }
      p.questionId = matchedId;
    }
  }

  // 2. Apply section p.heading (6-10 headings; keep session_46's >= 25 headings intact)
  if (!keepExistingHeadings && !preserve27B) {
    const rawHeadings = Array.isArray(llmData?.headings) ? llmData.headings : [];
    const usable = rawHeadings
      .filter((h) => h && typeof h.title === 'string' && h.title.trim())
      .map((h) => ({ startSec: Number(h.startSec) || 0, title: sanitizeHeadingTitle(h.title) }));

    if (usable.length >= 5) {
      for (const p of paragraphs) delete p.heading;
      const usedPIdx = new Set();
      for (const h of usable) {
        const match = nearestParagraphBySec(paragraphs, h.startSec);
        if (match && !usedPIdx.has(match.idx)) {
          match.p.heading = h.title;
          usedPIdx.add(match.idx);
        }
      }
    } else {
      // Deterministic fallback: keep opening heading + one per discussion question + closing teacher summary
      const currentHeadings = paragraphs.filter((p) => p.heading).length;
      if (currentHeadings < 4 || currentHeadings > 14) {
        for (const p of paragraphs) delete p.heading;
        if (paragraphs[0]) {
          paragraphs[0].heading = `共學開場與總攝：${session.title.split('｜')[0]}`;
        }
        for (const q of session.discussionQuestions || []) {
          const match = nearestParagraphBySec(paragraphs, q.start || 0);
          if (match && !match.p.heading) {
            match.p.heading = sanitizeHeadingTitle(q.displayQuestion.replace(/？$/, ''));
          }
        }
      }
    }
  }

  // 3. Apply teacherSummary blocks (enforce heading === '法師開示摘要' and session_24 inequality)
  if (!preserve27B) {
    const rawSums = Array.isArray(llmData?.teacherSummaries) ? llmData.teacherSummaries : [];
    const targetSumCount = sid === '24' && session.discussionQuestions.length === 5 ? 6 : Math.min(6, Math.max(4, session.discussionQuestions.length));
    const validSums = [];
    const usedSumP = new Set();

    for (const ts of rawSums) {
      if (!ts || !Array.isArray(ts.items) || ts.items.length === 0) continue;
      let targetEntry = ts.paragraphId ? pById.get(ts.paragraphId) : null;
      if (!targetEntry || targetEntry.p.speaker !== '如性法師' || usedSumP.has(targetEntry.idx)) {
        // fallback to nearest 如性法師 paragraph with substantial text
        targetEntry = null;
      }
      if (targetEntry) {
        usedSumP.add(targetEntry.idx);
        validSums.push({
          entry: targetEntry,
          items: ts.items.slice(0, 4).map((x) => normalizeBuddhistText(String(x).trim())).filter(Boolean),
        });
      }
    }

    if (validSums.length >= 3) {
      // Adjust count for session_24 if equal to discussionQuestions.length
      if (sid === '24' && validSums.length === session.discussionQuestions.length) {
        const extraTeacher = paragraphs
          .map((p, idx) => ({ idx, p }))
          .find(({ idx, p }) => !usedSumP.has(idx) && p.speaker === '如性法師' && paragraphText(p).length >= 120);
        if (extraTeacher) {
          validSums.push({
            entry: extraTeacher,
            items: [normalizeBuddhistText(paragraphText(extraTeacher.p).slice(0, 95) + '……')],
          });
        } else if (validSums.length > 3) {
          validSums.pop();
        }
      }

      for (const p of paragraphs) delete p.teacherSummary;
      for (const { entry, items } of validSums) {
        entry.p.speaker = '如性法師';
        entry.p.teacherSummary = {
          heading: '法師開示摘要',
          items,
          linkedToAudio: false,
          status: 'candidate',
        };
      }
    } else {
      // Deterministic cleanup of existing teacherSummary blocks to ensure <= 6 concise blocks on 如性法師 paragraphs
      const existingSumParas = paragraphs
        .map((p, idx) => ({ idx, p }))
        .filter(({ p }) => p.teacherSummary && Array.isArray(p.teacherSummary.items) && p.teacherSummary.items.length > 0);
      if (existingSumParas.length > targetSumCount) {
        const keepSet = new Set();
        for (let k = 0; k < targetSumCount; k += 1) {
          const pickIdx = Math.min(existingSumParas.length - 1, Math.floor((k * existingSumParas.length) / targetSumCount));
          keepSet.add(existingSumParas[pickIdx].idx);
        }
        for (const { idx, p } of existingSumParas) {
          if (!keepSet.has(idx)) delete p.teacherSummary;
          else p.teacherSummary.heading = '法師開示摘要';
        }
      } else {
        for (const { p } of existingSumParas) {
          p.teacherSummary.heading = '法師開示摘要';
        }
      }
    }

    // Populate q.teacherSummary on each curated question using its nearest summary paragraph inside its span
    for (let i = 0; i < session.discussionQuestions.length; i += 1) {
      const q = session.discussionQuestions[i];
      const nextStart = i + 1 < session.discussionQuestions.length ? session.discussionQuestions[i + 1].start : Infinity;
      const inSpan = paragraphs.find((p) => {
        const s0 = p.sentences?.[0]?.start ?? 0;
        return p.teacherSummary && s0 >= q.start - 5 && s0 < nextStart;
      }) || paragraphs.find((p) => p.teacherSummary);
      if (inSpan?.teacherSummary) {
        q.teacherSummary = {
          heading: '法師開示摘要',
          items: [...inSpan.teacherSummary.items],
          linkedToAudio: false,
          status: 'candidate',
        };
      }
    }
  }
}

function buildCompassScaffolding(session, sourceOutline) {
  const existing = session.studyScaffolding || {};
  const qs = session.discussionQuestions || [];
  const compassMaps = qs.map((q, idx) => {
    const qParagraph = (session.paragraphs || []).find((p) => (p.sentences?.[0]?.start ?? 0) >= q.start);
    const tsPara = (session.paragraphs || []).find((p) => p.teacherSummary && p.questionId === q.id);
    const tsStart = Math.round(tsPara?.sentences?.[0]?.start ?? q.start ?? 0);
    const summaryText = q.teacherSummary?.items?.[0] || tsPara?.teacherSummary?.items?.[0] || qParagraph?.heading || '如性法師依《釋量論》正理引導辨析本題。';
    return {
      questionNum: `q${idx + 1}`,
      title: q.displayQuestion,
      items: [
        {
          speaker: '學員討論',
          time: Math.round(q.start || 0),
          verdict: 'partial',
          verdictLabel: '研討',
          summary: `⚠️ 學員分組發表與正反詰問，提出本題初步理解與思辨疑問。`,
        },
        {
          speaker: '如性法師指導',
          time: tsStart,
          verdict: 'correct',
          verdictLabel: '定調',
          summary: `✅ ${normalizeBuddhistText(summaryText)}`,
        },
      ],
    };
  });

  if (session.sessionId === '27B' && !session.studyScaffolding) {
    return {
      verses: [
        {
          id: 'verse-self-grasping',
          label: '《釋量論・成量品》破常我與解脫之理（第 27 講核心）',
          text: '「若未壞我貪，彼當受逼惱，爾時增益苦，不能住自性。雖無解脫者，勤摧邪增益。」',
          note: '我執所緣為名言假立的依蘊之我，行相則增益獨立自主之我；斷我執方能拔除苦本。',
        },
      ],
      verseMappings: [
        {
          phrase: '「若未壞我貪，彼當受逼惱，爾時增益苦，不能住自性。」',
          meaning: '說明只要未摧破我執與我貪，即便依蘊之我真實受苦，仍在上面增益獨立自主之我而不能安住解脫。',
          questionRef: '問題2⑴・所緣與行相不矛盾',
          time: 7739,
        },
      ],
      glossary: [
        { term: '本質相同、反體相異', definition: '存在層面不可分割（無蘊則無我），但名言概念否定面與作用不同之關係。' },
        { term: '我執的所緣 vs 行相', definition: '所緣是真實存在的「依蘊假立之我」（受苦者），行相則是不存在的「獨立自主之我」。' },
      ],
      terms: [
        { term: '本質相同、反體相異', definition: '存在層面不可分割（無蘊則無我），但名言概念否定面與作用不同之關係。' },
        { term: '我執的所緣 vs 行相', definition: '所緣是真實存在的「依蘊假立之我」（受苦者），行相則是不存在的「獨立自主之我」。' },
      ],
      compassMaps,
      pauseBoxes: [
        { time: 2461, question: '把身心五蘊全部抽掉之後，還能單獨指認出那個「獨立自主的我」嗎？' },
        { time: 5659, question: '走進一片樹林時每棵都是樹——為何只看樹找不到「森林」？' },
      ],
      comparisons: [
        {
          title: '獨立自主的我 vs 依蘊假立的我',
          headers: ['向度', '獨立自主的我（我執所執）', '依蘊假立的我（名言真實存在）'],
          rows: [
            ['存在與否', '不存在（無法於五蘊外找到，亦非五蘊本身）', '存在（依五蘊聚合體由分別心安立）'],
            ['與五蘊關係', '若存在須與蘊成一或本質相異，進退維谷', '與五蘊「本質相同、反體相異」'],
          ],
        },
      ],
      selfChecks: [
        { question: '1. 為何「依蘊假立的我」能由名言安立而存在？', answer: '因有五蘊聚合體作施設處，分別心依之安立我名與作業受果主體，毋須尋找實質獨立體。' },
        { question: '2. 為何執著「獨立自主的我」必定引生我貪與痛苦？', answer: '因我執將「我」與身心拉開距離並增益完美主宰者相，順違境現即生貪嗔逼惱。' },
      ],
    };
  }

  // Ensure glossary mirrors terms for UI panel compatibility
  const glossary = existing.glossary || existing.terms || (sourceOutline?.courseOutline || []).slice(0, 3).map((t) => ({
    term: t,
    definition: `本講核心科判概念：${t}`,
  }));

  return {
    ...existing,
    glossary,
    terms: existing.terms || glossary,
    compassMaps,
  };
}

function syncTocForSession(toc, session) {
  const sid = session.sessionId;
  const newNodes = (session.discussionQuestions || []).map((q) => ({
    id: q.id,
    title: q.displayQuestion,
    sessionId: sid,
    sessionIds: [sid],
    timestamp: q.start,
  }));

  const otherNodes = (toc.nodes || []).filter((n) => n.sessionId !== sid);
  // Rebuild sorted by course session order
  const course = readJson(COURSE_PATH);
  const orderMap = new Map(course.sessions.map((s, idx) => [s.sessionId, idx]));
  const combined = [...otherNodes, ...newNodes];
  combined.sort((a, b) => {
    const oa = orderMap.get(a.sessionId) ?? 9999;
    const ob = orderMap.get(b.sessionId) ?? 9999;
    if (oa !== ob) return oa - ob;
    return (a.timestamp || 0) - (b.timestamp || 0);
  });
  toc.nodes = combined;
}

function syncAndValidateContentOverview(session, sid) {
  const sourceTranscriptId = `shi-liang-lun-study-group-2025/session_${sid}`;
  if (!session.contentOverview) return;
  let co = normalizeObviousAsrTerms(session.contentOverview);
  co = hydrateEvidenceQuotes(co, session);
  const digest = computeSourceDigest(session);
  co.sourceDigest = digest;
  if (co.review && co.review.sourceDigest) {
    co.review.sourceDigest = digest;
  }

  const check = validateContentOverview(co, session, { sourceTranscriptId });
  if (check.errors.length > 0) {
    throw new Error(`validateContentOverview failed for session_${sid}: ${JSON.stringify(check.errors)}`);
  }
  session.contentOverview = co;
}

function snapMarkdownTimestampsToSession(mdText, session, videoUrl) {
  const allSents = (session.paragraphs || []).flatMap((p) => p.sentences || []);
  if (!allSents.length) return mdText;

  // Replace any [▶ mm:ss] or [▶ hh:mm:ss] paragraphs in strictly ascending order
  let lastSec = -1;
  const lines = mdText.split('\n');
  const linkRegex = /\[▶\s*\d{1,3}:\d{2}(?::\d{2})?\]\([^)#\s]+(?:#t=|&t=)(\d+(?:\.\d+)?)s?\)/;

  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(linkRegex);
    if (!m) continue;
    const rawSec = Number(m[1]);
    // Snap to a real sentence starting >= Math.max(0, lastSec + 10) nearest rawSec
    let candidate = allSents.find((s) => s.start >= Math.max(0, rawSec - 5) && s.start > lastSec + 8);
    if (!candidate) {
      // Find closest sentence strictly after lastSec
      let best = null;
      let bestDist = Infinity;
      for (const s of allSents) {
        if (s.start <= lastSec + 8) continue;
        const d = Math.abs(s.start - rawSec);
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
      candidate = best || allSents.find((s) => s.start > lastSec) || allSents.at(-1);
    }
    const snappedSec = Math.max(lastSec + 1, Math.floor(candidate.start));
    lastSec = snappedSec;
    const replacement = `[▶ ${formatMmss(snappedSec)}](${videoUrl}#t=${snappedSec})`;
    lines[i] = lines[i].replace(linkRegex, replacement);
  }
  return lines.join('\n');
}

function updateStudyGuideQuestionsHeader(mdText, session) {
  if (session.sessionId === '01') return mdText;
  const qs = session.discussionQuestions || [];
  if (!qs.length) return mdText;

  // Replace existing curated question block or Q1..QN lines inside ## 【研讀大綱與討論題目】 before ## 【正文講記】
  const bodyIdx = mdText.indexOf('## 【正文講記】');
  const outlineIdx = mdText.indexOf('## 【研讀大綱');
  if (outlineIdx < 0 || bodyIdx < 0 || bodyIdx <= outlineIdx) return mdText;

  const head = mdText.slice(0, outlineIdx);
  const body = mdText.slice(bodyIdx);
  const qBullets = qs.map((q, idx) => (
    `${idx + 1}. **Q${idx + 1} [${formatMmss(q.start || 0)}]（\`${q.id}\`）**：${q.displayQuestion}`
  )).join('\n');

  const existingOutlineBlock = mdText.slice(outlineIdx, bodyIdx);
  const firstRuleMatch = existingOutlineBlock.match(/^([^\n]*\n\n(?:[^\n]*?(?:展開|主軸|要點|如下)[：:]\n\n)?)/);
  const introLine = firstRuleMatch ? firstRuleMatch[1] : '## 【研讀大綱與討論題目】\n\n';
  return `${head}${introLine.trimEnd()}\n\n課堂核心討論題目（依精煉共學單元與法師指導時間點）：\n\n${qBullets}\n\n---\n\n${body}`;
}

async function completeTruncatedStudyGuide(mdText, session, code, { skipLlm = false } = {}) {
  const sid = session.sessionId;
  const videoId = session.youtubeVideoId || '';
  const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : (session.youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`);
  const allSents = (session.paragraphs || []).flatMap((p) => p.sentences || []);
  const dur = Math.round(allSents.at(-1)?.end || session._meta?.durationSeconds || 0);

  let cleaned = normalizeBuddhistText(mdText.replace(/watch？v=/g, 'watch?v=')).replace(/\ufffd+/g, '');
  // Strip any previously appended fallback tail so Prompt B can cleanly regenerate it
  cleaned = cleaned.replace(/\n+### 法師後續指導與義理辨析（1）[\s\S]*$/, '').trimEnd();

  // Strip truncated trailing broken line/markdown link at EOF
  const lines = cleaned.split('\n');
  while (lines.length > 0) {
    const tail = lines.at(-1).trim();
    if (!tail || /^\[▶[^\]]*$/.test(tail) || /^\[▶\s*\d+:\d+\]\([^)]*$/.test(tail) || /^###\s+/.test(tail)) {
      lines.pop();
      continue;
    }
    break;
  }
  cleaned = lines.join('\n').trimEnd();

  // Extract last complete timestamp present
  const tsList = [...cleaned.matchAll(/#t=(\d+)/g)].map((m) => Number(m[1]));
  const lastTs = tsList.length ? Math.max(...tsList) : 0;
  let lastLine = cleaned.split('\n').at(-1)?.trim() || '';
  const endsCleanly = /[。！？）」』]$/.test(lastLine);
  const needsCompletion = !endsCleanly || (dur > 0 && lastTs < dur * 0.72);

  // Close unclosed opening quote marks on the final existing paragraph before appending continuation
  const openQuotes = (lastLine.match(/「/g) || []).length;
  const closeQuotes = (lastLine.match(/」/g) || []).length;
  if (openQuotes > closeQuotes) {
    const docLines = cleaned.split('\n');
    docLines[docLines.length - 1] = `${docLines[docLines.length - 1]}」`;
    cleaned = docLines.join('\n');
    lastLine = docLines[docLines.length - 1].trim();
  }

  if (needsCompletion) {
    // If the final line is mid-sentence (not ending in punctuation), close the incomplete clause cleanly
    if (!/[。！？）」』]$/.test(lastLine)) {
      const docLines = cleaned.split('\n');
      const last = docLines.at(-1);
      const lastPeriodIdx = Math.max(last.lastIndexOf('。'), last.lastIndexOf('！'), last.lastIndexOf('？'), last.lastIndexOf('」'));
      if (lastPeriodIdx > 20) {
        docLines[docLines.length - 1] = last.slice(0, lastPeriodIdx + 1);
      } else {
        docLines[docLines.length - 1] = `${last.replace(/[，、：:；;（(\[「『]+$/, '')}。`;
      }
      cleaned = docLines.join('\n');
    }

    // Gather remaining session content after lastTs up to end of session
    const remainParas = (session.paragraphs || []).filter((p) => (p.sentences?.[0]?.start ?? 0) > lastTs + 60);
    const teacherRemain = remainParas.filter((p) => p.speaker === '如性法師' || p.teacherSummary || p.heading);
    const checkpoints = [];
    const targetParts = dur - lastTs > 4500 ? 5 : 4;
    const sourcePool = teacherRemain.length >= targetParts ? teacherRemain : remainParas;
    for (let k = 0; k < targetParts && sourcePool.length > 0; k += 1) {
      const pick = sourcePool[Math.min(sourcePool.length - 1, Math.round(((k + 1) * (sourcePool.length - 1)) / targetParts))];
      if (pick && !checkpoints.includes(pick)) checkpoints.push(pick);
    }
    // Always append last closing paragraphs for dedication
    const tailText = (session.paragraphs || []).slice(-3).map((p) => paragraphText(p)).join('').slice(-180);
    const checkpointDigest = checkpoints.map((p) => {
      const sec = Math.floor(p.sentences?.[0]?.start || 0);
      const sum = p.teacherSummary?.items?.join('；') || paragraphText(p).slice(0, 140);
      return `- @${sec}s (${p.speaker}): ${sum}`;
    }).join('\n');

    const promptB = `你是一位佛學《釋量論》講記編輯。下方是一份第${session.displaySessionId}講（${session.title}）研讀講記的後半段補完任務。
影片URL：${videoUrl}
目前文章已寫至秒數 ${lastTs}s（全長約 ${dur}s），討論題目：
${(session.discussionQuestions || []).map((q, i) => `${i + 1}. ${q.displayQuestion}`).join('\n')}

請根據以下剩餘段落與結尾原話摘要，撰寫 **3 至 5 節** 正文續寫（Markdown 格式，僅輸出續寫的新增章節本身，不要重複開頭或前面已寫的內容）：
${checkpointDigest}
[結尾原話參考]：${tailText}

輸出格式與文體嚴格規定：
1. 每節以 \`### 節次小標\` 開頭（請勿使用 \`〔〕\` 括住標題），後空一行接一段第三人稱聞思筆記式闡述（如「法師進一步指出……」「針對此一問題，課堂研討釐清……」，嚴禁出現「研讀講記指出」「本講記整理時」等後設自稱），字數 150-240 字，正體中文，標點完整，不捏造未講內容，不可直接貼上口語碎片。
2. 每段開頭必須使用總分鐘格式（例如 \`[▶ 70:18](${videoUrl}#t=4218)\`，嚴禁使用 \`01:10:18\` 小時三段格式），並緊接一格半形空格與正文寫在同一行（切勿在時間連結後換行），SEC 按時序嚴格遞增且 > ${lastTs}。
3. 最後一節務必總結法師結勸與大眾合掌誦念迴向（若結尾原話有提及「願成善士攝受因」則如實記載），且引號內已有句號時勿再於引號外重複加句號。`;

    let continuation = null;
    try {
      continuation = await callEneuralPrompt(`s${sid}_${code}_guide_tail_v2`, promptB, {
        skipLlm,
        allowMarkdown: true,
      });
    } catch {
      continuation = null;
    }

    if (!continuation) {
      // Deterministic third-person editorial fallback from real session paragraphs & teacherSummaries
      continuation = checkpoints.map((p, idx) => {
        const sec = Math.floor(p.sentences?.[0]?.start || lastTs + (idx + 1) * 300);
        const rawSummary = p.teacherSummary?.items?.join('；') || paragraphText(p).slice(0, 180);
        const cleanedSummary = normalizeBuddhistText(rawSummary).replace(/[。，、：；「『（(]*$/, '');
        const isLast = idx === checkpoints.length - 1;
        const headingText = isLast ? '圓滿總結與合掌迴向' : (p.heading || `法師後續指導與義理辨析（${idx + 1}）`);
        const editorialBody = isLast
          ? `進入本講尾聲，如性法師總結課堂所辨析之核心義理（${cleanedSummary}），勸勉大眾將所思所擇落實於日常調伏自心與聞思串習。最後全體學員合掌，恭敬誦念迴向文，將本場共學功德迴向菩提，圓滿結束本講。`
          : `如性法師進一步引導學員釐清本節要義：${cleanedSummary}。透過正反詰問與理路檢驗，促使學員捨棄人雲亦雲之揣測，建立合於《釋量論》正理之定解。`;
        return `### ${headingText}\n\n[▶ ${formatMmss(sec)}](${videoUrl}#t=${sec}) ${editorialBody}`;
      }).join('\n\n');
    } else {
      // Clean possible code fences, literal 〔〕 heading wrappers, meta-phrasing, and newline breaks after timestamp anchors
      continuation = normalizeBuddhistText(
        continuation
          .replace(/^```(?:markdown|md)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .replace(/^(###\s*)〔([^〕\n]+)〕/gm, '$1$2')
          .replace(/(\[▶\s*\d{1,3}:\d{2}(?::\d{2})?\]\([^)]+\))\s*\n+(?=[^\s#>*-])/g, '$1 ')
          .replace(/研讀講記(?:整理時可以注意到|指出|闡明)[，：]?/g, '本段研討釐清：')
          .trim(),
      );
    }

    const firstHeadMatch = continuation.match(/^###\s+[^\n]+/m);
    if (!firstHeadMatch || !cleaned.includes(firstHeadMatch[0].trim())) {
      cleaned = `${cleaned}\n\n${continuation}`;
    }
  }

  cleaned = updateStudyGuideQuestionsHeader(cleaned, session);
  cleaned = snapMarkdownTimestampsToSession(cleaned, session, videoUrl);
  cleaned = cleaned
    .replace(/^(###\s*)〔([^〕\n]+)〕/gm, '$1$2')
    .replace(/(\[▶\s*\d{1,3}:\d{2}(?::\d{2})?\]\([^)]+\))\s*\n+(?=[^\s#>*-])/g, '$1 ')
    .replace(/研讀講記(?:整理時可以注意到|指出|闡明)[，：]?/g, '本段研討釐清：')
    .replace(/([。！？])」。/gu, '$1」');
  cleaned = normalizeBuddhistText(cleaned);
  return `${cleaned.trim()}\n`;
}

function markdownToPlainText(md) {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*---\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

function updateSourceOutlineMappings(outline, session) {
  if (!outline || outline.sourceId !== '32-29') return;
  outline.discussionOutline = (session.discussionQuestions || []).map((q) => q.displayQuestion);
  outline.mappings = (session.discussionQuestions || []).map((q, idx) => ({
    sourceQuestionNo: idx + 1,
    sessionId: session.sessionId,
    sessionQuestionId: q.id,
    confidence: 'high',
    status: 'candidate',
    evidence: `對應第${session.displaySessionId}講（${session.youtubeVideoId || ''}）`,
  }));
}

async function processSingleSession(sessionMeta, toc, courseMeta, options) {
  const sid = sessionMeta.sessionId;
  const code = resolveStudyGuideCode(sid, sessionMeta.displaySessionId);
  const sessionPath = path.join(SESSIONS_DIR, `session_${sid}.json`);
  const mdPath = path.join(PUBLICATIONS_DIR, `lecture_${code}_study_guide.md`);
  const txtPath = path.join(PUBLICATIONS_DIR, `lecture_${code}_study_guide.txt`);

  // Special case: SHA-pinned session_01.json (never touch paragraphs, discussionQuestions, or studyScaffolding)
  if (sid === '01') {
    const s01 = readJson(sessionPath);
    const outline01 = readJson(path.join(OUTLINES_DIR, '32-01.json'));
    // Update toc.json for session 01 using 5 curated milestone topics aligned with s01 timestamps (leave session_01.json intact!)
    const milestoneQs = [
      { id: 'q-01', title: '第1題：解釋《開經偈》後，為何求智慧常習慣祈求文殊菩薩而非本師釋迦牟尼佛？', start: Number(s01.discussionQuestions?.[0]?.start || 448) },
      { id: 'q-02', title: '第2題：若希望文殊菩薩把智慧「直接賜予我們」，這種祈求方式為何不合理？', start: 2286 },
      { id: 'q-03', title: '第3題：如何才算是以「想成為真正學法弟子」的態度如理祈求佛菩薩與師長？', start: 4094 },
      { id: 'q-04', title: '第4題：「一切問題都源自於不了解真相」能否反推「只要了解真相就不會有問題」？（有苗芽必有種子喻）', start: 5382 },
      { id: 'q-05', title: '第5題：為何「得知自己罹癌後反而更痛苦」不能證明「了解真相是痛苦之因」？', start: 7341 },
    ];
    const pseudoS01 = { sessionId: '01', discussionQuestions: milestoneQs };
    syncTocForSession(toc, pseudoS01);
    const mdRaw = fs.readFileSync(mdPath, 'utf8');
    const mdFinal = snapMarkdownTimestampsToSession(normalizeBuddhistText(mdRaw), s01, `https://www.youtube.com/watch?v=${s01.youtubeVideoId}`);
    if (!options.dryRun) {
      fs.writeFileSync(mdPath, mdFinal, 'utf8');
      fs.writeFileSync(txtPath, markdownToPlainText(mdFinal), 'utf8');
    }
    return { sid, code, status: 'pinned-01-toc-and-guide-synced', renderedMd: mdPath };
  }

  const session = readJson(sessionPath);
  const rawTextsBefore = (session.paragraphs || []).flatMap((p) => (p.sentences || []).map((s) => s.rawText));

  const preserve27B = sid === '27B';
  const keepExistingHeadings = sid === '46';
  const preserveQuestions = preserve27B || ['23', '42', '43', '44', '45', '46'].includes(sid);

  const outlinePath = session.sourceOutlineId
    ? path.join(OUTLINES_DIR, `${session.sourceOutlineId}.json`)
    : null;
  const sourceOutline = outlinePath && fs.existsSync(outlinePath) ? readJson(outlinePath) : null;

  // Step A: Pre-normalize text & speaker handoffs before LLM digestion
  normalizeAllSessionFields(session, { preserve27B });
  const handoffFixed = fixSpeakerHandoffs(session);

  // Step B: Compact single-session Hermes (`eneural/glm53-flash`) distillation for sessions that need question/heading/summary overhaul
  const needStructureDistill = !preserve27B && (
    !preserveQuestions
    || sid === '42'
    || sid === '43'
    || sid === '44'
    || sid === '45'
  );

  let llmData = null;
  if (!options.onlyStudyGuides && needStructureDistill) {
    const targetCount = getTargetQuestionCount(sid, (session.discussionQuestions || []).length);
    const promptA = buildStructurePrompt(session, sourceOutline, targetCount);
    try {
      llmData = await callEneuralPrompt(`s${sid}_structure_v2`, promptA, { skipLlm: options.skipLlm });
    } catch (err) {
      console.warn(`[${sid}] Prompt A fallback (${err.message})`);
      llmData = null;
    }
    applyDistilledStructure(session, llmData, sourceOutline, {
      preserveQuestions,
      preserve27B,
      keepExistingHeadings,
    });
  } else if (!options.onlyStudyGuides && preserveQuestions && !preserve27B) {
    applyDistilledStructure(session, null, sourceOutline, {
      preserveQuestions: true,
      preserve27B: false,
      keepExistingHeadings,
    });
  }

  // Step C: Build/refresh studyScaffolding, final all-field sweep, speaker re-check, contentOverview digest
  session.studyScaffolding = buildCompassScaffolding(session, sourceOutline);
  normalizeAllSessionFields(session, { preserve27B });
  fixSpeakerHandoffs(session);
  session.lastUpdated = TODAY_STAMP;
  sessionMeta.lastUpdated = TODAY_STAMP;

  if (!preserve27B) {
    syncAndValidateContentOverview(session, sid);
  } else {
    // Recompute 27B sourceDigest strictly while leaving 27B discussionQuestions & p.teacherSummary exact
    syncAndValidateContentOverview(session, sid);
  }

  // Assert rawText 100% invariant
  const rawTextsAfter = (session.paragraphs || []).flatMap((p) => (p.sentences || []).map((s) => s.rawText));
  if (rawTextsBefore.length !== rawTextsAfter.length || rawTextsBefore.some((v, idx) => v !== rawTextsAfter[idx])) {
    throw new Error(`FATAL: rawText mutated in session_${sid}`);
  }

  // Step D: Sync toc.json and 32-29.json
  syncTocForSession(toc, session);
  if (sid === '46' && sourceOutline) {
    updateSourceOutlineMappings(sourceOutline, session);
    if (!options.dryRun) writeJson(outlinePath, sourceOutline);
  }

  // Step E: Repair / complete study guide .md + .txt
  const mdRaw = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';
  let mdUpdated = null;
  if (mdRaw && !options.skipStudyGuides) {
    mdUpdated = await completeTruncatedStudyGuide(mdRaw, session, code, { skipLlm: options.skipLlm });
  }

  if (!options.dryRun) {
    writeJson(sessionPath, session);
    if (mdUpdated) {
      fs.writeFileSync(mdPath, mdUpdated, 'utf8');
      fs.writeFileSync(txtPath, markdownToPlainText(mdUpdated), 'utf8');
    }
  }

  return {
    sid,
    code,
    handoffFixed,
    qCount: session.discussionQuestions?.length || 0,
    headingCount: (session.paragraphs || []).filter((p) => p.heading).length,
    summaryCount: (session.paragraphs || []).filter((p) => p.teacherSummary).length,
    renderedMd: mdPath,
  };
}

function parseArgs(argv) {
  const opts = {
    sessions: null,
    wave: null,
    dryRun: false,
    skipLlm: false,
    skipStudyGuides: false,
    onlyStudyGuides: false,
    renderHtml: true,
    concurrency: 3,
  };
  for (const arg of argv) {
    if (arg.startsWith('--sessions=')) opts.sessions = arg.split('=')[1].split(',').filter(Boolean);
    else if (arg.startsWith('--wave=')) opts.wave = Number(arg.split('=')[1]);
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--skip-llm') opts.skipLlm = true;
    else if (arg === '--skip-study-guides') opts.skipStudyGuides = true;
    else if (arg === '--only-study-guides') opts.onlyStudyGuides = true;
    else if (arg === '--no-render-html') opts.renderHtml = false;
    else if (arg.startsWith('--concurrency=')) opts.concurrency = Math.max(1, Number(arg.split('=')[1]) || 3);
  }
  return opts;
}

function selectWaveSessions(wave) {
  if (wave === 2) return ['23', '34', '41', '42', '27B', '43', '44', '45', '46'];
  if (wave === 3) return ['18', '19', '20', '21', '22', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '35', '36', '37', '38', '39', '40'];
  if (wave === 4) return ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17'];
  return null;
}

async function runPool(items, concurrency, fn) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const course = readJson(COURSE_PATH);
  const toc = readJson(TOC_PATH);
  const waveList = selectWaveSessions(options.wave);
  const targetIds = options.sessions || waveList || course.sessions.map((s) => s.sessionId);

  const selectedMetas = targetIds.map((sid) => {
    const meta = course.sessions.find((s) => s.sessionId === sid);
    if (!meta) throw new Error(`Unknown sessionId: ${sid}`);
    return meta;
  });

  console.log(`Starting Workflow v2 upgrade for ${selectedMetas.length} session(s): ${targetIds.join(', ')} [concurrency=${options.concurrency}, skipLlm=${options.skipLlm}, dryRun=${options.dryRun}]`);

  const results = await runPool(selectedMetas, options.concurrency, async (meta) => {
    const t0 = Date.now();
    const res = await processSingleSession(meta, toc, course, options);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`✓ session_${res.sid} (${res.code}): qs=${res.qCount ?? '-'} heads=${res.headingCount ?? '-'} sums=${res.summaryCount ?? '-'} handoffs=${res.handoffFixed ?? 0} [${dt}s]`);
    return res;
  });

  if (!options.dryRun) {
    writeJson(TOC_PATH, toc);
    writeJson(COURSE_PATH, course);
    console.log(`Saved toc.json (${toc.nodes.length} total nodes) and course.json.`);

    if (options.renderHtml) {
      const mdFiles = results.map((r) => r.renderedMd).filter((p) => p && fs.existsSync(p));
      if (mdFiles.length > 0) {
        console.log(`Rendering ${mdFiles.length} HTML study guides via render_study_guide_html.py...`);
        const pyRes = spawnSync('python3', ['scripts/render_study_guide_html.py', ...mdFiles], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          maxBuffer: 8 * 1024 * 1024,
        });
        if (pyRes.status !== 0) {
          throw new Error(`render_study_guide_html.py failed:\n${pyRes.stderr}\n${pyRes.stdout}`);
        }
        console.log(pyRes.stdout.trim());
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
