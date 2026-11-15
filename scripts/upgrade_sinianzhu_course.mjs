#!/usr/bin/env node
/**
 * Upgrade & segment courses/四念住 using the shared Low-Token Funnel:
 * 1. Pre-flight check against config/locked-sessions.json (skip SHA-256 pinned files).
 * 2. Deterministic grounding corrections + URL-masked punctuation normalization (preserving rawText).
 * 3. Chunked eNeural (glm53-flash) IPv4 SSE calls returning only changed sentences (fixes)
 *    and natural paragraph/heading break points (breaks).
 * 4. Deterministic paragraph length & numbered heading enforcement (150-350 chars/para).
 * 5. Stage 6 contentOverview evidence hydration & sourceDigest sync.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cachedJsonCall,
  callEneuralWithRetry,
  extractJsonObject,
  loadEneuralApiKey,
  runPool,
} from './lib/eneuralClient.mjs';
import {
  assertRawTextPreserved,
  isLockedSession,
  maskUrls,
  syncContentOverview,
  unmaskUrls,
} from './lib/transcriptGuards.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE_DIR = path.join(REPO_ROOT, 'courses/四念住');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const GROUNDING_PATH = path.join(COURSE_DIR, 'grounding.json');
const COURSE_JSON_PATH = path.join(COURSE_DIR, 'course.json');
const CACHE_DIR = '/tmp/sinianzhu_upgrade_cache';

const API_KEY = loadEneuralApiKey();
const GROUNDING = JSON.parse(fs.readFileSync(GROUNDING_PATH, 'utf8'));

export function deterministicCleanText(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const { masked, urls } = maskUrls(rawInput);
  let text = masked.trim();

  for (const [bad, good] of GROUNDING.asrCorrections) {
    if (text.includes(bad)) {
      text = text.split(bad).join(good);
    }
  }

  text = text.replace(/舊的翻譯叫做四念住([。，,]*)新的翻譯叫做四念住/g, '舊的翻譯叫做四念處$1新的翻譯叫做四念住');

  text = text
    .replace(/,/g, '，')
    .replace(/\?/g, '？')
    .replace(/!/g, '！')
    .replace(/:/g, '：')
    .replace(/;/g, '；')
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
    .replace(/\s+([，。！？、；：])/g, '$1')
    .replace(/([，。！？、；：])\s+/g, '$1')
    .replace(/^[，、]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^(呃|嗯|啊|喔|欸|[，。！？、\s])+$/u.test(text)) {
    return '';
  }

  return unmaskUrls(text, urls);
}

async function processBatchWithCache(sessionId, batchIndex, batchSentences, existingHeadingsHint) {
  const cachePath = path.join(CACHE_DIR, `s${sessionId}_b${String(batchIndex).padStart(3, '0')}_v1.json`);
  return cachedJsonCall(cachePath, async () => {
    const systemPrompt = [
      '你是漢傳佛教《四念住》（玅境長老 1996 年於美國法雲寺佛學院講授）專業逐字稿校對與分段編輯。',
      '核心經論依據：《瑜伽師地論·聲聞地》（奢摩他、毘缽舍那、七作意、了相作意、六事尋思、尋思黑品/白品、身念處不淨觀）、《大智度論》〈釋初品中四念處義〉、《阿含經》。',
      '任務：針對給定的連續句子（id|text），僅輸出 JSON：{"fixes":[{"id":"seg-xxx","text":"..."}],"breaks":[{"id":"seg-yyy","heading":"小標或空字串"}]}',
      '嚴格規則：',
      '1. fixes 只列出需要修正錯字、同音誤植（如 國學院->佛學院、會->慧、棋輪->臍輪、奢魔陀->奢摩他、皮婆舍那->毘缽舍那、雲和->云何、詩詩->是思、私之->實知、所赦->所攝）、清除純發語詞（呃/嗯/啊/喔/欸，純冗詞設 text:""）、補上漏失標點或修復斷詞的句子；沒問題的句子不要放進 fixes。',
      '2. 嚴禁整句改寫、摘要或捏造未講內容；忠實保留玅境長老口語實義。',
      '3. breaks 標記自然段起點 sentence id：每段約 150～350 字（4～12 句），依語意轉折切分。每逢講題大段落轉換（約每 3～5 段）在 heading 填入簡明小標（如「安住腹部與止觀次第」），其餘分段 heading 設為 ""。',
    ].join('\n');

    const lines = batchSentences.map((s) => `${s.id}|${s.text}`).join('\n');
    const userPrompt = [
      `講次：第 ${sessionId} 講（批次 ${batchIndex + 1}）`,
      existingHeadingsHint ? `既有參考小標脈絡：${existingHeadingsHint}` : '',
      '句段清單：',
      lines,
    ].filter(Boolean).join('\n');

    const raw = await callEneuralWithRetry(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { apiKey: API_KEY, maxTokens: 2400, temperature: 0.1, jsonMode: true },
    );
    const parsed = extractJsonObject(raw);
    return {
      fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
      breaks: Array.isArray(parsed.breaks) ? parsed.breaks : [],
    };
  });
}

function buildBalancedParagraphs(sentences, breakMap) {
  const groups = [];
  let current = null;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const br = breakMap.get(s.id);
    const currentChars = current ? current.sentences.reduce((a, x) => a + x.text.length, 0) : 0;

    const shouldStartNew =
      !current ||
      (br && (currentChars >= 90 || br.heading)) ||
      currentChars >= 360;

    if (shouldStartNew) {
      current = {
        heading: br?.heading ? br.heading.trim() : '',
        sentences: [s],
      };
      groups.push(current);
    } else {
      current.sentences.push(s);
    }
  }

  const merged = [];
  for (const g of groups) {
    const chars = g.sentences.reduce((a, x) => a + x.text.length, 0);
    if (merged.length > 0 && chars < 70 && !g.heading) {
      merged[merged.length - 1].sentences.push(...g.sentences);
    } else {
      merged.push(g);
    }
  }

  const finalGroups = [];
  for (const g of merged) {
    const chars = g.sentences.reduce((a, x) => a + x.text.length, 0);
    if (chars <= 450 || g.sentences.length <= 2) {
      finalGroups.push(g);
      continue;
    }
    let sub = { heading: g.heading, sentences: [] };
    let subChars = 0;
    for (const s of g.sentences) {
      if (sub.sentences.length > 0 && subChars >= 240) {
        finalGroups.push(sub);
        sub = { heading: '', sentences: [] };
        subChars = 0;
      }
      sub.sentences.push(s);
      subChars += s.text.length;
    }
    if (sub.sentences.length > 0) finalGroups.push(sub);
  }

  let lastHeadingIdx = -10;
  for (let i = 0; i < finalGroups.length; i++) {
    if (finalGroups[i].heading) {
      if (i - lastHeadingIdx < 3 && i !== 0) {
        finalGroups[i].heading = '';
      } else {
        lastHeadingIdx = i;
      }
    }
  }
  if (!finalGroups[0]?.heading && finalGroups.length > 0) {
    finalGroups[0].heading = '開場與本講綱領';
  }

  let hNum = 1;
  return finalGroups.map((g, idx) => {
    let heading = g.heading
      .replace(/^〔|〕$/g, '')
      .replace(/^\d+[.、]\s*/, '')
      .trim();
    if (heading) {
      heading = `${hNum++}. ${heading}`;
    }
    const punctuatedSentences = g.sentences.map((s, sIdx) => {
      let t = s.text.trim();
      if (t && !/[。！？，、；：…」』）》”]$/.test(t)) {
        const isLast = sIdx === g.sentences.length - 1;
        t += isLast ? '。' : '，';
      } else if (sIdx === g.sentences.length - 1 && /[，、；：]$/.test(t)) {
        t = t.slice(0, -1) + '。';
      }
      return { ...s, text: t };
    });
    const first = punctuatedSentences[0];
    const last = punctuatedSentences[punctuatedSentences.length - 1];
    return {
      id: `p-${String(idx + 1).padStart(3, '0')}`,
      heading: heading || undefined,
      start: first.start,
      end: last.end,
      sentences: punctuatedSentences,
    };
  });
}

async function upgradeSession(fileName) {
  const filePath = path.join(SESSIONS_DIR, fileName);
  if (isLockedSession(filePath, REPO_ROOT)) {
    console.log(`[SKIP] ${fileName} is locked in config/locked-sessions.json`);
    return;
  }

  const originalSession = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const session = structuredClone(originalSession);
  const sid = fileName.replace(/^session_/, '').replace(/\.json$/, '');

  const existingHeadingsHint = (session.paragraphs || [])
    .map((p) => p.heading)
    .filter(Boolean)
    .slice(0, 12)
    .join(' / ');

  const flat = [];
  for (const p of session.paragraphs || []) {
    for (const s of p.sentences || []) {
      flat.push({ ...s, text: deterministicCleanText(s.text || '') });
    }
  }

  const BATCH_SIZE = 80;
  const batches = [];
  for (let i = 0; i < flat.length; i += BATCH_SIZE) {
    batches.push(flat.slice(i, i + BATCH_SIZE));
  }

  console.log(`[session_${sid}] ${flat.length} sentences -> ${batches.length} batches`);
  const batchResults = await runPool(batches, 3, (b, idx) =>
    processBatchWithCache(sid, idx, b, existingHeadingsHint),
  );

  const fixMap = new Map();
  const breakMap = new Map();
  for (const res of batchResults) {
    for (const fx of res.fixes || []) {
      if (fx && typeof fx.id === 'string' && typeof fx.text === 'string') {
        fixMap.set(fx.id, fx.text);
      }
    }
    for (const br of res.breaks || []) {
      if (br && typeof br.id === 'string') {
        breakMap.set(br.id, { heading: typeof br.heading === 'string' ? br.heading : '' });
      }
    }
  }

  const updatedFlat = [];
  let appliedFixes = 0;
  let removedFillers = 0;
  for (const s of flat) {
    let nextText = fixMap.has(s.id) ? deterministicCleanText(fixMap.get(s.id)) : s.text;
    if (
      fixMap.has(s.id) &&
      nextText.length > 0 &&
      Math.abs(nextText.length - s.text.length) > Math.max(20, s.text.length * 1.2)
    ) {
      nextText = s.text;
    }
    if (!nextText) {
      removedFillers++;
      continue;
    }
    if (nextText !== s.text) appliedFixes++;
    updatedFlat.push({ ...s, text: nextText });
  }

  session.paragraphs = buildBalancedParagraphs(updatedFlat, breakMap).map((p) => {
    const out = { id: p.id };
    if (p.heading) out.heading = p.heading;
    out.start = p.start;
    out.end = p.end;
    out.sentences = p.sentences;
    return out;
  });
  session.lastUpdated = '2026-11-15';

  assertRawTextPreserved(originalSession, session);
  syncContentOverview(session);

  fs.writeFileSync(filePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');

  const headingsCount = session.paragraphs.filter((p) => p.heading).length;
  const totalChars = updatedFlat.reduce((a, x) => a + x.text.length, 0);
  const avgChars = Math.round(totalChars / session.paragraphs.length);
  console.log(
    `[session_${sid}] DONE: paras=${session.paragraphs.length} (avg ${avgChars} chars), headings=${headingsCount}, sents=${updatedFlat.length}, fixes=${appliedFixes}, removedFillers=${removedFillers}`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const sessionArgIdx = args.indexOf('--session');
  const onlySession = sessionArgIdx >= 0 ? args[sessionArgIdx + 1].padStart(2, '0') : null;

  const files = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => /^session_\d+\.json$/.test(f))
    .sort()
    .filter((f) => !onlySession || f === `session_${onlySession}.json`);

  if (files.length === 0) throw new Error('No matching session files found.');

  for (const f of files) {
    await upgradeSession(f);
  }

  if (!onlySession) {
    const cj = JSON.parse(fs.readFileSync(COURSE_JSON_PATH, 'utf8'));
    cj.lastUpdated = '2026-11-15';
    fs.writeFileSync(COURSE_JSON_PATH, `${JSON.stringify(cj, null, 2)}\n`, 'utf8');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
