#!/usr/bin/env node
/**
 * Shared eNeural (glm53-flash) IPv4 SSE streaming client with file cache and worker pool.
 * Bypasses `hermes chat` CLI state.db lock and IPv6 connection stalls under concurrency.
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const DEFAULT_ENEURAL_ENV_PATH = '/Users/henry/.hermes/.env';

export function loadEneuralApiKey(envPath = DEFAULT_ENEURAL_ENV_PATH) {
  if (process.env.ENEURAL_API_KEY) return process.env.ENEURAL_API_KEY.trim();
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ENEURAL_API_KEY and ${envPath}`);
  }
  const envText = fs.readFileSync(envPath, 'utf8');
  const match = envText.match(/^ENEURAL_API_KEY=(.+)$/m);
  if (!match) throw new Error(`ENEURAL_API_KEY not found in ${envPath}`);
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

export function extractJsonObject(raw) {
  const cleaned = String(raw || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error(`No JSON object found in model output: ${cleaned.slice(0, 160)}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function callEneuralSse(
  messages,
  {
    apiKey = loadEneuralApiKey(),
    model = 'glm53-flash',
    maxTokens = 2400,
    temperature = 0.1,
    timeoutMs = 90000,
    jsonMode = true,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const bodyObj = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      reasoning_effort: 'none',
    };
    if (jsonMode) {
      bodyObj.response_format = { type: 'json_object' };
    }
    const payload = JSON.stringify(bodyObj);

    const req = https.request(
      {
        hostname: 'agents.eneural.ai',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        family: 4,
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'OpenAI/Python 1.50.0',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let errBody = '';
          res.on('data', (c) => { errBody += c.toString('utf8'); });
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errBody.slice(0, 300)}`)));
          return;
        }
        let buf = '';
        let out = '';
        res.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (typeof delta === 'string') out += delta;
            } catch {
              // ignore partial SSE chunk
            }
          }
        });
        res.on('end', () => resolve(out.trim()));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Request timeout (${timeoutMs}ms)`)));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export async function callEneuralWithRetry(messages, options = {}, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await callEneuralSse(messages, options);
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, 1000 * i));
      }
    }
  }
  throw lastErr;
}

export async function cachedJsonCall(cachePath, fn) {
  if (cachePath && fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  const result = await fn();
  if (cachePath) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  return result;
}

export async function runPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
