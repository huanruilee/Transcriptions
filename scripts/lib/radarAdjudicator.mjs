#!/usr/bin/env node
/**
 * Cheap-model Review Radar adjudicator (< 250-token system prompt).
 * Consumes compact yellow-radar cards emitted by scripts/audit_reading_quality.mjs --radar-out,
 * calls a lightweight LLM (default: eNeural glm53-flash) in small JSON batches,
 * and deterministically applies FIX / MERGE_NEXT / KEEP decisions while preserving rawText.
 */
import { callEneuralWithRetry, extractJsonObject, loadEneuralApiKey } from './eneuralClient.mjs';
import { syncContentOverview } from './transcriptGuards.mjs';

export const RADAR_SYSTEM_PROMPT = [
  '你是佛學逐字稿輕量複核編輯，只審查被標記的爭議小卡。',
  '規則：嚴禁改寫原意、嚴禁簡體字、無把握一律 KEEP。',
  '針對每張小卡回傳 JSON：{"decisions":[{"id":"seg-xxxx","action":"FIX"|"MERGE_NEXT"|"KEEP","text":"修正後文字(僅FIX時必填)","reason":"簡短理由"}]}。',
  '若屬未完子句誤加句號：可選 FIX（句尾改「，」）或 MERGE_NEXT（併入下一句）；若屬合法獨立句選 KEEP。',
].join('\n');

export function buildRadarBatchMessages(cards, { courseHint = '' } = {}) {
  const compact = cards.map((c) => ({
    id: c.id,
    rule: c.ruleCode,
    hint: c.hint,
    prev: c.prev || '',
    cur: c.cur || '',
    next: c.next || '',
  }));
  return [
    { role: 'system', content: RADAR_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${courseHint ? `課程：${courseHint}\n` : ''}待審小卡：\n${JSON.stringify(compact)}`,
    },
  ];
}

export async function adjudicateRadarCards(
  cards,
  {
    batchSize = 15,
    courseHint = '',
    model = 'glm53-flash',
    apiKey = loadEneuralApiKey(),
    callModel = callEneuralWithRetry,
  } = {},
) {
  const adjudicable = (cards || []).filter((c) =>
    Array.isArray(c.allowedActions) ? c.allowedActions.includes('FIX') : true,
  );
  const allDecisions = [];
  for (let i = 0; i < adjudicable.length; i += batchSize) {
    const batch = adjudicable.slice(i, i + batchSize);
    const messages = buildRadarBatchMessages(batch, { courseHint });
    const raw = await callModel(messages, {
      apiKey,
      model,
      maxTokens: 2048,
      temperature: 0.1,
      jsonMode: true,
    });
    const parsed = extractJsonObject(raw);
    if (Array.isArray(parsed.decisions)) {
      allDecisions.push(...parsed.decisions);
    }
  }
  return allDecisions;
}

/**
 * Deterministically applies FIX / MERGE_NEXT / KEEP decisions onto a session object.
 * - Never mutates rawText on FIX.
 * - On MERGE_NEXT, merges cur + next within the same paragraph (preserving concatenated rawText & [cur.start, next.end]).
 * - Automatically updates _meta.total_sentences and re-syncs contentOverview if present.
 */
export function applyRadarDecisions(session, decisions = []) {
  const decisionMap = new Map();
  for (const d of decisions) {
    if (d?.id && ['FIX', 'MERGE_NEXT', 'KEEP'].includes(d.action)) {
      decisionMap.set(d.id, d);
    }
  }

  let fixedCount = 0;
  let mergedCount = 0;
  let keptCount = 0;

  for (const para of session.paragraphs || []) {
    const sents = Array.isArray(para.sentences) ? para.sentences : [];
    const nextSents = [];
    for (let i = 0; i < sents.length; i += 1) {
      const cur = { ...sents[i] };
      const dec = decisionMap.get(cur.id);
      if (!dec || dec.action === 'KEEP') {
        if (dec?.action === 'KEEP') keptCount += 1;
        nextSents.push(cur);
        continue;
      }
      if (dec.action === 'FIX' && typeof dec.text === 'string' && dec.text.trim()) {
        cur.text = dec.text.trim();
        fixedCount += 1;
        nextSents.push(cur);
        continue;
      }
      if (dec.action === 'MERGE_NEXT' && i + 1 < sents.length) {
        const nxt = sents[i + 1];
        const baseText = (typeof dec.text === 'string' && dec.text.trim() ? dec.text.trim() : cur.text)
          .replace(/[。]+$/, '');
        const joiner = /[，、：；？！]$/.test(baseText) ? '' : '，';
        cur.text = `${baseText}${joiner}${String(nxt.text || '').trim()}`;
        cur.end = Math.max(Number(cur.end), Number(nxt.end));
        if (cur.rawText !== undefined || nxt.rawText !== undefined) {
          cur.rawText = `${cur.rawText ?? ''} ${nxt.rawText ?? ''}`.trim();
        }
        mergedCount += 1;
        nextSents.push(cur);
        i += 1; // consume next sentence
        continue;
      }
      nextSents.push(cur);
    }
    para.sentences = nextSents;
    if (nextSents.length > 0) {
      para.start = nextSents[0].start;
      para.end = nextSents[nextSents.length - 1].end;
    }
  }

  const totalSentences = (session.paragraphs || []).reduce(
    (acc, p) => acc + (p.sentences?.length || 0),
    0,
  );
  if (session._meta) {
    session._meta.total_sentences = totalSentences;
    session._meta.total_paragraphs = (session.paragraphs || []).length;
  }
  if (session.contentOverview) {
    syncContentOverview(session);
  }

  return { fixedCount, mergedCount, keptCount, totalSentences };
}

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${flag}=`;
  const eq = args.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : null;
}

async function cliMain(argv) {
  const args = argv.slice(2);
  const sessionPath = getFlagValue(args, '--session');
  const radarPath = getFlagValue(args, '--radar');
  const courseHint = getFlagValue(args, '--course') || '';
  const model = getFlagValue(args, '--model') || 'glm53-flash';
  const envPath = getFlagValue(args, '--env') || undefined;
  const apply = args.includes('--apply');

  if (!sessionPath || !radarPath) {
    console.error('Usage: node scripts/lib/radarAdjudicator.mjs --session <session.json> --radar <radar.json> [--course <name>] [--model glm53-flash] [--apply]');
    process.exit(2);
  }

  const absSession = path.resolve(sessionPath);
  const absRadar = path.resolve(radarPath);
  const session = JSON.parse(fs.readFileSync(absSession, 'utf8'));
  const radar = JSON.parse(fs.readFileSync(absRadar, 'utf8'));
  const cards = Array.isArray(radar.cards) ? radar.cards : [];

  if (cards.length === 0) {
    console.log('[radarAdjudicator] 0 cards to adjudicate.');
    return;
  }

  const apiKey = loadEneuralApiKey(envPath);
  const decisions = await adjudicateRadarCards(cards, { courseHint, model, apiKey });
  console.log(JSON.stringify({ totalCards: cards.length, decisionsCount: decisions.length, decisions }, null, 2));

  if (apply) {
    const summary = applyRadarDecisions(session, decisions);
    fs.writeFileSync(absSession, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    console.log(`[radarAdjudicator] Applied to ${sessionPath}:`, summary);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await cliMain(process.argv);
}
