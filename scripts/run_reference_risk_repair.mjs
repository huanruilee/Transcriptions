#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bindReferenceRiskRepairs,
  computeRuntimeFingerprint,
  executeCoverageBoundBatch,
} from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const sourcePath = path.resolve(ROOT, args.get('--source') || 'courses/四念住/sessions/session_08.json');
const alignmentPath = path.resolve(ROOT, args.get('--alignment')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.reference-alignment.json');
const provider = args.get('--provider') || 'qwen';
if (!['qwen', 'minimax'].includes(provider)) throw new Error('use --provider=qwen|minimax');
const mode = args.get('--mode') || 'reference';
if (!['reference', 'audio-adjudication'].includes(mode)) {
  throw new Error('use --mode=reference|audio-adjudication');
}
if (mode === 'audio-adjudication' && provider !== 'qwen') {
  throw new Error('audio-adjudication is a local-Qwen-only pass');
}
const outputPath = path.resolve(ROOT, args.get('--output')
  || `reviews/evidence/transcript_proofreading/production/四念住/session_08.reference-risk-${provider}${mode === 'audio-adjudication' ? '-audio' : ''}.json`);
const endpoint = process.env.QWEN_ENDPOINT || 'http://127.0.0.1:18001/v1/chat/completions';
const requestedModel = provider === 'qwen'
  ? process.env.QWEN_MODEL || 'Qwen3.8-27B'
  : process.env.MINIMAX_MODEL || 'MiniMax-M3';
const externalDataAuthorization = args.get('--external-data-authorization') || null;
if (provider === 'minimax' && !externalDataAuthorization) {
  throw new Error('--external-data-authorization is required for MiniMax');
}
const batchSize = Number(args.get('--batch-size') || 5);
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 8) {
  throw new Error('--batch-size must be an integer from 1 to 8');
}
for (const resolved of [sourcePath, alignmentPath, outputPath]) {
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error('all paths must stay inside repository');
}

const system = [
  '你是保守的繁體中文佛法逐字稿分句校稿候選產生器，不是最終批准者。',
  'referenceText 來自同一講的正式講記，可作獨立文字依據，但它可能省略口語、問答或重複內容。',
  '請依 sourceItems 的順序，把 referenceText 中能唯一對應的內容分配回原有 ID；不得新增、刪除、合併或重排 ID。',
  'leftAnchor 與 rightAnchor 只供定位，絕對不得複製到 sourceItems。',
  'replace 只在正式講記能唯一支持該 ID 的完整最小修正版時使用；保留原有口語與句界，不做文風潤飾。',
  '如果正式講記省略口語、句界有兩種合理分法、或任何字不能唯一判定，使用 uncertain。',
  '原句已正確或正式講記不能證明需要修改時使用 unchanged。',
  ...(mode === 'audio-adjudication' ? [
    '本輪 sourceItems 另含 audioAsrText；它是同一時間附近的 Whisper 長片段，只能證明近似讀音，不能單獨決定漢字或句界。',
    '綜合原句、正式講記與 audioAsrText，只修正能由至少兩項證據唯一支持的訛字；音訊範圍中的相鄰句絕對不可搬入本句。',
  ] : []),
  '只輸出 JSON：{"clusters":[{"clusterId":"...","items":[{"id":"...","decision":"unchanged|replace|uncertain","proposedText":"僅 replace 時存在","code":"40字內"}]}]}。',
  'clusterId、ID 與數量必須完全一致，不要解釋。',
].join('\n');

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function parseJsonObject(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error('provider returned no JSON object');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < cleaned.length; index += 1) {
    const character = cleaned[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(cleaned.slice(start, index + 1));
    }
  }
  throw new Error('provider returned an incomplete JSON object');
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, filePath);
}

function normalizeProviderResponse(clusters, response) {
  const sourceById = new Map(clusters.flatMap((cluster) => (
    cluster.sourceItems.map((item) => [item.id, item.text])
  )));
  return {
    ...response,
    clusters: Array.isArray(response?.clusters) ? response.clusters.map((cluster) => ({
      ...cluster,
      items: Array.isArray(cluster?.items) ? cluster.items.map((item) => {
        const decisionAliases = {
          unchanged: 'unchanged', keep: 'unchanged', approve: 'unchanged', no_change: 'unchanged',
          replace: 'replace', correct: 'replace',
          uncertain: 'uncertain', 'audio-required': 'uncertain', review: 'uncertain', review_required: 'uncertain',
        };
        let decision = decisionAliases[item?.decision] || 'uncertain';
        const sameAsSource = decision === 'replace'
          && item.proposedText === sourceById.get(item.id);
        if (sameAsSource) decision = 'unchanged';
        if (decision === 'replace' && (typeof item.proposedText !== 'string' || !item.proposedText.trim())) {
          decision = 'uncertain';
        }
        return {
          id: item?.id,
          decision,
          ...(decision === 'replace'
            ? { proposedText: item.proposedText } : {}),
          code: typeof item?.code === 'string' && item.code.trim()
            ? item.code.slice(0, 40) : '模型格式不合契約，保留覆核',
        };
      }) : cluster?.items,
    })) : response?.clusters,
  };
}

const sourceRaw = readFileSync(sourcePath);
const alignmentRaw = readFileSync(alignmentPath);
const alignment = JSON.parse(alignmentRaw);
const sourceDigest = digest(sourceRaw);
const alignmentDigest = digest(alignmentRaw);
const promptDigest = digest(system);
if (sourceDigest !== alignment.sourceFileDigest) throw new Error('reference alignment source digest mismatch');
if (!Array.isArray(alignment.riskClusters) || alignment.riskClusters.length === 0) {
  throw new Error('reference alignment has no risk clusters');
}

let runtimeFingerprint = null;
if (provider === 'qwen') {
  const modelsUrl = new URL('/v1/models', endpoint);
  const modelsResponse = await fetch(modelsUrl, { signal: AbortSignal.timeout(15000) });
  if (!modelsResponse.ok) throw new Error(`qwen models HTTP ${modelsResponse.status}`);
  runtimeFingerprint = computeRuntimeFingerprint(await modelsResponse.json(), requestedModel);
}
let selectedClusters = alignment.riskClusters;
let selection = { policy: 'all-reference-risk-clusters' };
if (provider === 'minimax') {
  const qwenPath = path.resolve(ROOT, args.get('--qwen-evidence')
    || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.reference-risk-qwen.json');
  const qwenRaw = readFileSync(qwenPath);
  const qwen = JSON.parse(qwenRaw);
  if (qwen.status !== 'complete' || qwen.sourceDigest !== sourceDigest
    || qwen.alignmentDigest !== alignmentDigest || qwen.completedItemCount !== qwen.itemCount) {
    throw new Error('MiniMax selection requires complete matching Qwen evidence');
  }
  const uncertainIds = new Set(qwen.decisions
    .filter((item) => item.decision === 'uncertain').map((item) => item.id));
  const uncertainClusters = new Set(alignment.riskClusters
    .filter((cluster) => cluster.sourceItems.some((item) => uncertainIds.has(item.id)))
    .map((cluster) => cluster.clusterId));
  const resolvedClusters = alignment.riskClusters.filter((cluster) => !uncertainClusters.has(cluster.clusterId));
  const auditClusters = new Set(resolvedClusters
    .filter((_, index) => index % 10 === 0).map((cluster) => cluster.clusterId));
  selectedClusters = alignment.riskClusters.filter((cluster) => (
    uncertainClusters.has(cluster.clusterId) || auditClusters.has(cluster.clusterId)
  ));
  selection = {
    policy: 'all-qwen-uncertain-clusters-plus-every-10th-resolved-cluster',
    qwenEvidenceDigest: digest(qwenRaw),
    qwenUncertainItemCount: uncertainIds.size,
    uncertainClusterCount: uncertainClusters.size,
    auditClusterCount: auditClusters.size,
  };
} else if (mode === 'audio-adjudication') {
  const qwenPath = path.resolve(ROOT, args.get('--qwen-evidence')
    || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.reference-risk-qwen.json');
  const audioPath = path.resolve(ROOT, args.get('--audio')
    || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.full-context-asr-all.json');
  const qwenRaw = readFileSync(qwenPath);
  const audioRaw = readFileSync(audioPath);
  const qwen = JSON.parse(qwenRaw);
  const audio = JSON.parse(audioRaw);
  if (qwen.status !== 'complete' || qwen.sourceDigest !== sourceDigest
    || qwen.alignmentDigest !== alignmentDigest || qwen.completedItemCount !== qwen.itemCount) {
    throw new Error('audio adjudication requires complete matching Qwen evidence');
  }
  if (audio.schema !== 'transcript-proofreading-full-context-asr-all/v1'
    || audio.sourceFileDigest !== sourceDigest || audio.itemCount !== audio.items?.length) {
    throw new Error('audio adjudication requires complete matching ASR alignment');
  }
  const audioById = new Map(audio.items.map((item) => [item.id, item]));
  const uncertainIds = new Set(qwen.decisions
    .filter((item) => item.decision === 'uncertain').map((item) => item.id));
  selectedClusters = alignment.riskClusters
    .filter((cluster) => cluster.sourceItems.some((item) => uncertainIds.has(item.id)))
    .map((cluster) => ({
      ...cluster,
      sourceItems: cluster.sourceItems.map((item) => {
        const audioItem = audioById.get(item.id);
        if (!audioItem || audioItem.sourceText !== item.text) {
          throw new Error(`audio alignment mismatch for ${item.id}`);
        }
        return { ...item, audioAsrText: audioItem.asrText, audioSegmentIds: audioItem.segmentIds };
      }),
    }));
  selection = {
    policy: 'all-qwen-uncertain-clusters-with-full-context-asr',
    qwenEvidenceDigest: digest(qwenRaw),
    audioEvidenceDigest: digest(audioRaw),
    audioSha256: audio.audioSha256,
    qwenUncertainItemCount: uncertainIds.size,
  };
}
const runBinding = {
  sourceDigest, alignmentDigest, promptDigest, requestedModel, runtimeFingerprint, batchSize,
  ...(provider === 'minimax' || mode === 'audio-adjudication' ? { mode, selection } : {}),
};
const runBindingDigest = digest(JSON.stringify(runBinding));
let decisions = [];
let rawResponseDigests = [];
let attempts = [];
let actualModel = null;

try {
  const saved = JSON.parse(readFileSync(outputPath, 'utf8'));
  if (saved.runBindingDigest !== runBindingDigest) throw new Error('saved risk repair binding mismatch');
  if (!Array.isArray(saved.decisions) || !Array.isArray(saved.rawResponseDigests)
    || !Array.isArray(saved.attempts)) throw new Error('saved risk repair checkpoint is malformed');
  decisions = saved.decisions;
  rawResponseDigests = saved.rawResponseDigests;
  attempts = saved.attempts;
  actualModel = saved.model?.actualModel || null;
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const expectedItemIds = selectedClusters.flatMap((cluster) => cluster.sourceItems.map((item) => item.id));
const completedIds = new Set(decisions.map((item) => item.id));
if (completedIds.size !== decisions.length
  || decisions.some((item, index) => item.id !== expectedItemIds[index])) {
  throw new Error('saved risk repair checkpoint decision order mismatch');
}
const completedClusterCount = selectedClusters.findIndex((cluster) => (
  cluster.sourceItems.some((item) => !completedIds.has(item.id))
));
const startCluster = completedClusterCount < 0 ? selectedClusters.length : completedClusterCount;

function buildArtifact(status) {
  return {
    schema: 'transcript-reference-risk-repair/v1',
    authority: 'advisory',
    status,
    sourceDigest,
    alignmentDigest,
    referenceUrl: alignment.referenceUrl,
    referencePdfDigest: alignment.referencePdfDigest,
    referenceTextDigest: alignment.referenceTextDigest,
    clusterCount: selectedClusters.length,
    itemCount: expectedItemIds.length,
    completedItemCount: decisions.length,
    runBindingDigest,
    model: {
      provider: provider === 'qwen' ? 'gx10-qwen' : 'minimax-m3',
      requestedModel, actualModel, runtimeFingerprint,
      attested: Boolean(actualModel && actualModel === requestedModel && runtimeFingerprint),
    },
    promptDigest,
    rawResponseDigests,
    attempts,
    generatedAt: new Date().toISOString(),
    transport: provider === 'qwen' ? 'ssh-tunnel://private-gx10' : 'mmx://external-minimax',
    authorization: provider === 'qwen'
      ? { scope: 'private-gx10-user-authorized-2026-10-15' }
      : { scope: externalDataAuthorization },
    selection,
    decisions,
  };
}

async function call(clusters) {
  if (provider === 'minimax') {
    const stdout = execFileSync('mmx', [
      'text', 'chat', '--model', requestedModel, '--system', system,
      '--message', `user:${JSON.stringify({ clusters })}`,
      '--max-tokens', '3200', '--temperature', '0.1',
      '--non-interactive', '--quiet', '--output', 'json',
    ], { encoding: 'utf8', timeout: 180000, maxBuffer: 8_000_000 });
    const rawDigest = digest(stdout);
    rawResponseDigests.push(rawDigest);
    return { response: parseJsonObject(stdout), rawDigest };
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: requestedModel,
      messages: [{ role: 'system', content: system }, {
        role: 'user', content: JSON.stringify({ clusters }),
      }],
      temperature: 0,
      max_tokens: 3200,
      response_format: { type: 'json_object' },
      chat_template_kwargs: { enable_thinking: false, reasoning_effort: 'low' },
    }),
    signal: AbortSignal.timeout(180000),
  });
  const rawText = await response.text();
  if (!response.ok) throw new Error(`qwen HTTP ${response.status}: ${rawText.slice(0, 300)}`);
  const raw = JSON.parse(rawText);
  if (raw.model) {
    if (actualModel && actualModel !== raw.model) throw new Error('provider changed actual model between batches');
    actualModel = raw.model;
  }
  const rawDigest = digest(rawText);
  rawResponseDigests.push(rawDigest);
  return { response: parseJsonObject(raw.choices?.[0]?.message?.content || ''), rawDigest };
}

for (let offset = startCluster; offset < selectedClusters.length; offset += batchSize) {
  const batch = selectedClusters.slice(offset, offset + batchSize);
  decisions.push(...await executeCoverageBoundBatch({
    items: batch,
    attempts,
    call,
    bind: (clusters, result) => bindReferenceRiskRepairs({
      clusters,
      response: normalizeProviderResponse(clusters, result.response),
      sourceDigest,
      alignmentDigest,
    }).decisions,
    onSplit: ({ inputCount, left, right, error }) => {
      process.stderr.write(`[${provider}-reference-risk] split ${inputCount} -> ${left}+${right}: ${error.message}\n`);
    },
  }));
  writeJsonAtomic(outputPath, buildArtifact('in-progress'));
  process.stderr.write(`[${provider}-reference-risk] ${Math.min(offset + batch.length, selectedClusters.length)}/${selectedClusters.length} clusters; ${decisions.length}/${expectedItemIds.length} items\n`);
}

if (provider === 'qwen' && (!actualModel || actualModel !== requestedModel)) {
  throw new Error('Qwen actual model attestation failed');
}
if (decisions.length !== expectedItemIds.length) throw new Error('risk repair final item coverage mismatch');
writeJsonAtomic(outputPath, buildArtifact('complete'));
console.log(JSON.stringify({
  outputPath,
  clusterCount: selectedClusters.length,
  itemCount: decisions.length,
  decisions: Object.fromEntries(['replace', 'unchanged', 'uncertain'].map((name) => [
    name, decisions.filter((item) => item.decision === name).length,
  ])),
  model: buildArtifact('complete').model,
}, null, 2));
