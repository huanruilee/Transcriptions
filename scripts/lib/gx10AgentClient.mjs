#!/usr/bin/env node
/**
 * Reusable HTTP client & CLI for dispatching tasks to GX10 Hermes Agent profiles (ports 8660-8671).
 * Reads credentials strictly from ~/.hermes_gx10.env (or process.env) and never logs or exposes keys.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_GX10_ENV_PATH = path.join(os.homedir(), '.hermes_gx10.env');

export const GX10_PROFILES = Object.freeze({
  default: { envKey: 'DEFAULT', defaultPort: 8660, role: '預設主端點（含 Gateway MCP 橋接與一般對話）' },
  ajia: { envKey: 'AJIA', defaultPort: 8661, role: '阿架／小架專用端點' },
  guxia: { envKey: 'GUXIA', defaultPort: 8662, role: '股蝦專用端點' },
  linehenry: { envKey: 'LINEHENRY', defaultPort: 8663, role: 'Line Henry 通訊對接端點' },
  xiaofa: { envKey: 'XIAOFA', defaultPort: 8664, role: '小法（佛典轉寫、逐字稿校對與網頁內容專責）' },
  xiaoguanjia: { envKey: 'XIAOGUANJIA', defaultPort: 8665, role: '小管家（日常管理與事務協調）' },
  xiaojian: { envKey: 'XIAOJIAN', defaultPort: 8666, role: '小檢（系統盤點、狀態回報與健康檢查）' },
  xiaojiaolian: { envKey: 'XIAOJIAOLIAN', defaultPort: 8667, role: '小教練（指導與訓練輔助）' },
  xiaolu: { envKey: 'XIAOLU', defaultPort: 8668, role: '小錄專用端點' },
  xiaomin: { envKey: 'XIAOMIN', defaultPort: 8669, role: '小敏專用端點' },
  xiaoyan: { envKey: 'XIAOYAN', defaultPort: 8670, role: '小驗／小言專用端點' },
  xiaoying: { envKey: 'XIAOYING', defaultPort: 8671, role: '小影專用端點' },
});

export function parseEnvText(content) {
  const vars = {};
  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

export function loadGx10Env(envPath = DEFAULT_GX10_ENV_PATH) {
  const fileVars = fs.existsSync(envPath) ? parseEnvText(fs.readFileSync(envPath, 'utf8')) : {};
  return { ...fileVars, ...process.env };
}

export function resolveGx10Profile(profile, env = loadGx10Env()) {
  const name = String(profile || '').trim().toLowerCase();
  const spec = GX10_PROFILES[name];
  if (!spec) {
    throw new Error(`Unknown GX10 profile "${profile}". Available: ${Object.keys(GX10_PROFILES).join(', ')}`);
  }
  const host = (env.HERMES_HOST || '100.113.144.100').trim();
  const portRaw = env[`HERMES_PORT_${spec.envKey}`] || String(spec.defaultPort);
  const port = Number(portRaw);
  const apiKey = (env[`HERMES_KEY_${spec.envKey}`] || '').trim();
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid port "${portRaw}" for GX10 profile "${name}"`);
  }
  if (!apiKey) {
    throw new Error(`Missing HERMES_KEY_${spec.envKey} in environment or ~/.hermes_gx10.env`);
  }
  return { profile: name, host, port, apiKey, role: spec.role };
}

export function listGx10Profiles(env = loadGx10Env()) {
  const host = (env.HERMES_HOST || '100.113.144.100').trim();
  return Object.entries(GX10_PROFILES).map(([name, spec]) => ({
    profile: name,
    host,
    port: Number(env[`HERMES_PORT_${spec.envKey}`] || spec.defaultPort),
    configured: Boolean((env[`HERMES_KEY_${spec.envKey}`] || '').trim()),
    role: spec.role,
  }));
}

export function askGx10Agent({
  profile,
  prompt,
  system = '',
  model = 'hermes-agent',
  timeoutMs = 120000,
  envPath = DEFAULT_GX10_ENV_PATH,
}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt must be a non-empty string');
  }
  const env = loadGx10Env(envPath);
  const target = resolveGx10Profile(profile, env);

  const messages = [];
  if (system && system.trim()) {
    messages.push({ role: 'system', content: system.trim() });
  }
  messages.push({ role: 'user', content: prompt });

  const payload = JSON.stringify({ model, messages });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: target.host,
        port: target.port,
        path: '/v1/chat/completions',
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${target.apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString('utf8'); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`GX10 ${target.profile} (${target.port}) HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            const parsed = JSON.parse(body);
            const content = parsed.choices?.[0]?.message?.content ?? '';
            resolve({
              profile: target.profile,
              port: target.port,
              model: parsed.model || model,
              content,
              usage: parsed.usage || null,
            });
          } catch (err) {
            reject(new Error(`Invalid JSON from GX10 ${target.profile}: ${err.message}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`GX10 ${target.profile} request timeout (${timeoutMs}ms)`)));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    console.log(JSON.stringify(listGx10Profiles(), null, 2));
    return;
  }
  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : '';
  };
  const profile = getArg('--profile');
  const prompt = getArg('--prompt');
  const system = getArg('--system');
  if (!profile || !prompt) {
    console.error('Usage: gx10AgentClient.mjs --list | --profile <name> --prompt <text> [--system <text>]');
    process.exit(1);
  }
  const res = await askGx10Agent({ profile, prompt, system });
  console.log(JSON.stringify(res, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
