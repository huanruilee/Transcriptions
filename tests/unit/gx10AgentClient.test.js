import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listGx10Profiles,
  parseEnvText,
  resolveGx10Profile,
} from '../../scripts/lib/gx10AgentClient.mjs';
import { handleMcpMessage } from '../../scripts/mcp/gx10_agents_mcp.mjs';

test('parseEnvText parses quoted and unquoted env pairs and ignores comments', () => {
  const parsed = parseEnvText(`
    # comment
    HERMES_HOST=100.113.144.100
    HERMES_PORT_XIAOFA=8664
    HERMES_KEY_XIAOFA="test-token-placeholder"
  `);
  assert.equal(parsed.HERMES_HOST, '100.113.144.100');
  assert.equal(parsed.HERMES_PORT_XIAOFA, '8664');
  assert.equal(parsed.HERMES_KEY_XIAOFA, 'test-token-placeholder');
});

test('resolveGx10Profile resolves port/key and rejects unknown or unconfigured profiles', () => {
  const mockEnv = {
    HERMES_HOST: '100.113.144.100',
    HERMES_PORT_XIAOFA: '8664',
    HERMES_KEY_XIAOFA: 'dummy-key',
  };
  const resolved = resolveGx10Profile('xiaofa', mockEnv);
  assert.equal(resolved.port, 8664);
  assert.equal(resolved.host, '100.113.144.100');
  assert.equal(resolved.apiKey, 'dummy-key');

  assert.throws(() => resolveGx10Profile('unknown_bot', mockEnv), /Unknown GX10 profile/);
  assert.throws(() => resolveGx10Profile('xiaojian', mockEnv), /Missing HERMES_KEY_XIAOJIAN/);
});

test('listGx10Profiles returns all 12 profiles without exposing secret keys', () => {
  const list = listGx10Profiles({ HERMES_KEY_DEFAULT: 'secret-value' });
  assert.equal(list.length, 12);
  const serialized = JSON.stringify(list);
  assert.equal(serialized.includes('secret-value'), false);
});

test('MCP wrapper handles initialize and tools/list cleanly', async () => {
  const initResp = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(initResp.result.serverInfo.name, 'gx10-agents');

  const listResp = await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = listResp.result.tools.map((t) => t.name);
  assert.deepEqual(names, ['gx10_profiles_list', 'gx10_agent_ask']);
});
