#!/usr/bin/env node
/**
 * Upgrade & segment courses/四法印 (11 sessions) using the shared Low-Token Funnel:
 * 1. Pre-flight check against config/locked-sessions.json (skip SHA-256 pinned files).
 * 2. Read official edited reference text courses/四法印/source_text/lecture_{sid}.txt and grounding.json.
 * 3. Chunked eNeural (glm53-flash) IPv4 SSE calls (80 sentences/batch, concurrency 3, cached in /tmp/sifayin_upgrade_cache/)
 *    returning ONLY changed sentences (fixes) and natural paragraph/heading break points (breaks).
 * 4. Deterministic post-processing:
 *    - >2.2x length hallucination & truncation guard on fixes, preserving rawText, id, start, end, reviewNeeded.
 *    - Balanced natural paragraphs (120-420 chars; split >420 at sentence boundaries, merge <70 without heading).
 *    - >=3 paragraphs spacing between headings, numbered `1. ...`, `2. ...`, clean trailing punctuation.
 *    - assertRawTextPreserved() & syncContentOverview().
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
const COURSE_DIR = path.join(REPO_ROOT, 'courses/四法印');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const SOURCE_TEXT_DIR = path.join(COURSE_DIR, 'source_text');
const GROUNDING_PATH = path.join(COURSE_DIR, 'grounding.json');
const COURSE_JSON_PATH = path.join(COURSE_DIR, 'course.json');
const CACHE_DIR = '/tmp/sifayin_upgrade_cache';
const TIMESTAMP_STR = '2026-11-20 12:00:00';

const API_KEY = loadEneuralApiKey();
const GROUNDING = JSON.parse(fs.readFileSync(GROUNDING_PATH, 'utf8'));

const ENCLOSED_CJK_MAP = {
  '㈻': '學',
  '㆗': '中',
  '㆔': '三',
  '㈾': '資',
  '㈲': '有',
  '㆕': '四',
  '㊞': '印',
  '㉂': '自',
  '㆒': '一',
  '㉃': '至',
  '㊪': '宗',
  '㆘': '下',
  '㆝': '天',
};

const STRICT_SIMP_TO_TRAD = {
  '为': '為', '这': '這', '样': '樣', '个': '個', '说': '說',
  '体': '體', '经': '經', '论': '論', '门': '門', '从': '從',
  '对': '對', '么': '麼', '后': '後', '变': '變', '实': '實',
  '证': '證', '觉': '覺', '关': '關', '开': '開', '边': '邊',
  '过': '過', '问': '問', '题': '題', '时': '時', '间': '間',
  '还': '還', '会': '會', '点': '點', '现': '現', '显': '顯',
  '义': '義', '极': '極', '胜': '勝', '广': '廣', '当': '當',
  '无': '無', '师': '師', '发': '發', '与': '與', '见': '見',
  '随': '隨', '应': '應', '处': '處', '观': '觀', '摄': '攝',
  '识': '識', '别': '別', '业': '業', '释': '釋', '难': '難',
  '车': '車', '声': '聲', '闻': '聞', '缘': '緣', '执': '執',
  '许': '許', '计': '計', '总': '總', '种': '種', '听': '聽',
  '讲': '講', '话': '話', '导': '導', '读': '讀', '记': '記',
  '诵': '誦', '传': '傳', '萨': '薩', '罗': '羅', '辩': '辯',
  '净': '淨', '谛': '諦', '学': '學', '习': '習', '态': '態',
  '灵': '靈', '产': '產', '亲': '親', '着': '著', '晒': '曬',
};

function normalizeReferenceText(rawRef) {
  return String(rawRef || '').replace(/[㈻㆗㆔㈾㈲㆕㊞㉂㆒㉃㊪㆘㆝]/g, (ch) => ENCLOSED_CJK_MAP[ch] ?? ch);
}

function toTraditionalSafeguard(text) {
  return String(text || '').replace(
    /./gu,
    (ch) => ENCLOSED_CJK_MAP[ch] ?? STRICT_SIMP_TO_TRAD[ch] ?? ch,
  );
}

export function deterministicCleanText(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const { masked, urls } = maskUrls(rawInput);
  let text = toTraditionalSafeguard(masked.trim());

  const instructorAliases = GROUNDING?.entities?.instructor?.common_misrecognitions || [
    '如信法師',
    '如心法師',
    '如興法師',
    '人性法師',
  ];
  for (const alias of instructorAliases) {
    if (text.includes(alias)) {
      text = text.split(alias).join('如性法師');
    }
  }
  text = text.replace(/對勁/g, '對境');

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

function getProportionalReferenceSlice(refText, startIdx, endIdx, totalSentences) {
  if (!refText || totalSentences <= 0) return '';
  const startRatio = Math.max(0, startIdx / totalSentences - 0.08);
  const endRatio = Math.min(1, endIdx / totalSentences + 0.08);
  let charStart = Math.floor(startRatio * refText.length);
  let charEnd = Math.ceil(endRatio * refText.length);

  if (charStart > 0) {
    const prevNl = refText.lastIndexOf('\n', charStart);
    if (prevNl >= 0) charStart = prevNl + 1;
  }
  if (charEnd < refText.length) {
    const nextNl = refText.indexOf('\n', charEnd);
    if (nextNl >= 0) charEnd = nextNl;
  }
  return refText.slice(charStart, charEnd).trim();
}

async function processBatchWithCache(
  sessionId,
  batchIndex,
  totalBatches,
  batchSentences,
  refSlice,
  existingHeadingsHint,
  batchAnchorsHint,
) {
  const cachePath = path.join(CACHE_DIR, `s${sessionId}_b${String(batchIndex).padStart(3, '0')}_v3.json`);
  return cachedJsonCall(cachePath, async () => {
    const systemPrompt = [
      '你是漢傳與藏傳佛學《四法印》（如性法師 2020 年臺灣營隊主講）專業逐字稿校對與分段編輯。',
      '任務：對照官方整編參考底本，針對給定的連續句子（id|text），僅輸出 JSON：',
      '{"fixes":[{"id":"seg-xxx","text":"..."}],"breaks":[{"id":"seg-yyy","heading":"簡明小標或空字串"}]}',
      '嚴格規則：',
      '1. fixes 只列出「確實需要修正同音錯字或補標點」的句子（沒問題的句子不要放進 fixes！）：',
      '   - 對照參考底本只修正明確的 ASR 同音／近音錯字與用字（如 對勁->對境、疑人->怡仁、孕體->蘊體、陷起->現起、自規派->自續派、綜藝時->宗義師、取運->取蘊、被夜->被業、執的就是->指的就是、思維->思惟、遍佈->遍布；若底本該處寫「不堪能」而 ASR 寫「不堪用」可改「不堪能」）。',
      '   - 補齊遺漏或修正錯誤標點。',
      '2. 絕對忠實保留講者口語原話！參考底本是整編精煉稿，僅用於查證專名與同音錯字；若 ASR 原句語意已通順、只是口語較囉嗦或問句（例如「這時候我們會往自己身體的這個範圍的左邊去看」vs 底本「左側看」、「另外一個地方嗎」vs 底本「其他地方」、「某一個位置」vs 底本「蘊體裡的某個地方」），必須完整保留原句口語用詞與問號，嚴禁拿底本的書面語覆蓋原話！',
      '3. 嚴禁刪除任何句子（不可回傳 text:""）、嚴禁把「他」改成「牠」、嚴禁憑空猜字（如底本「之前」而 ASR 為「聖誠」時不可亂改成「如性法師」或「聽誠」）。',
      '4. 一律使用臺灣正體中文（繁體中文）與全形標點（，。？！：；、「」），嚴禁簡體字。',
      '5. breaks 標記自然段起點 sentence id：每段約 150～350 字（4～12 句），依語意轉折切分。每個 80 句批次內請務必標出 1～2 個義理轉折小標（heading 填入 6～16 字簡明標題，不要編號，其餘自然段 heading 設為 ""），並保留本批既有提綱起點小標；相鄰段落與相鄰批次不要重複完全相同的小標。',
    ].join('\n');

    const lines = batchSentences.map((s) => `${s.id}|${s.text}`).join('\n');
    const userPrompt = [
      `講次：第 ${sessionId} 講（批次 ${batchIndex + 1}/${totalBatches}）`,
      existingHeadingsHint ? `全講既有提綱脈絡：${existingHeadingsHint}` : '',
      batchAnchorsHint ? `本批既有提綱起點：${batchAnchorsHint}` : '',
      refSlice ? `官方整編參考底本對應節選：\n${refSlice}` : '',
      '待校句段清單：',
      lines,
    ].filter(Boolean).join('\n\n');

    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = await callEneuralWithRetry(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { apiKey: API_KEY, maxTokens: 4096, temperature: 0.1, jsonMode: true },
        );
        const parsed = extractJsonObject(raw);
        return {
          fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
          breaks: Array.isArray(parsed.breaks) ? parsed.breaks : [],
        };
      } catch (err) {
        lastErr = err;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
    throw lastErr;
  });
}

function hanOnly(text) {
  return String(text || '').replace(/[^\p{Script=Han}]/gu, '');
}

function hanOverlap(a, b) {
  const ca = [...hanOnly(a)];
  const cb = [...hanOnly(b)];
  if (!ca.length || !cb.length) return 1;
  const map = new Map();
  for (const ch of cb) map.set(ch, (map.get(ch) || 0) + 1);
  let hit = 0;
  for (const ch of ca) {
    if ((map.get(ch) || 0) > 0) {
      hit++;
      map.set(ch, map.get(ch) - 1);
    }
  }
  return (2 * hit) / (ca.length + cb.length);
}

function cleanHeadingText(rawHeading) {
  return toTraditionalSafeguard(String(rawHeading || ''))
    .replace(/^〔|〕$/g, '')
    .replace(/^\d+[.、]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildBalancedParagraphs(sentences, breakMap, fallbackFirstHeading = '開場與本講綱領') {
  const groups = [];
  let current = null;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const br = breakMap.get(s.id);
    const currentChars = current ? current.sentences.reduce((a, x) => a + x.text.length, 0) : 0;

    const shouldStartNew =
      !current ||
      (br && (currentChars >= 110 || (br.heading && currentChars >= 70))) ||
      currentChars >= 360;

    if (shouldStartNew) {
      current = {
        heading: br?.heading ? cleanHeadingText(br.heading) : '',
        sentences: [s],
      };
      groups.push(current);
    } else {
      current.sentences.push(s);
    }
  }

  // Merge tiny <70 char groups without headings (or tiny <70 tail group) into previous group
  const merged = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const chars = g.sentences.reduce((a, x) => a + x.text.length, 0);
    const isTail = i === groups.length - 1;
    if (merged.length > 0 && chars < 70 && (!g.heading || isTail)) {
      merged[merged.length - 1].sentences.push(...g.sentences);
    } else {
      merged.push(g);
    }
  }
  if (merged.length > 1) {
    const firstChars = merged[0].sentences.reduce((a, x) => a + x.text.length, 0);
    if (firstChars < 70 && !merged[1].heading) {
      merged[1].sentences.unshift(...merged[0].sentences);
      if (merged[0].heading) merged[1].heading = merged[0].heading;
      merged.shift();
    }
  }

  // Split paragraphs >420 chars at sentence boundaries
  const finalGroups = [];
  for (const g of merged) {
    const chars = g.sentences.reduce((a, x) => a + x.text.length, 0);
    if (chars <= 420 || g.sentences.length <= 1) {
      finalGroups.push(g);
      continue;
    }
    let remaining = chars;
    let sub = { heading: g.heading, sentences: [] };
    let subChars = 0;
    for (const s of g.sentences) {
      if (sub.sentences.length > 0 && subChars >= 190 && remaining >= 120) {
        finalGroups.push(sub);
        sub = { heading: '', sentences: [] };
        subChars = 0;
      }
      sub.sentences.push(s);
      subChars += s.text.length;
      remaining -= s.text.length;
    }
    if (sub.sentences.length > 0) finalGroups.push(sub);
  }

  // Enforce >= 3 paragraphs spacing between headings and skip duplicate adjacent headings
  let lastHeadingIdx = -10;
  let lastHeadingText = '';
  for (let i = 0; i < finalGroups.length; i++) {
    if (finalGroups[i].heading) {
      if ((i - lastHeadingIdx < 3 && i !== 0) || finalGroups[i].heading === lastHeadingText) {
        finalGroups[i].heading = '';
      } else {
        lastHeadingIdx = i;
        lastHeadingText = finalGroups[i].heading;
      }
    }
  }
  if (finalGroups.length > 0 && !finalGroups[0].heading) {
    finalGroups[0].heading = cleanHeadingText(fallbackFirstHeading) || '開場與本講綱領';
  }

  let hNum = 1;
  return finalGroups.map((g, idx) => {
    let heading = cleanHeadingText(g.heading);
    if (heading) {
      heading = `${hNum++}. ${heading}`;
    }

    const punctuatedSentences = g.sentences.map((s, sIdx) => {
      let t = s.text.trim();
      const isLast = sIdx === g.sentences.length - 1;
      if (t) {
        if (!/[。！？，、；：…」』）》”]$/.test(t)) {
          t += isLast ? '。' : '，';
        } else if (isLast && /[，、；：]$/.test(t)) {
          t = `${t.slice(0, -1)}。`;
        } else if (isLast && !/[。！？；：」』）】]$/.test(t)) {
          t += '。';
        }
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
    return null;
  }

  const originalSession = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const session = structuredClone(originalSession);
  const sid = fileName.replace(/^session_/, '').replace(/\.json$/, '');

  const refPath = path.join(SOURCE_TEXT_DIR, `lecture_${sid}.txt`);
  const refText = fs.existsSync(refPath)
    ? normalizeReferenceText(fs.readFileSync(refPath, 'utf8'))
    : '';

  const existingAnchorBySentenceId = new Map();
  const existingHeadings = [];
  for (const p of session.paragraphs || []) {
    if (p.heading) {
      existingHeadings.push(cleanHeadingText(p.heading));
      const firstSent = p.sentences?.[0];
      if (firstSent?.id) {
        existingAnchorBySentenceId.set(firstSent.id, cleanHeadingText(p.heading));
      }
    }
  }
  const existingHeadingsHint = existingHeadings.join(' / ');

  const flat = [];
  for (const p of session.paragraphs || []) {
    for (const s of p.sentences || []) {
      flat.push({ ...s, text: deterministicCleanText(s.text || '') });
    }
  }

  const BATCH_SIZE = 80;
  const MAX_BATCH_CHARS = 2200;
  const batches = [];
  let cursor = 0;
  while (cursor < flat.length) {
    const startIdx = cursor;
    let batchChars = 0;
    while (cursor < flat.length && cursor - startIdx < BATCH_SIZE) {
      const nextLen = flat[cursor].text.length;
      if (cursor > startIdx && batchChars + nextLen > MAX_BATCH_CHARS) break;
      batchChars += nextLen;
      cursor++;
    }
    batches.push({
      startIdx,
      endIdx: cursor,
      sentences: flat.slice(startIdx, cursor),
    });
  }

  console.log(`[session_${sid}] ${flat.length} sentences -> ${batches.length} batches`);
  const batchResults = await runPool(batches, 3, (b, idx) => {
    const refSlice = getProportionalReferenceSlice(refText, b.startIdx, b.endIdx, flat.length);
    const batchAnchors = b.sentences
      .filter((s) => existingAnchorBySentenceId.has(s.id))
      .map((s) => `${s.id}（${existingAnchorBySentenceId.get(s.id)}）`)
      .join('、');
    return processBatchWithCache(
      sid,
      idx,
      batches.length,
      b.sentences,
      refSlice,
      existingHeadingsHint,
      batchAnchors,
    );
  });

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

  // Ensure existing outline anchor points retain at least a break with their official heading if no nearby heading was set
  for (const [sentId, heading] of existingAnchorBySentenceId.entries()) {
    const existing = breakMap.get(sentId);
    if (!existing) {
      breakMap.set(sentId, { heading });
    } else if (!existing.heading) {
      breakMap.set(sentId, { heading });
    }
  }

  const updatedFlat = [];
  let appliedFixes = 0;
  let removedFillers = 0;
  let rejectedHallucinations = 0;
  for (const s of flat) {
    if (!s.text) {
      removedFillers++;
      continue;
    }
    let nextText = fixMap.has(s.id) ? deterministicCleanText(fixMap.get(s.id)) : s.text;
    // Never allow LLM to drop a real sentence by returning empty string
    if (!nextText) {
      nextText = s.text;
    }
    // Guard against pronoun substitution 他 -> 牠 when original did not have 牠
    if (!s.text.includes('牠') && nextText.includes('牠')) {
      nextText = nextText.replace(/牠/g, '他');
    }
    if (fixMap.has(s.id) && nextText.length > 0) {
      const hasAsciiNoise = /[A-Za-z]{3,}/.test(s.text);
      const origHan = hanOnly(s.text);
      const nextHan = hanOnly(nextText);
      const tooLong = nextText.length > Math.max(15, s.text.length * 2.2);
      const tooShort = s.text.length >= 12 && nextText.length < s.text.length * 0.45;
      const lenDelta = Math.abs(nextHan.length - origHan.length);
      const maxLenDelta = origHan.length <= 2 ? 1 : Math.max(3, Math.floor(origHan.length * 0.35));
      const rewriteDrift =
        !hasAsciiNoise &&
        (lenDelta > maxLenDelta || (origHan.length >= 3 && hanOverlap(origHan, nextHan) < 0.5));
      if (tooLong || tooShort || rewriteDrift) {
        nextText = s.text;
        rejectedHallucinations++;
      }
    }
    if (nextText !== s.text) appliedFixes++;
    updatedFlat.push({ ...s, text: nextText });
  }

  const firstFallbackHeading = existingHeadings[0] || '開場與本講綱領';
  session.paragraphs = buildBalancedParagraphs(updatedFlat, breakMap, firstFallbackHeading).map((p) => {
    const out = { id: p.id };
    if (p.heading) out.heading = p.heading;
    out.start = p.start;
    out.end = p.end;
    out.sentences = p.sentences;
    return out;
  });

  const totalChars = session.paragraphs
    .flatMap((p) => p.sentences)
    .reduce((a, x) => a + x.text.length, 0);

  session.lastUpdated = TIMESTAMP_STR;
  if (session._meta) {
    session._meta.total_paragraphs = session.paragraphs.length;
    session._meta.total_sentences = updatedFlat.length;
    session._meta.charCount = totalChars;
    session._meta.processed_at = TIMESTAMP_STR;
    if (typeof session._meta.fillerOnlySentencesDropped === 'number') {
      session._meta.fillerOnlySentencesDropped += removedFillers;
    }
  }

  assertRawTextPreserved(originalSession, session);
  syncContentOverview(session);

  fs.writeFileSync(filePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');

  const headingsCount = session.paragraphs.filter((p) => p.heading).length;
  const avgChars = Math.round(totalChars / session.paragraphs.length);
  console.log(
    `[session_${sid}] DONE: paras=${session.paragraphs.length} (avg ${avgChars} chars), headings=${headingsCount}, sents=${updatedFlat.length}, fixes=${appliedFixes}, removedFillers=${removedFillers}, rejectedGuard=${rejectedHallucinations}`,
  );
  return {
    sid,
    paras: session.paragraphs.length,
    avgChars,
    headings: headingsCount,
    sents: updatedFlat.length,
    fixes: appliedFixes,
    removedFillers,
    rejectedHallucinations,
  };
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

  const stats = [];
  for (const f of files) {
    const res = await upgradeSession(f);
    if (res) stats.push(res);
  }

  if (!onlySession) {
    const cj = JSON.parse(fs.readFileSync(COURSE_JSON_PATH, 'utf8'));
    cj.updatedAt = TIMESTAMP_STR;
    for (const s of cj.sessions || []) {
      s.lastUpdated = TIMESTAMP_STR;
    }
    fs.writeFileSync(COURSE_JSON_PATH, `${JSON.stringify(cj, null, 2)}\n`, 'utf8');
    console.log(`[course.json] updatedAt=${TIMESTAMP_STR} and ${cj.sessions?.length || 0} session entries updated.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
