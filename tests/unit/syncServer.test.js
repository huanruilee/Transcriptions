import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_PORT = 19091;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

test('⚡ Local Sync & Active Learning Server Test Suite', async (t) => {
  // Isolate database in temporary directory
  const tempDir = mkdtempSync(resolve(tmpdir(), 'sync-server-test-'));
  const tempDbPath = resolve(tempDir, 'learned_corrections.json');
  writeFileSync(tempDbPath, JSON.stringify({
    _metadata: { course: '入中論善顯密意疏', version: '3.0' },
    global_terms: {},
    context_rules: []
  }, null, 2));

  // Spawn server process
  const serverProcess = spawn('python3', [
    'scripts/sync_server.py',
    '--port', String(TEST_PORT),
    '--host', '127.0.0.1'
  ], {
    env: {
      ...process.env,
      LEARNED_CORRECTIONS_PATH: tempDbPath
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Wait for server to boot
  let isReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/status`);
      if (res.ok) {
        isReady = true;
        break;
      }
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  assert.ok(isReady, `Sync Server failed to start on port ${TEST_PORT}`);

  // Test 1: GET /api/status
  await t.test('1. Health check & status endpoint returns 200 with CORS', async () => {
    const res = await fetch(`${BASE_URL}/api/status`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');

    const data = await res.json();
    assert.equal(data.status, 'online');
    assert.equal(data.version, '2.0');
    assert.equal(data.totalGlobalTerms, 0);
  });

  // Test 2: OPTIONS preflight request
  await t.test('2. OPTIONS preflight returns 204 with CORS methods', async () => {
    const res = await fetch(`${BASE_URL}/api/learn`, {
      method: 'OPTIONS'
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));
  });

  // Test 3: POST /api/learn for single sentence edit
  await t.test('3. Single sentence learn endpoint promotes domain term', async () => {
    const payload = {
      sessionId: '31B',
      sentenceId: 'sent-10.5',
      originalText: '此時明眼識應當生起',
      correctedText: '此時名言識應當生起',
      pageRef: 'p.101',
      note: '名言識（tha-snyad shes-pa）',
      applyToDisk: false
    };

    const res = await fetch(`${BASE_URL}/api/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.success, true);
    assert.equal(result.learning.decision, 'GLOBAL_PROMOTED');
    assert.equal(result.learning.phonetic_pair.corrected, '名言');

    // Verify written to temp DB
    const db = JSON.parse(readFileSync(tempDbPath, 'utf-8'));
    assert.ok(db.global_terms['明眼']);
    assert.equal(db.global_terms['明眼'].corrected, '名言');
  });

  // Test 4: POST /api/sync-batch for 1-Click batch synchronization
  await t.test('4. Batch sync endpoint processes multiple human corrections', async () => {
    const batchPayload = {
      events: [
        {
          sessionId: '31B',
          sentenceId: 'sent-12.0',
          originalText: '因此破除事事師的妄計。',
          proposedText: '因此破除實事師的妄計。',
          pageRef: 'p.97',
          applyToDisk: false
        },
        {
          sessionId: '95B',
          sentenceId: 'sent-20.0',
          originalText: '菩薩從初地進趣二地。',
          proposedText: '菩薩從初地進趣二諦。',
          pageRef: 'p.23',
          applyToDisk: false
        }
      ]
    };

    const res = await fetch(`${BASE_URL}/api/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchPayload)
    });

    assert.equal(res.status, 200);
    const batchResult = await res.json();
    assert.equal(batchResult.success, true);
    assert.equal(batchResult.totalEvents, 2);
    assert.equal(batchResult.promotedCount, 1, '事事師 -> 實事師 should be promoted');
    assert.equal(batchResult.contextSpecificCount, 1, '二地 -> 二諦 should be context-specific');

    // Verify temp DB updated
    const db = JSON.parse(readFileSync(tempDbPath, 'utf-8'));
    assert.ok(db.global_terms['事事師']);
    assert.equal(db.global_terms['事事師'].corrected, '實事師');
    assert.equal(db.context_rules.length, 1);
  });

  // Cleanup: shutdown server
  try {
    await fetch(`${BASE_URL}/api/shutdown`, { method: 'POST' });
  } catch {}
  serverProcess.kill('SIGTERM');
});
