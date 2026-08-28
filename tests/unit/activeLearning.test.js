import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('🧠 Active Learning & Contextual Disambiguation Engine Test Suite', async (t) => {

  const annotationModule = await import('../../src/js/annotation.js');
  const { exportCorrectionEventsJson, saveCorrection, getAllCorrections } = annotationModule;

  await t.test('1. Frontend Event Serialization Contract (exportCorrectionEventsJson)', () => {
    // Mock local storage
    const mockStorage = {};
    global.localStorage = {
      getItem: (k) => mockStorage[k] || null,
      setItem: (k, v) => { mockStorage[k] = String(v); },
      removeItem: (k) => { delete mockStorage[k]; }
    };

    saveCorrection('29A', 'sent-12.5', {
      originalText: '因此破除事事師的妄計。',
      correctedText: '因此破除實事師的妄計。',
      start: 12.5,
      end: 16.8
    });

    const sessionData = {
      sessionId: '29A',
      title: '第 29A 堂',
      pageRange: 'p.97',
      paragraphs: [{
        sentences: [{ id: 'sent-12.5', start: 12.5, end: 16.8, text: '因此破除事事師的妄計。' }]
      }]
    };

    const events = exportCorrectionEventsJson('29A', sessionData);
    assert.ok(Array.isArray(events), 'Events must be an array');
    assert.equal(events.length, 1, 'Should serialize 1 correction event');
    assert.equal(events[0].sessionId, '29A');
    assert.equal(events[0].originalText, '因此破除事事師的妄計。');
    assert.equal(events[0].proposedText, '因此破除實事師的妄計。');
    assert.equal(events[0].pageRef, 'p.97');
    assert.ok(events[0].timestamp, 'Must include timestamp');
  });

  await t.test('2. 3-Tier Disambiguation: Global Promotion for Unambiguous Term', () => {
    const py = spawnSync('python3', [
      'scripts/active_learning_manager.py',
      '--eval',
      '--session', '29A',
      '--original', '因此破除事事師的妄計。',
      '--proposed', '因此破除實事師的妄計。',
      '--page', 'p.97'
    ], { encoding: 'utf-8' });

    assert.equal(py.status, 0, `Python script exited with error: ${py.stderr}`);
    const res = JSON.parse(py.stdout);
    assert.equal(res.decision, 'GLOBAL_PROMOTED', '事事師 -> 實事師 must be classified as GLOBAL_PROMOTED');
    assert.ok(res.confidence >= 0.95, 'Confidence must be >= 0.95');
    assert.equal(res.phonetic_pair.corrected, '實事師');
  });

  await t.test('3. 3-Tier Disambiguation: Homophone Isolation (CONTEXT_SPECIFIC for 二地)', () => {
    const py = spawnSync('python3', [
      'scripts/active_learning_manager.py',
      '--eval',
      '--session', '95B',
      '--original', '菩薩從初地進趣二地。',
      '--proposed', '菩薩從初地進趣二諦。', // Intentional wrong user edit
      '--page', 'p.23'
    ], { encoding: 'utf-8' });

    assert.equal(py.status, 0, `Python script exited with error: ${py.stderr}`);
    const res = JSON.parse(py.stdout);
    assert.equal(res.decision, 'CONTEXT_SPECIFIC', 'Homophone ambiguity must be isolated as CONTEXT_SPECIFIC to protect other sessions');
  });

  await t.test('4. Dry-Run Full-Repository Scan Execution', () => {
    const py = spawnSync('python3', [
      'scripts/active_learning_manager.py',
      '--sync-all',
      '--dry-run'
    ], { encoding: 'utf-8' });

    assert.equal(py.status, 0, `Dry-run failed: ${py.stderr}`);
    assert.ok(py.stdout.includes('Active Learning Retrospective Global Sync ([DRY-RUN] )'), 'Must print dry-run header');
  });
});
