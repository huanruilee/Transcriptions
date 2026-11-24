#!/usr/bin/env node
/**
 * Upgrade courses/三主要道 using GX10 local Qwen (`http://100.113.144.100:18765/v1/chat/completions`)
 * with zero cloud API tokens, `fixes + breaks` minimal diff, fragment consolidation,
 * natural paragraphing (150-350 chars), numbered headings, and Stage 6 sourceDigest sync.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cachedJsonCall, extractJsonObject } from './lib/eneuralClient.mjs';
import {
  assertRawTextPreserved,
  findLowDensitySegments,
  isLockedSession,
  maskUrls,
  syncContentOverview,
  unmaskUrls,
} from './lib/transcriptGuards.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE_DIR = path.join(REPO_ROOT, 'courses/三主要道');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const GROUNDING_PATH = path.join(COURSE_DIR, 'grounding.json');
const CACHE_DIR = '/tmp/sanzhuyaodao_qwen_cache';

const GX10_VLLM_HOST = process.env.GX10_VLLM_HOST || '100.113.144.100';
const GX10_VLLM_PORT = Number(process.env.GX10_VLLM_PORT || 18765);
const GX10_QWEN_MODEL = process.env.GX10_QWEN_MODEL || 'qwen3.8-flash-next-iq3_s';

const GROUNDING = fs.existsSync(GROUNDING_PATH)
  ? JSON.parse(fs.readFileSync(GROUNDING_PATH, 'utf8'))
  : {};

const DETERMINISTIC_FIXES = [
  ['南無本失釋迦摩尼佛', '南無本師釋迦牟尼佛'],
  ['南無本師釋迦摩尼佛', '南無本師釋迦牟尼佛'],
  ['無上甚深為妙法', '無上甚深微妙法'],
  ['願解如來真實意', '願解如來真實義'],
  ['有漏韻體', '有漏蘊體'],
  ['三主要道的應對', '三主要道的研討'],
  ['在上次應對的', '在上次研討的'],
  ['上次應對', '上次研討'],
  ['如信法師', '如性法師'],
  ['如心法師', '如性法師'],
  ['任波切', '仁波切'],
  ['思維', '思惟'],
  ['佈施', '布施'],
  ['不是隻', '不是只'],
  ['隻談論', '只談論'],
  ['隻分析', '只分析'],
  ['隻是', '只是'],
  ['願解如來真實義請放掌', '願解如來真實義。請放掌'],
  ['再做介紹好，我們', '再做介紹。好，我們'],
  ['再見再見', '再見，再見'],
  ['禮敬、造論勸請、聽聞', '禮讚文、立誓造論、勸請聽聞'],
  ['禮藏文 利是造論', '禮讚文、立誓造論'],
  ['以自立為主', '以自利為主'],
  ['在於值的問題', '在於質的問題'],
  ['三有盛事息皆不可信', '三有盛事悉皆不可信'],
  ['進取蘊', '近取蘊'],
  ['比較的物件', '比較的對象'],
  ['需求在別', '需求在變'],
  ['把它淋溼', '把他淋溼'],
];

const SIMPLIFIED_TO_TRADITIONAL_HEADINGS = [
  ['金钱', '金錢'],
  ['无法', '無法'],
  ['解决', '解決'],
  ['内心', '內心'],
  ['观', '觀'],
  ['烦恼', '煩惱'],
  ['苦恼', '苦惱'],
  ['轮回', '輪迴'],
  ['无常', '無常'],
  ['空性见', '空性見'],
  ['实', '實'],
  ['乐', '樂'],
  ['觉', '覺'],
  ['业', '業'],
  ['体', '體'],
  ['边', '邊'],
  ['总', '總'],
  ['结', '結'],
];

function deterministicCleanText(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const { masked, urls } = maskUrls(rawInput);
  let text = masked.trim();

  for (const [bad, good] of DETERMINISTIC_FIXES) {
    if (text.includes(bad)) text = text.split(bad).join(good);
  }

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
    .trim();

  if (/^(呃|嗯|啊|喔|欸|[，。！？、\s])+$/u.test(text)) return '';
  return unmaskUrls(text, urls);
}

function callGx10Qwen(messages, { maxTokens = 2400, temperature = 0.1, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: GX10_QWEN_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      chat_template_kwargs: { enable_thinking: false },
    });

    const req = http.request(
      {
        hostname: GX10_VLLM_HOST,
        port: GX10_VLLM_PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c.toString('utf8'); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`GX10 Qwen HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            const parsed = JSON.parse(body);
            resolve((parsed.choices?.[0]?.message?.content || '').trim());
          } catch (err) {
            reject(new Error(`Invalid JSON from GX10 Qwen: ${err.message}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`GX10 Qwen timeout (${timeoutMs}ms)`)));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function processBatchWithQwen(sessionId, batchIndex, batchSentences, title) {
  const terms = (GROUNDING.high_frequency_doctrinal_terms || []).slice(0, 25).join('、');
  const lines = batchSentences.map((s) => `${s.id}|${s.text}`).join('\n');
  const inputHash = crypto
    .createHash('sha256')
    .update(`${GX10_QWEN_MODEL}\n${terms}\n${lines}`)
    .digest('hex')
    .slice(0, 12);
  const cachePath = path.join(
    CACHE_DIR,
    `s${sessionId}_b${String(batchIndex).padStart(3, '0')}_${inputHash}_qwen.json`,
  );
  return cachedJsonCall(cachePath, async () => {
    const systemPrompt = [
      `你是漢傳與藏傳格魯派佛學《三主要道》（如性法師主講）專業逐字稿校對與分段編輯。高頻名相：${terms}。`,
      '任務：針對給定的連續句子（id|text），僅輸出 JSON：{"fixes":[{"id":"seg-xxx","text":"..."}],"breaks":[{"id":"seg-yyy","heading":"小標或空字串"}]}',
      '嚴格規則：',
      '1. fixes 只列出需要修正錯字、同音誤植、補齊臺灣繁體標點（，、。、？、：「」《》）或清除純發語詞（呃/嗯/啊/喔/欸，純冗詞設 text:""）的句子；沒問題的句子不要放進 fixes。',
      '2. 嚴禁整句改寫、摘要或捏造未講內容；忠實保留如性法師口語實義。',
      '3. breaks 標記自然段起點 sentence id：每段約 150～350 字（4～12 句），依語意轉折切分。每逢義理主題轉換（約每 3～5 段）在 heading 填入簡明小標（8～20字），其餘分段 heading 設為 ""。',
    ].join('\n');
    const userPrompt = `講次：${title}（第 ${sessionId} 講，批次 ${batchIndex + 1}）\n句段清單：\n${lines}`;

    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = await callGx10Qwen([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]);
        const parsed = extractJsonObject(raw);
        return {
          fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
          breaks: Array.isArray(parsed.breaks) ? parsed.breaks : [],
        };
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    throw lastErr;
  });
}

function parseTimestampToSeconds(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function fetchYoutubeOutline(youtubeUrl, youtubeVideoId) {
  if (!youtubeUrl || !youtubeVideoId) return [];
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `yt_desc_${youtubeVideoId}.txt`);
  let desc = '';
  if (fs.existsSync(cachePath)) {
    desc = fs.readFileSync(cachePath, 'utf8');
  } else {
    try {
      desc = execFileSync(
        'ssh',
        [
          'henry@100.113.144.100',
          `/home/henry/.local/bin/yt-dlp --skip-download --print "%(description)s" "${youtubeUrl}"`,
        ],
        { encoding: 'utf8', timeout: 30000 },
      );
      fs.writeFileSync(cachePath, desc, 'utf8');
    } catch (err) {
      console.warn(`[WARN] Failed to fetch YouTube description for ${youtubeVideoId}: ${err.message}`);
      return [];
    }
  }

  const outline = [];
  for (const rawLine of desc.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(/^(?:(\d+)[.、．]\s*)?(.+?)\s*[（(](\d{1,2}:\d{2}(?::\d{2})?)[)）]\s*$/);
    if (!m) continue;
    const title = m[2].trim();
    if (!title) continue;
    outline.push({
      num: m[1] ? Number(m[1]) : outline.length + 1,
      title,
      startSec: parseTimestampToSeconds(m[3]),
    });
  }
  return outline;
}

const FORWARD_OPENER_RE =
  /^(?:[一二三四五六七八九十]+、|第[一二三四五六七八九十]+[層點部分]|例如|比如|首先|其次|最後|心裡|內心|如果|因為|所以|但是|不過|而且|因此|換言之|換句話說|也就是|請放掌)/;

function appendMergedRawRecord(target, source) {
  const existing = Array.isArray(target.mergedRawSegments) ? target.mergedRawSegments : [];
  const next = Array.isArray(source.mergedRawSegments) ? source.mergedRawSegments : [];
  target.mergedRawSegments = [
    ...existing,
    ...next,
    {
      id: source.id,
      ...(source.rawAsrSegmentId ? { rawAsrSegmentId: source.rawAsrSegmentId } : {}),
      start: source.start,
      end: source.end,
      ...(typeof source.rawText === 'string' ? { rawText: source.rawText } : {}),
    },
  ];
}

function consolidateShortFragments(sentences) {
  const out = [];
  const remap = new Map();
  let pendingPrefix = null;

  for (let i = 0; i < sentences.length; i++) {
    const s = { ...sentences[i], text: (sentences[i].text || '').trim() };
    if (!s.text) continue;

    if (pendingPrefix) {
      remap.set(pendingPrefix.id, s.id);
      const sep = pendingPrefix.text.endsWith('、') ? '' : '，';
      s.text = `${pendingPrefix.text.replace(/[。！？，]$/, '')}${sep}${s.text}`;
      s.start = pendingPrefix.start;
      appendMergedRawRecord(s, pendingPrefix);
      pendingPrefix = null;
    }

    const prevEnded = out.length > 0 && /[。！？]$/.test(out[out.length - 1].text);
    const isShortFragment = s.text.length <= 3 || (s.text.length <= 6 && FORWARD_OPENER_RE.test(s.text));

    // Forward-merge openers or fragments following a sentence-final boundary
    if (i < sentences.length - 1 && isShortFragment && (FORWARD_OPENER_RE.test(s.text) || prevEnded)) {
      pendingPrefix = s;
      continue;
    }

    // Merge tiny <=3 char trailing fragments into previous sentence
    if (out.length > 0 && s.text.length <= 3) {
      const prev = out[out.length - 1];
      prev.text = deterministicCleanText(`${prev.text.replace(/[，、]$/, '')}${s.text}`);
      prev.end = s.end;
      appendMergedRawRecord(prev, s);
      remap.set(s.id, prev.id);
      continue;
    }
    out.push(s);
  }
  if (pendingPrefix) out.push(pendingPrefix);
  return { consolidated: out, remap };
}

function remapOverviewEvidenceIds(overview, remap) {
  if (!overview || remap.size === 0) return;
  for (const group of ['mainPoints', 'discussionTopics', 'referenceViews']) {
    for (const item of overview[group] || []) {
      for (const ev of item.evidence || []) {
        if (ev.sentenceId && remap.has(ev.sentenceId)) {
          ev.sentenceId = remap.get(ev.sentenceId);
        }
      }
    }
  }
}

async function segmentSemanticsWithQwen(sessionId, consolidated, ytOutline, title) {
  const useYtOutline = ytOutline.length >= 2;
  const totalChars = consolidated.reduce((a, s) => a + s.text.length, 0);
  const WINDOW_SIZE = 220;
  const OVERLAP = 40;

  const windows = [];
  if (totalChars <= 7000 && consolidated.length <= 700) {
    windows.push({ start: 0, end: consolidated.length, coreStart: 0, coreEnd: consolidated.length });
  } else {
    let start = 0;
    while (start < consolidated.length) {
      const end = Math.min(consolidated.length, start + WINDOW_SIZE);
      const isFirst = start === 0;
      const isLast = end === consolidated.length;
      const coreStart = isFirst ? 0 : start + Math.floor(OVERLAP / 2);
      const coreEnd = isLast ? consolidated.length : end - Math.floor(OVERLAP / 2);
      windows.push({ start, end, coreStart, coreEnd });
      if (isLast) break;
      start = end - OVERLAP;
    }
  }

  const breakMap = new Map();
  for (let wIdx = 0; wIdx < windows.length; wIdx++) {
    const w = windows[wIdx];
    const slice = consolidated.slice(w.start, w.end);
    const lines = slice.map((s) => `${s.id}|${s.text}`).join('\n');
    const outlineHint = useYtOutline
      ? `官方章節提綱：${ytOutline.map((x) => `${x.num}.${x.title}`).join('、')}（標題已固定，heading 請一律留空字串 ""）`
      : '若無官方章節提綱，可於每 3～6 段主題轉換處在 heading 填入簡明小標，其餘設為 ""';
    const inputHash = crypto
      .createHash('sha256')
      .update(`seg-v2\n${GX10_QWEN_MODEL}\n${outlineHint}\n${lines}`)
      .digest('hex')
      .slice(0, 12);
    const cachePath = path.join(CACHE_DIR, `s${sessionId}_seg_w${wIdx}_${inputHash}_qwen.json`);

    const res = await cachedJsonCall(cachePath, async () => {
      const systemPrompt = [
        `你是《三主要道》（如性法師主講）專業逐字稿分段編輯。${outlineHint}。`,
        '任務：通讀整段講記脈絡，依「文義完整性、論點／舉例／問答轉換」標記自然段起點，僅輸出 JSON：{"breaks":[{"id":"seg-xxx","heading":""}]}',
        '嚴格規則：',
        '1. **嚴禁在未完子句或逗號（，）處換段**；換段起點 id 的前一句必須已經是語意完整結束的句子（例如句尾為 。！？）。',
        '2. 每段目標 **150～380 字（約 5～24 句）**；同一個完整比喻、列舉或推論（例如「環境／比較／需求」三個例子與小結）應盡量留在同一段或於完整論點處切換，不要切出僅 1～2 句的零碎孤段。',
        '3. 輸出僅包含 breaks 陣列，不要修改文字。',
      ].join('\n');
      const userPrompt = `講次：${title}（第 ${sessionId} 講，分段視窗 ${wIdx + 1}/${windows.length}）\n請依文義選出換段起點 id：\n${lines}`;

      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const raw = await callGx10Qwen([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ], 120000);
          const parsed = extractJsonObject(raw);
          return { breaks: Array.isArray(parsed.breaks) ? parsed.breaks : [] };
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
      throw lastErr;
    });

    const coreIds = new Set(consolidated.slice(w.coreStart, w.coreEnd).map((s) => s.id));
    for (const br of res.breaks || []) {
      if (br && typeof br.id === 'string' && coreIds.has(br.id)) {
        breakMap.set(br.id, { heading: typeof br.heading === 'string' ? br.heading : '' });
      }
    }
  }
  return breakMap;
}

function buildBalancedParagraphs(sentences, breakMap, ytOutline = []) {
  const useYtOutline = ytOutline.length >= 2;
  const ytHeadingBySentIdx = new Map();
  if (useYtOutline && sentences.length > 0) {
    let prevIdx = -1;
    for (let k = 0; k < ytOutline.length; k++) {
      const item = ytOutline[k];
      let targetIdx = 0;
      if (k > 0) {
        targetIdx = sentences.findIndex((s, idx) => idx > prevIdx && s.start >= item.startSec - 2.5);
        if (targetIdx === -1) continue;
      }
      prevIdx = targetIdx;
      ytHeadingBySentIdx.set(targetIdx, `${item.num}. ${item.title}`);
    }
  }

  const groups = [];
  let current = null;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const prev = i > 0 ? sentences[i - 1] : null;
    const prevEndsSentence = !prev || /[。！？]$/.test(prev.text.trim());
    const ytHeading = ytHeadingBySentIdx.get(i);
    const br = breakMap.get(s.id);
    const currentChars = current ? current.sentences.reduce((a, x) => a + x.text.length, 0) : 0;
    const shouldStartNew =
      !current ||
      Boolean(ytHeading) ||
      (br && prevEndsSentence && (currentChars >= 100 || (!useYtOutline && br.heading)));

    if (shouldStartNew) {
      const heading = useYtOutline ? ytHeading || '' : br?.heading ? br.heading.trim() : '';
      current = { heading, sentences: [s] };
      groups.push(current);
    } else {
      current.sentences.push(s);
    }
  }

  // Merge tiny paragraphs (< 80 chars) without heading
  const merged = [];
  for (const g of groups) {
    const chars = g.sentences.reduce((a, x) => a + x.text.length, 0);
    if (merged.length > 0 && chars < 80 && !g.heading) {
      merged[merged.length - 1].sentences.push(...g.sentences);
    } else {
      merged.push(g);
    }
  }

  // Safety split ONLY when exceeding hard cap (> 32 sentences or > 580 chars), strictly at sentence-ending [。！？]
  const finalGroups = [];
  for (const g of merged) {
    const chars = g.sentences.reduce((a, x) => a + x.text.length, 0);
    if ((chars <= 580 && g.sentences.length <= 32) || g.sentences.length <= 3) {
      finalGroups.push(g);
      continue;
    }
    let sub = { heading: g.heading, sentences: [] };
    let subChars = 0;
    for (let k = 0; k < g.sentences.length; k++) {
      const s = g.sentences[k];
      const prevSent = sub.sentences.length > 0 ? sub.sentences[sub.sentences.length - 1] : null;
      const prevText = prevSent ? prevSent.text.trim() : '';
      const prevComplete = /[。！？]$/.test(prevText);
      const prevIsDependent = /(?:之前|之後|時|的時候|的話|來說|而言|方面|情況下|狀態下)[，,]?$/.test(prevText);
      const remainingChars = g.sentences.slice(k).reduce((a, x) => a + x.text.length, 0);
      const nextStartsClause = /^(?:但|所以|因此|換句話說|如果|而|這就是|我們|對於|首先|其次|最後)/.test(
        s.text.trim(),
      );
      const hardCapHit = sub.sentences.length >= 34;
      if (
        hardCapHit ||
        (sub.sentences.length >= 5 &&
          remainingChars >= 60 &&
          !prevIsDependent &&
          ((prevComplete && (subChars >= 160 || sub.sentences.length >= 16)) ||
            (sub.sentences.length >= 24 && nextStartsClause) ||
            sub.sentences.length >= 28))
      ) {
        finalGroups.push(sub);
        sub = { heading: '', sentences: [] };
        subChars = 0;
      }
      sub.sentences.push(s);
      subChars += s.text.length;
    }
    if (sub.sentences.length > 0) finalGroups.push(sub);
  }

  // Enforce >=3 paragraphs spacing between headings only for auto-generated headings (never drop official YouTube outline headings)
  if (!useYtOutline) {
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
  }
  if (finalGroups.length > 0 && !finalGroups[0].heading) {
    finalGroups[0].heading = '開場儀軌與課程緣起';
  }

  let hNum = 1;
  return finalGroups.map((g, idx) => {
    let heading = g.heading.replace(/^〔|〕$/g, '').replace(/^\d+[.、]\s*/, '').trim();
    for (const [simp, trad] of SIMPLIFIED_TO_TRADITIONAL_HEADINGS) {
      if (heading.includes(simp)) heading = heading.split(simp).join(trad);
    }
    if (heading) heading = `${hNum++}. ${heading}`;
    const punctuated = g.sentences.map((s, sIdx) => {
      let t = s.text.trim();
      if (t && !/[。！？，、；：…」』）》”]$/.test(t)) {
        t += sIdx === g.sentences.length - 1 ? '。' : '，';
      } else if (sIdx === g.sentences.length - 1 && /[，、；：]$/.test(t)) {
        t = t.slice(0, -1) + '。';
      }
      return { ...s, text: t };
    });
    return {
      id: `p-${String(idx + 1).padStart(3, '0')}`,
      ...(heading ? { heading } : {}),
      start: punctuated[0].start,
      end: punctuated[punctuated.length - 1].end,
      sentences: punctuated,
    };
  });
}

async function upgradeSession(fileName) {
  const filePath = path.join(SESSIONS_DIR, fileName);
  if (isLockedSession(filePath, REPO_ROOT)) {
    console.log(`[SKIP] ${fileName} is locked`);
    return;
  }
  const originalSession = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const lowDensity = findLowDensitySegments(originalSession);
  if (lowDensity.length > 0) {
    console.log(`[WARN] ${fileName} low-density segments:`, lowDensity);
  }

  const session = structuredClone(originalSession);
  const sid = fileName.replace(/^session_/, '').replace(/\.json$/, '');

  const flat = [];
  for (const p of session.paragraphs || []) {
    for (const s of p.sentences || []) {
      const txt = deterministicCleanText(s.text || '');
      // Strip leaked YouTube SEO/title tag line at segment 1 if present
      if (s.id === 'seg-0001' && /^《三主要道》第\d+講.*格魯派[。.]?$/.test(txt)) {
        continue;
      }
      flat.push({ ...s, text: txt });
    }
  }

  const BATCH_SIZE = 60;
  const batches = [];
  for (let i = 0; i < flat.length; i += BATCH_SIZE) {
    batches.push(flat.slice(i, i + BATCH_SIZE));
  }

  console.log(`[session_${sid}] ${flat.length} sentences -> ${batches.length} batches via GX10 ${GX10_QWEN_MODEL} (concurrency=1)`);
  const fixMap = new Map();
  const breakMap = new Map();
  for (let idx = 0; idx < batches.length; idx++) {
    const res = await processBatchWithQwen(sid, idx, batches[idx], session.title || `第${sid}講`);
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

  let appliedFixes = 0;
  const fixedFlat = [];
  for (const s of flat) {
    let nextText = fixMap.has(s.id) ? deterministicCleanText(fixMap.get(s.id)) : s.text;
    if (nextText.includes('\ufffd')) {
      nextText = s.text;
    }
    if (
      fixMap.has(s.id) &&
      nextText.length > 0 &&
      Math.abs(nextText.length - s.text.length) > Math.max(20, s.text.length * 1.2)
    ) {
      nextText = s.text;
    }
    if (!nextText) continue;
    if (nextText !== s.text) appliedFixes++;
    fixedFlat.push({ ...s, text: nextText });
  }

  const ytOutline = fetchYoutubeOutline(session.youtubeUrl, session.youtubeVideoId);
  if (ytOutline.length >= 2) {
    console.log(`[session_${sid}] Using official YouTube outline (${ytOutline.length} sections)`);
  }
  const { consolidated, remap } = consolidateShortFragments(fixedFlat);
  remapOverviewEvidenceIds(session.contentOverview, remap);
  const semanticBreakMap = await segmentSemanticsWithQwen(
    sid,
    consolidated,
    ytOutline,
    session.title || `第${sid}講`,
  );
  console.log(`[session_${sid}] Semantic segmentation breaks=${semanticBreakMap.size}`);
  session.paragraphs = buildBalancedParagraphs(consolidated, semanticBreakMap, ytOutline);
  session.lastUpdated = '2026-11-23 22:00:00';

  assertRawTextPreserved(originalSession, session);
  syncContentOverview(session);

  fs.writeFileSync(filePath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');

  const headingsCount = session.paragraphs.filter((p) => p.heading).length;
  const totalChars = consolidated.reduce((a, x) => a + x.text.length, 0);
  const avgChars = Math.round(totalChars / session.paragraphs.length);
  const shortLeft = consolidated.filter((x) => x.text.length <= 3).length;
  console.log(
    `[session_${sid}] DONE: paras=${session.paragraphs.length} (avg ${avgChars} chars), headings=${headingsCount}, sents=${consolidated.length}, short<=3c=${shortLeft}, fixes=${appliedFixes}`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--session');
  const onlySession = idx >= 0 ? args[idx + 1].padStart(2, '0') : null;
  const files = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => /^session_\d+\.json$/.test(f))
    .sort()
    .filter((f) => !onlySession || f === `session_${onlySession}.json`);
  for (const f of files) {
    await upgradeSession(f);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
