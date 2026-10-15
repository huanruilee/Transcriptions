#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateReviewerVerdicts } from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const provider = args.get('--provider');
const fixturePath = path.resolve(args.get('--fixture') || path.join(
  ROOT, 'tests/fixtures/transcript-proofreading/multimodel-eval.json',
));
if (!['qwen', 'minimax', 'eneural'].includes(provider)) {
  throw new Error('use --provider=qwen|minimax|eneural');
}
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const payload = fixture.items.map(({ expected, ...item }) => item);
const system = [
  '你是保守的繁體中文佛法逐字稿候選分類器。',
  'accept 只限本句與相鄰文字能唯一證明的錯字、已知名相或純標點。',
  '若需要音訊、原典、譯名政策，或有其他合理答案，一律 uncertain。',
  '整詞重建、修改後仍不可理解、僅因佛學語意看似合理者 reject。',
  '只輸出 JSON：{"items":[{"id":"...","verdict":"accept|reject|uncertain","code":"12字內"}]}。',
  'ID 與數量必須完全一致，不要解釋。',
].join('\n');
const user = JSON.stringify({ items: payload }, null, 0);

function extractJson(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('provider returned no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function openAiCall(endpoint, model, apiKey = '', local = false) {
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0,
    max_tokens: 1024,
  };
  if (local) {
    body.response_format = { type: 'json_object' };
    body.chat_template_kwargs = { enable_thinking: false, reasoning_effort: 'low' };
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Transcriptions-reviewer-eval/1.0',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const rawText = await response.text();
  if (!response.ok) throw new Error(`${provider} HTTP ${response.status}: ${rawText.slice(0, 300)}`);
  const raw = JSON.parse(rawText);
  return {
    verdicts: extractJson(raw.choices?.[0]?.message?.content || ''),
    provenance: {
      endpoint,
      requestedModel: model,
      actualModel: raw.model || null,
      responseId: raw.id || null,
      created: raw.created || null,
      rawResponseDigest: `sha256:${createHash('sha256').update(rawText).digest('hex')}`,
      runtimeFingerprint: null,
      runtimeObserved: false,
    },
  };
}

function remoteEneuralCall(endpoint, model, body) {
  const remoteCode = String.raw`
import json, os, pathlib, sys, urllib.request
for line in pathlib.Path.home().joinpath('.config/eneural.env').read_text().splitlines():
    if line.strip() and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
payload = json.load(sys.stdin)
request = urllib.request.Request(payload['endpoint'], data=json.dumps(payload['body'], ensure_ascii=False).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['ENEURAL_API_KEY'],'User-Agent':'Transcriptions-reviewer-eval/1.0'})
with urllib.request.urlopen(request, timeout=120) as response:
    sys.stdout.buffer.write(response.read())
`;
  const encoded = Buffer.from(remoteCode).toString('base64');
  const command = `python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`;
  return execFileSync('ssh', [process.env.ENEURAL_SSH_HOST, command], {
    input: JSON.stringify({ endpoint, body }), encoding: 'utf8', timeout: 150000, maxBuffer: 4_000_000,
  });
}

let result;
let provenance;
if (provider === 'qwen') {
  const endpoint = process.env.QWEN_ENDPOINT || 'http://127.0.0.1:18001/v1/chat/completions';
  const call = await openAiCall(endpoint, process.env.QWEN_MODEL || 'Qwen3.8-27B', '', true);
  result = call.verdicts;
  provenance = call.provenance;
  const modelsUrl = new URL('/v1/models', endpoint);
  const modelsResponse = await fetch(modelsUrl, { signal: AbortSignal.timeout(15000) });
  if (!modelsResponse.ok) throw new Error(`qwen models HTTP ${modelsResponse.status}`);
  const modelsText = await modelsResponse.text();
  provenance.runtimeFingerprint = `sha256:${createHash('sha256').update(modelsText).digest('hex')}`;
  provenance.runtimeObserved = true;
} else if (provider === 'minimax') {
  const requestedModel = process.env.MINIMAX_MODEL || 'MiniMax-M3';
  const stdout = execFileSync('mmx', [
    'text', 'chat', '--model', requestedModel,
    '--system', system, '--message', `user:${user}`, '--max-tokens', '1024',
    '--temperature', '0.1', '--non-interactive', '--quiet', '--output', 'json',
  ], { encoding: 'utf8', timeout: 120000, maxBuffer: 2_000_000 });
  result = extractJson(stdout);
  provenance = {
    endpoint: 'mmx://text/chat',
    requestedModel,
    actualModel: null,
    responseId: null,
    created: null,
    rawResponseDigest: `sha256:${createHash('sha256').update(stdout).digest('hex')}`,
    runtimeFingerprint: null,
    runtimeObserved: false,
  };
} else {
  const endpoint = process.env.ENEURAL_ENDPOINT || 'https://agents.eneural.ai/v1/chat/completions';
  const model = process.env.ENEURAL_MODEL || 'deepseek-v4.1-flash';
  if (process.env.ENEURAL_SSH_HOST) {
    const rawText = remoteEneuralCall(endpoint, model, {
      model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0, max_tokens: 1024,
    });
    const raw = JSON.parse(rawText);
    result = extractJson(raw.choices?.[0]?.message?.content || '');
    provenance = {
      endpoint, requestedModel: model, actualModel: raw.model || null, responseId: raw.id || null,
      created: raw.created || null,
      rawResponseDigest: `sha256:${createHash('sha256').update(rawText).digest('hex')}`,
      runtimeFingerprint: null, runtimeObserved: false, transport: `ssh://${process.env.ENEURAL_SSH_HOST}`,
    };
  } else {
    if (!process.env.ENEURAL_API_KEY) throw new Error('ENEURAL_API_KEY or ENEURAL_SSH_HOST is required');
    const call = await openAiCall(endpoint, model, process.env.ENEURAL_API_KEY, false);
    result = call.verdicts;
    provenance = call.provenance;
  }
}

const evaluation = evaluateReviewerVerdicts(fixture.items, result);
const report = {
  schema: 'transcript-proofreading-reviewer-eval-result/v1',
  provider,
  model: provider === 'qwen' ? (process.env.QWEN_MODEL || 'Qwen3.8-27B')
    : provider === 'minimax' ? (process.env.MINIMAX_MODEL || 'MiniMax-M3')
      : (process.env.ENEURAL_MODEL || 'deepseek-v4.1-flash'),
  fixtureDigest: `sha256:${createHash('sha256').update(JSON.stringify(fixture)).digest('hex')}`,
  promptDigest: `sha256:${createHash('sha256').update(`${system}\n${user}`).digest('hex')}`,
  executedAt: new Date().toISOString(),
  provenance,
  passed: evaluation.passed,
  metrics: evaluation.metrics,
  items: evaluation.items,
};
const reportText = `${JSON.stringify(report, null, 2)}\n`;
console.log(reportText.trimEnd());
const writePath = args.get('--write');
if (writePath) {
  const resolved = path.resolve(ROOT, writePath);
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error('--write must stay inside repository');
  writeFileSync(resolved, reportText);
}
if (!evaluation.passed) process.exitCode = 1;
