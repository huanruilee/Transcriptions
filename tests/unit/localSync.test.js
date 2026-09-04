import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SYNC_URL,
  checkSyncServerStatus,
  syncCorrectionToLocalBackend,
  syncBatchToLocalBackend,
  getPendingSuggestionsCount
} from '../../src/js/localSync.js';

test('⚡ Frontend Local Sync Module (localSync.js) Unit Tests', async (t) => {
  // Mock localStorage
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; }
  };

  await t.test('1. getPendingSuggestionsCount calculates items in localStorage', () => {
    localStorage.clear();
    assert.equal(getPendingSuggestionsCount(), 0);

    localStorage.setItem('learned_suggestions', JSON.stringify([
      { sessionId: '31B', originalText: '明眼識', correctedText: '名言識' },
      { sessionId: '31B', originalText: '地實', correctedText: '諦實' }
    ]));
    assert.equal(getPendingSuggestionsCount(), 2);
  });

  await t.test('2. checkSyncServerStatus handles offline port gracefully', async () => {
    // Port 49151 is unlikely to have a service listening
    const status = await checkSyncServerStatus('http://127.0.0.1:49151', 150);
    assert.equal(status.online, false);
    assert.ok(status.error);
  });

  await t.test('3. syncCorrectionToLocalBackend returns error when backend is offline', async () => {
    const result = await syncCorrectionToLocalBackend(
      { sessionId: '31B', originalText: 'test', correctedText: 'test2' },
      'http://127.0.0.1:49151'
    );
    assert.equal(result.success, false);
    assert.ok(result.error);
  });
});
