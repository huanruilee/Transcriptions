#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadMiniMaxConfiguration(env = process.env) {
  const configPath = env.MMX_CONFIG_PATH || path.join(os.homedir(), '.mmx', 'config.json');
  const config = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : {};
  const apiKey = config.api_key || env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('MiniMax API key is not configured');
  return {
    apiKey,
    baseUrl: String(config.base_url || 'https://api.minimax.cn').replace(/\/$/, ''),
    timeoutSeconds: Number(config.timeout || 300),
  };
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const { apiKey, baseUrl, timeoutSeconds } = loadMiniMaxConfiguration();

  const response = await fetch(`${baseUrl}/v1/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(Math.max(10_000, timeoutSeconds * 1000)),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`MiniMax HTTP ${response.status}: ${body?.error?.message || body?.base_resp?.status_msg || 'request failed'}`);
  }
  if (body.status !== 'completed' || !body.output_text) {
    const reason = body?.incomplete_details?.reason || body?.error?.message || body.status;
    throw new Error(`MiniMax response ${body.status}: ${reason}`);
  }
  process.stdout.write(JSON.stringify({
    outputText: body.output_text,
    model: body.model,
    status: body.status,
    usage: body.usage,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
