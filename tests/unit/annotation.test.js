// tests/unit/annotation.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveCorrection,
  getCorrection,
  getAllCorrections,
  removeCorrection,
  saveNote,
  getNote,
  getAllNotes,
  removeNote,
  exportNotesAsMarkdown,
  computeSentenceDiff
} from '../../src/js/annotation.js';

// Mock localStorage for Node environment
class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.localStorage = new MockStorage();

test('Annotation & Proofreading Store Unit Tests', async (t) => {
  global.localStorage.clear();

  const sessionId = '29A';
  const sentId = 'sent-14';

  await t.test('1. Correction CRUD: saves and retrieves a sentence correction', () => {
    const originalSentence = {
      id: sentId,
      start: 83.2,
      end: 87.5,
      text: '因此破除事事師的妄計。'
    };

    saveCorrection(sessionId, sentId, {
      originalText: originalSentence.text,
      correctedText: '因此破除實事師的妄計。',
      start: originalSentence.start,
      end: originalSentence.end,
      timestamp: Date.now()
    });

    const saved = getCorrection(sessionId, sentId);
    assert.ok(saved, 'correction should exist in storage');
    assert.equal(saved.correctedText, '因此破除實事師的妄計。');
    assert.equal(saved.start, 83.2, 'start timestamp must remain preserved');
    assert.equal(saved.end, 87.5, 'end timestamp must remain preserved');

    const all = getAllCorrections(sessionId);
    assert.equal(Object.keys(all).length, 1);
  });

  await t.test('2. Diff Computation: calculates correct textual differences', () => {
    const original = '因此破除事事師的妄計。';
    const corrected = '因此破除實事師的妄計。';
    const diff = computeSentenceDiff(original, corrected);

    assert.ok(diff.includes('<del class="diff-del">事</del>'), 'diff should highlight deleted text');
    assert.ok(diff.includes('<ins class="diff-ins">實</ins>'), 'diff should highlight inserted text');
  });

  await t.test('3. Notes CRUD: saves, retrieves, and deletes study notes', () => {
    saveNote(sessionId, sentId, {
      content: '此段格西深入辨析應成派與自續派對於名言有自相之根本分野。',
      pageRef: 'p.97',
      tag: '中觀正理',
      updatedAt: Date.now()
    });

    const note = getNote(sessionId, sentId);
    assert.ok(note, 'note should exist');
    assert.match(note.content, /根本分野/);
    assert.equal(note.pageRef, 'p.97');
    assert.equal(note.tag, '中觀正理');

    const allNotes = getAllNotes(sessionId);
    assert.equal(Object.keys(allNotes).length, 1);

    removeNote(sessionId, sentId);
    assert.equal(getNote(sessionId, sentId), null, 'note should be deleted');
  });

  await t.test('4. Markdown Export: formats session transcript with integrated notes & corrections', () => {
    // Add mock note back
    saveNote(sessionId, sentId, {
      content: '破實事師執著。',
      pageRef: 'p.97',
      tag: '破執'
    });

    const mockSession = {
      sessionId: '29A',
      title: '第 29A 堂 (上節) | 2017-01-14 | p.97',
      paragraphs: [
        {
          id: 'p-1',
          heading: '【科判導讀】二諦建立與破實事師',
          sentences: [
            { id: 'sent-14', start: 83.2, end: 87.5, text: '因此破除事事師的妄計。' }
          ]
        }
      ]
    };

    const md = exportNotesAsMarkdown(sessionId, mockSession);
    assert.ok(md.includes('# 《入中論善顯密意疏》研讀筆記與校對紀錄 — 第 29A 堂'), 'should have proper markdown header');
    assert.ok(md.includes('### 【科判導讀】二諦建立與破實事師'), 'should include heading');
    assert.ok(md.includes('📌 **【研讀筆記 (破執 ｜ p.97)】**：破實事師執著。'), 'should include embedded note block');
    assert.ok(md.includes('✏️ **【校對修正】**：`因此破除實事師的妄計。`'), 'should include corrected text');
  });

  await t.test('5. Deletion: cleans up corrections properly', () => {
    removeCorrection(sessionId, sentId);
    assert.equal(getCorrection(sessionId, sentId), null, 'correction should be removed');
  });
});
