#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bindAdjudicationSuggestions,
  buildAdjudicationReviewItems,
  computeRuntimeFingerprint,
  executeCoverageBoundBatch,
} from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const sourcePath = path.resolve(ROOT, args.get('--source') || 'courses/四念住/sessions/session_08.json');
const packetPath = path.resolve(ROOT, args.get('--packet')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.compact-review.json');
const audioPath = path.resolve(ROOT, args.get('--audio')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.audio.json');
const provider = args.get('--provider') || 'qwen';
if (!['qwen', 'minimax'].includes(provider)) throw new Error('use --provider=qwen|minimax');
const mode = args.get('--mode') || 'decision';
if (!['decision', 'sentence-final'].includes(mode)) throw new Error('use --mode=decision|sentence-final');
const outputPath = path.resolve(ROOT, args.get('--output')
  || `reviews/evidence/transcript_proofreading/production/四念住/session_08.adjudication-${provider}${mode === 'sentence-final' ? '-sentence' : ''}.json`);
const endpoint = process.env.QWEN_ENDPOINT || 'http://127.0.0.1:18001/v1/chat/completions';
const requestedModel = provider === 'qwen'
  ? process.env.QWEN_MODEL || 'Qwen3.8-27B'
  : process.env.MINIMAX_MODEL || 'MiniMax-M3';
const batchSize = Number(args.get('--batch-size') || 10);
const externalDataAuthorization = args.get('--external-data-authorization') || null;
if (provider === 'minimax' && !externalDataAuthorization) {
  throw new Error('--external-data-authorization is required for MiniMax');
}
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20) {
  throw new Error('--batch-size must be an integer from 1 to 20');
}
for (const resolved of [sourcePath, packetPath, audioPath, outputPath]) {
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error('all paths must stay inside repository');
}

const system = [
  '你是保守的繁體中文佛法逐字稿裁決候選產生器，不是最終批准者。',
  '輸入含原句、修正候選、上下文、兩個文字模型意見，以及 Whisper 音訊片段辨識。Whisper 只證明近似讀音，不能單獨證明漢字。',
  'approve：候選可由音訊讀音、上下文與標準名相共同唯一支持。',
  'reject：原句較合理，或候選擴寫、錯義、沒有證據。',
  'replace：音訊與上下文清楚支持第三個完整句；proposedText 必須與原句、候選都不同，不得添加音訊沒有的內容。',
  'audio-required：仍有兩個合理讀法、音訊 ASR 不清、涉及譯名政策或法義不能唯一判定。',
  '純標點可 approve；不得因課名猜字；不確定時一律 audio-required。',
  ...(mode === 'sentence-final' ? [
    '本輪必須檢查整個 after 是否已達可發布品質，不可只看被標出的局部差異。',
    '若 after 仍含明顯同音錯字、錯誤名相或漏掉必要標點，使用 replace，proposedText 提供整句最小修正版。',
    '不可潤飾、刪除口語或重組句意；只改音訊、上下文與標準名相可證實的錯字及必要標點。',
  ] : []),
  '只輸出 JSON：{"items":[{"id":"...","decision":"approve|reject|replace|audio-required","proposedText":"僅 replace 時存在","code":"40字內"}]}。',
  'ID 與數量必須完全一致，不要解釋。',
].join('\n');

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function parseJsonObject(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('provider returned no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, filePath);
}

const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
const audioEvidence = JSON.parse(readFileSync(audioPath, 'utf8'));
const items = buildAdjudicationReviewItems({ source, packet, audioEvidence });
const packetDigest = digest(JSON.stringify(packet));

let runtimeFingerprint = null;
if (provider === 'qwen') {
  const modelsUrl = new URL('/v1/models', endpoint);
  const modelsResponse = await fetch(modelsUrl, { signal: AbortSignal.timeout(15000) });
  if (!modelsResponse.ok) throw new Error(`qwen models HTTP ${modelsResponse.status}`);
  const modelsPayload = await modelsResponse.json();
  runtimeFingerprint = computeRuntimeFingerprint(modelsPayload, requestedModel);
}
const attempts = [];
const rawResponseDigests = [];
let actualModel = null;

async function call(batch) {
  if (provider === 'minimax') {
    const stdout = execFileSync('mmx', [
      'text', 'chat', '--model', requestedModel, '--system', system,
      '--message', `user:${JSON.stringify({ items: batch })}`,
      '--max-tokens', '1800', '--temperature', '0.1',
      '--non-interactive', '--quiet', '--output', 'json',
    ], { encoding: 'utf8', timeout: 180000, maxBuffer: 4_000_000 });
    const rawDigest = digest(stdout);
    rawResponseDigests.push(rawDigest);
    return { response: parseJsonObject(stdout), rawDigest };
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: requestedModel,
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ items: batch }) }],
      temperature: 0,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
      chat_template_kwargs: { enable_thinking: false, reasoning_effort: 'low' },
    }),
    signal: AbortSignal.timeout(180000),
  });
  const rawText = await response.text();
  if (!response.ok) throw new Error(`qwen HTTP ${response.status}: ${rawText.slice(0, 300)}`);
  rawResponseDigests.push(digest(rawText));
  const raw = JSON.parse(rawText);
  if (raw.model) {
    if (actualModel && actualModel !== raw.model) throw new Error('provider changed actual model between batches');
    actualModel = raw.model;
  }
  return { response: parseJsonObject(raw.choices?.[0]?.message?.content || ''), rawDigest: digest(rawText) };
}

const decisions = [];
for (let offset = 0; offset < items.length; offset += batchSize) {
  const batch = items.slice(offset, offset + batchSize);
  decisions.push(...await executeCoverageBoundBatch({
    items: batch,
    attempts,
    call,
    bind: (reviewItems, result) => bindAdjudicationSuggestions({
      items: reviewItems,
      response: result.response,
      sourceDigest: packet.sourceDigest,
      runId: packet.runId,
      audioSha256: audioEvidence.audioSha256,
      packetDigest,
    }).decisions,
    onSplit: ({ inputCount, left, right, error }) => {
      process.stderr.write(`[${provider}-adjudication] split ${inputCount} -> ${left}+${right}: ${error.message}\n`);
    },
  }));
  process.stderr.write(`[${provider}-adjudication] ${Math.min(offset + batch.length, items.length)}/${items.length}\n`);
}

if (provider === 'qwen' && (!actualModel || actualModel !== requestedModel)) {
  throw new Error('Qwen actual model attestation failed');
}
const artifact = {
  schema: 'transcript-proofreading-adjudication-candidate/v1',
  authority: 'advisory',
  sourceDigest: packet.sourceDigest,
  runId: packet.runId,
  audioSha256: audioEvidence.audioSha256,
  packetDigest,
  itemCount: decisions.length,
  model: {
    provider: provider === 'qwen' ? 'gx10-qwen' : 'minimax-m3',
    requestedModel,
    actualModel,
    runtimeFingerprint,
    attested: Boolean(actualModel && actualModel === requestedModel && runtimeFingerprint),
  },
  promptDigest: digest(system),
  rawResponseDigests,
  attempts,
  generatedAt: new Date().toISOString(),
  transport: provider === 'qwen' ? 'ssh-tunnel://private-gx10' : 'mmx://external-minimax',
  authorization: provider === 'minimax' ? {
    scope: externalDataAuthorization,
    acknowledgedAt: new Date().toISOString(),
  } : { scope: 'private-gx10-user-authorized-2026-10-15' },
  decisions,
};
writeJsonAtomic(outputPath, artifact);
console.log(JSON.stringify({ outputPath, itemCount: artifact.itemCount, model: artifact.model }, null, 2));
