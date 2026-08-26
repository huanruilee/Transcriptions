// tests/acceptance/annotationWorkflow.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  saveCorrection,
  getCorrection,
  saveNote,
  getNote,
  exportNotesAsMarkdown,
  computeSentenceDiff
} from '../../src/js/annotation.js';
import {
  verifyAdminPasskey,
  calculateAudioSliceRange,
  applyReviewPatchToSession
} from '../../src/js/review.js';

test('🌟 End-to-End Annotation, Proofreading & Review Acceptance Suite', async (t) => {

  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <button id="mode-toggle-btn" class="mode-toggle-btn">🎧 聆聽模式</button>
    <button id="export-notes-btn" class="export-notes-btn">📥 匯出筆記</button>
    <div id="transcript-container"></div>
    <div id="active-session-title"></div>
  </body></html>`, { url: 'http://localhost' });

  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;

  const sessionId = '29A';

  await t.test('1. Workflow: User proofreads a homophone mistake and saves to local storage', () => {
    const originalText = '因此破除事事師的妄計。';
    const correctedText = '因此破除實事師的妄計。';

    saveCorrection(sessionId, 'sent-14', {
      originalText,
      correctedText,
      start: 83.2,
      end: 87.5
    });

    const savedCorr = getCorrection(sessionId, 'sent-14');
    assert.equal(savedCorr.correctedText, '因此破除實事師的妄計。');
    assert.equal(savedCorr.originalText, '因此破除事事師的妄計。');
  });

  await t.test('2. Workflow: User adds a study note with treatise page tag', () => {
    saveNote(sessionId, 'sent-14', {
      content: '此處破自續派實事師所立之名言有自相。',
      pageRef: 'p.97',
      tag: '中觀正理'
    });

    const savedNote = getNote(sessionId, 'sent-14');
    assert.equal(savedNote.pageRef, 'p.97');
    assert.equal(savedNote.tag, '中觀正理');
    assert.match(savedNote.content, /名言有自相/);
  });

  await t.test('3. Workflow: Generates full Markdown export with notes & corrections', () => {
    const mockSession = {
      sessionId: '29A',
      title: '第 29A 堂 (上節) | 2017-01-14 | p.97',
      paragraphs: [
        {
          id: 'p-1',
          heading: '【科判】卯二、破執',
          sentences: [
            { id: 'sent-14', start: 83.2, end: 87.5, text: '因此破除事事師的妄計。' }
          ]
        }
      ]
    };

    const md = exportNotesAsMarkdown(sessionId, mockSession);
    assert.ok(md.includes('第 29A 堂'), 'should include session id');
    assert.ok(md.includes('【科判】卯二、破執'), 'should include treatise outline');
    assert.ok(md.includes('✏️ **【校對修正】**：`因此破除實事師的妄計。`'), 'should include correction');
    assert.ok(md.includes('📌 **【研讀筆記 (中觀正理 ｜ p.97)】**'), 'should include note tag');
  });

  await t.test('4. Workflow: Admin unlocks Review Console with Passkey and verifies 3s audio interval', () => {
    assert.equal(verifyAdminPasskey('geshe2026'), true, 'passkey must unlock');
    assert.equal(verifyAdminPasskey('wrong'), false, 'invalid passkey rejected');

    const slice = calculateAudioSliceRange(83.2, 87.5);
    assert.equal(slice.start, 81.7);
    assert.equal(slice.end, 89.0);
  });

  await t.test('5. Workflow: Admin applies approved correction to session JSON', () => {
    const mockSession = {
      sessionId: '29A',
      paragraphs: [
        {
          id: 'p-1',
          sentences: [
            { id: 'sent-14', start: 83.2, end: 87.5, text: '因此破除事事師的妄計。' }
          ]
        }
      ]
    };

    const updated = applyReviewPatchToSession(mockSession, {
      sessionId: '29A',
      sentenceId: 'sent-14',
      correctedText: '因此破除實事師的妄計。'
    });

    assert.equal(updated.paragraphs[0].sentences[0].text, '因此破除實事師的妄計。');
  });
});
