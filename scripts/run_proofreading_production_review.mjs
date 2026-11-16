#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bindProductionReviewerVerdicts,
  buildCompactReviewPacket,
  buildProductionReviewProposals,
  buildProductionReviewerEvidence,
  computeRuntimeFingerprint,
  executeCoverageBoundBatch,
  listTranscriptSentences,
} from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const provider = args.get('--provider');
if (!['qwen', 'minimax', 'eneural', 'packet'].includes(provider)) {
  throw new Error('use --provider=qwen|minimax|eneural|packet');
}
const sourcePath = path.resolve(ROOT, args.get('--source') || 'courses/四念住/sessions/session_08.json');
const ledgerPath = path.resolve(ROOT, args.get('--ledger')
  || 'reviews/evidence/transcript_proofreading/pilot/四念住/session_08.ledger.json');
const outputDir = path.resolve(ROOT, args.get('--output-dir')
  || 'reviews/evidence/transcript_proofreading/production/四念住');
const stem = args.get('--stem') || 'session_08';
const batchSize = Number(args.get('--batch-size') || 20);
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 40) {
  throw new Error('--batch-size must be an integer from 1 to 40');
}
for (const resolved of [sourcePath, ledgerPath, outputDir]) {
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error('all paths must stay inside repository');
}

function digest(value) {
  return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
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

function buildContexts(source) {
  const sentences = listTranscriptSentences(source);
  return new Map(sentences.map((sentence, index) => [sentence.id, {
    previous: sentences[index - 1]?.text ?? null,
    current: sentence.text,
    next: sentences[index + 1]?.text ?? null,
    start: sentence.start ?? null,
    end: sentence.end ?? null,
  }]));
}

const system = [
  '你是保守的繁體中文佛法逐字稿候選分類器。',
  'accept 只限本句與相鄰文字能唯一證明的錯字、既定名相或純標點。',
  '只要需要音訊、原典、譯名政策，或存在另一個合理答案，一律 uncertain。',
  '整詞重建、跨句搬字、修改後仍不可理解、只因佛學語意看似合理者 reject。',
  '不得把課程主題本身當作聲學證據。',
  '只輸出 JSON：{"items":[{"id":"...","verdict":"accept|reject|uncertain","code":"12字內"}]}。',
  'ID 與數量必須完全一致，不要解釋。',
].join('\n');

async function openAiCall({ endpoint, model, apiKey = '', items, local = false }) {
  const body = {
    model,
    messages: [{ role: 'system', content: system }, {
      role: 'user', content: JSON.stringify({ items }),
    }],
    temperature: 0,
    max_tokens: 1400,
  };
  if (local) {
    body.response_format = { type: 'json_object' };
    body.chat_template_kwargs = { enable_thinking: false, reasoning_effort: 'low' };
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const rawText = await response.text();
  if (!response.ok) throw new Error(`${provider} HTTP ${response.status}: ${rawText.slice(0, 300)}`);
  const raw = JSON.parse(rawText);
  return {
    response: parseJsonObject(raw.choices?.[0]?.message?.content || ''),
    rawDigest: digest(rawText),
    actualModel: raw.model || null,
    responseId: raw.id || null,
    created: raw.created || null,
  };
}

function minimaxCall({ model, items }) {
  const user = JSON.stringify({ items });
  const stdout = execFileSync('mmx', [
    'text', 'chat', '--model', model, '--system', system, '--message', `user:${user}`,
    '--max-tokens', '1400', '--temperature', '0.1', '--non-interactive', '--quiet', '--output', 'json',
  ], { encoding: 'utf8', timeout: 180000, maxBuffer: 4_000_000 });
  return { response: parseJsonObject(stdout), rawDigest: digest(stdout), actualModel: null, responseId: null, created: null };
}

function remoteEneuralCall({ endpoint, model, items }) {
  const remoteCode = String.raw`
import json, os, pathlib, sys, urllib.request
for line in pathlib.Path.home().joinpath('.config/eneural.env').read_text().splitlines():
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
payload = json.load(sys.stdin)
request = urllib.request.Request(payload['endpoint'], data=json.dumps(payload['body'], ensure_ascii=False).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['ENEURAL_API_KEY'],'User-Agent':'Transcriptions-production-review/1.0'})
with urllib.request.urlopen(request, timeout=120) as response:
    sys.stdout.buffer.write(response.read())
`;
  const encoded = Buffer.from(remoteCode).toString('base64');
  const command = `python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`;
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ items }) }],
    temperature: 0,
    max_tokens: 1400,
  };
  const rawText = execFileSync('ssh', [process.env.ENEURAL_SSH_HOST, command], {
    input: JSON.stringify({ endpoint, body }), encoding: 'utf8', timeout: 150000, maxBuffer: 4_000_000,
  });
  const raw = JSON.parse(rawText);
  return {
    response: parseJsonObject(raw.choices?.[0]?.message?.content || ''),
    rawDigest: digest(rawText), actualModel: raw.model || null,
    responseId: raw.id || null, created: raw.created || null,
  };
}

async function runProvider(proposals) {
  const specs = {
    qwen: {
      providerId: 'gx10-qwen', requestedModel: process.env.QWEN_MODEL || 'Qwen3.8-27B',
      endpoint: process.env.QWEN_ENDPOINT || 'http://127.0.0.1:18001/v1/chat/completions',
    },
    minimax: { providerId: 'minimax-m3', requestedModel: process.env.MINIMAX_MODEL || 'MiniMax-M3' },
    eneural: {
      providerId: 'eneural-deepseek', requestedModel: process.env.ENEURAL_MODEL || 'deepseek-v4.1-flash',
      endpoint: process.env.ENEURAL_ENDPOINT || 'https://agents.eneural.ai/v1/chat/completions',
    },
  };
  const spec = specs[provider];
  if (provider === 'eneural' && !process.env.ENEURAL_API_KEY && !process.env.ENEURAL_SSH_HOST) {
    throw new Error('ENEURAL_API_KEY or ENEURAL_SSH_HOST is required');
  }
  let runtimeFingerprint = null;
  if (provider === 'qwen') {
    const modelsUrl = new URL('/v1/models', spec.endpoint);
    const response = await fetch(modelsUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`qwen models HTTP ${response.status}`);
    runtimeFingerprint = computeRuntimeFingerprint(await response.json(), spec.requestedModel);
  }
  const allVerdicts = [];
  const rawResponseDigests = [];
  const responseIds = [];
  const attempts = [];
  let actualModel = null;
  const callBatch = async (batch) => {
    const promptItems = batch.map(({ id, before, after, changeClass, reason, evidence, context }) => ({
      id, before, after, changeClass, reason, evidence, context,
    }));
    const call = provider === 'minimax'
      ? minimaxCall({ model: spec.requestedModel, items: promptItems })
      : provider === 'eneural' && process.env.ENEURAL_SSH_HOST
        ? remoteEneuralCall({ endpoint: spec.endpoint, model: spec.requestedModel, items: promptItems })
        : await openAiCall({
        endpoint: spec.endpoint, model: spec.requestedModel,
        apiKey: provider === 'eneural' ? process.env.ENEURAL_API_KEY : '',
        items: promptItems, local: provider === 'qwen',
      });
    if (call.actualModel) {
      if (actualModel && actualModel !== call.actualModel) throw new Error('provider changed actual model between batches');
      actualModel = call.actualModel;
    }
    rawResponseDigests.push(call.rawDigest);
    if (call.responseId) responseIds.push(call.responseId);
    return call;
  };
  for (let offset = 0; offset < proposals.length; offset += batchSize) {
    const batch = proposals.slice(offset, offset + batchSize);
    allVerdicts.push(...await executeCoverageBoundBatch({
      items: batch,
      attempts,
      call: callBatch,
      bind: (reviewItems, call) => bindProductionReviewerVerdicts({
        proposals: reviewItems,
        response: call.response,
        provider: spec.providerId,
        model: actualModel || spec.requestedModel,
        runtimeFingerprint,
      }),
      onSplit: ({ inputCount, left, right, error }) => {
        process.stderr.write(`[${provider}] split ${inputCount} -> ${left}+${right}: ${error.message}\n`);
      },
    }));
    process.stderr.write(`[${provider}] ${Math.min(offset + batch.length, proposals.length)}/${proposals.length}\n`);
  }
  return buildProductionReviewerEvidence({
    provider: spec.providerId,
    requestedModel: spec.requestedModel,
    actualModel,
    runtimeFingerprint,
    proposals,
    verdicts: allVerdicts,
    rawResponseDigests,
    provenance: { endpoint: spec.endpoint || 'mmx://text/chat', responseIds, attempts,
      executedAt: new Date().toISOString(),
      transport: provider === 'eneural' && process.env.ENEURAL_SSH_HOST ? `ssh://${process.env.ENEURAL_SSH_HOST}` : 'direct' },
  });
}

function buildPacket() {
  const names = { qwen: 'gx10-qwen', minimax: 'minimax-m3', eneural: 'eneural-deepseek' };
  const evidence = Object.fromEntries(Object.entries(names).flatMap(([short, id]) => {
    const file = path.join(outputDir, `${stem}.${short}.json`);
    return existsSync(file) ? [[id, JSON.parse(readFileSync(file, 'utf8'))]] : [];
  }));
  if (!evidence['gx10-qwen']) throw new Error('packet requires gx10-qwen evidence as proposal source');
  const proposalDigest = evidence['gx10-qwen'].proposalDigest;
  for (const item of Object.values(evidence)) {
    if (item.proposalDigest !== proposalDigest) throw new Error('provider proposal digest mismatch');
  }
  const proposals = evidence['gx10-qwen'].proposals;
  const votesById = new Map(proposals.map((item) => [item.id, []]));
  for (const item of Object.values(evidence)) {
    for (const verdict of item.verdicts) votesById.get(verdict.proposalId)?.push(verdict);
  }
  const defaults = {
    'gx10-qwen': 'Qwen3.8-27B', 'minimax-m3': 'MiniMax-M3', 'eneural-deepseek': 'deepseek-v4.1-flash',
  };
  const providerManifest = Object.fromEntries(Object.values(names).map((id) => {
    const item = evidence[id];
    return [id, {
      model: item?.actualModel || item?.requestedModel || defaults[id],
      runtimeFingerprint: item?.runtimeFingerprint || null,
      attested: item?.attested === true,
      status: item ? 'completed' : 'not-run',
    }];
  }));
  const packet = buildCompactReviewPacket({
    items: proposals.map((proposal) => ({ proposal, verdicts: votesById.get(proposal.id) || [] })),
    providerManifest,
  });
  return {
    ...packet,
    sourceDigest: proposals[0].sourceDigest,
    runId: proposals[0].runId,
    proposalDigest,
    providerManifest,
    generatedAt: new Date().toISOString(),
  };
}

if (provider === 'packet') {
  const packet = buildPacket();
  const outputPath = path.join(outputDir, `${stem}.compact-review.json`);
  writeJsonAtomic(outputPath, packet);
  console.log(JSON.stringify({ outputPath, summary: packet.summary, providerManifest: packet.providerManifest }, null, 2));
} else {
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  const proposals = buildProductionReviewProposals({ source, ledger, contextsById: buildContexts(source) });
  const evidence = await runProvider(proposals);
  const outputPath = path.join(outputDir, `${stem}.${provider}.json`);
  writeJsonAtomic(outputPath, evidence);
  console.log(JSON.stringify({ outputPath, provider: evidence.provider, proposalCount: evidence.proposalCount,
    verdictCount: evidence.verdictCount, authority: evidence.authority }, null, 2));
}
