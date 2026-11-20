#!/usr/bin/env node
/**
 * Lightweight zero-dependency stdio MCP wrapper for GX10 Hermes Agent HTTP endpoints (8660-8671).
 * Exposes `gx10_profiles_list` and `gx10_agent_ask` over JSON-RPC 2.0 stdio.
 */
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { askGx10Agent, listGx10Profiles } from '../lib/gx10AgentClient.mjs';

const SERVER_INFO = {
  name: 'gx10-agents',
  version: '1.0.0',
};

const TOOLS = [
  {
    name: 'gx10_profiles_list',
    description: 'List all configured GX10 Hermes Agent profiles, ports, and roles (never exposes API keys).',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'gx10_agent_ask',
    description: 'Send a prompt directly to a GX10 Hermes Agent profile (e.g. xiaofa, xiaojian, ajia, default) via HTTP /v1/chat/completions.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string', description: 'Target profile name, e.g. xiaofa, xiaojian, ajia, default' },
        prompt: { type: 'string', description: 'Task instruction or message for the target agent' },
        system: { type: 'string', description: 'Optional system instruction' },
        timeoutMs: { type: 'integer', description: 'Optional request timeout in milliseconds (default 120000)' },
      },
      required: ['profile', 'prompt'],
      additionalProperties: false,
    },
  },
];

export async function handleMcpMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const { id, method, params } = msg;

  // Notifications have no id and expect no response
  if (id === undefined || id === null) {
    return null;
  }

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      };
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};
      if (toolName === 'gx10_profiles_list') {
        const profiles = listGx10Profiles();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ count: profiles.length, profiles }, null, 2) }],
          },
        };
      }
      if (toolName === 'gx10_agent_ask') {
        const reply = await askGx10Agent({
          profile: args.profile,
          prompt: args.prompt,
          system: args.system || '',
          timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : 120000,
        });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(reply, null, 2) }],
          },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        isError: true,
        content: [{ type: 'text', text: err.message }],
      },
    };
  }
}

function startStdioServer() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }
    const resp = await handleMcpMessage(msg);
    if (resp) {
      process.stdout.write(`${JSON.stringify(resp)}\n`);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startStdioServer();
}
