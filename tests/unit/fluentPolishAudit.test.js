import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPolishProposals,
  generateFluentPolishProposals,
  parsePolishChangesJson,
  validatePolishProposal,
} from '../../scripts/lib/fluentPolishAudit.js';
import {
  mergeParagraphsByLayout,
  renderReadableMarkdown,
} from '../../scripts/lib/paragraphLayoutPlanner.js';

test('generateFluentPolishProposals attaches reAsrHints, blocks cross-sentence moves and omitted content words, and applies safe proposals', async () => {
  const session = {
    sessionId: '25',
    title: '第 25 講 | 空三摩地',
    paragraphs: [
      {
        id: 'p_2',
        heading: null,
        start: 82.16,
        end: 100.64,
        sentences: [
          { id: 'sent-11', start: 82.16, end: 82.68, text: '那，' },
          { id: 'sent-12', start: 84.14, end: 85.94, text: '要怎麼辦？要怎麼做？' },
          { id: 'sent-13', start: 86.16, end: 93.5, text: '其實所有的準備呢，都是為了去衝這一波，那一波，波羅蜜多。' },
          { id: 'sent-23', start: 140.0, end: 145.0, text: '然後剛好，最近，見岸師父是不是也講三三昧，對不對？' },
        ],
      },
    ],
  };

  const auditReport = {
    reAsrResults: [
      {
        sentenceIds: ['sent-13'],
        rawText: '其實所有的準備呢都是為了去衝這一波那一波波羅伯多',
        guidedText: '其實所有的準備都是為了去衝這一波、那一波，般若波羅蜜多。',
        recoveredTerms: ['般若波羅蜜多'],
        expectedTerms: ['般若波羅蜜多'],
      },
    ],
  };

  let capturedPayload = null;
  const mockFetch = async (_url, opts) => {
    capturedPayload = JSON.parse(opts.body);
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                changes: [
                  {
                    sentenceId: 'sent-11',
                    proposedText: '要怎麼辦？',
                    categories: ['punctuation'],
                    reason: '跨句搬字測試',
                  },
                  {
                    sentenceId: 'sent-13',
                    proposedText: '其實所有的準備，都是為了去衝這一波、那一波──般若波羅蜜多。',
                    categories: ['missing-term', 'oral-filler', 'punctuation'],
                    reason: '補齊般若並精簡呢字',
                  },
                  {
                    sentenceId: 'sent-23',
                    proposedText: '然後，最近見岸師父是不是也講三三昧，對不對？',
                    categories: ['oral-filler'],
                    reason: '誤刪剛好',
                  },
                ],
              }),
            },
          },
        ],
      }),
    };
  };

  const { proposals, blockedByGuard } = await generateFluentPolishProposals({
    session,
    auditReport,
    fetchImpl: mockFetch,
  });

  const userMsg = JSON.parse(capturedPayload.messages[1].content);
  assert.equal(userMsg.paragraphs[0].sentences[2].reAsrHint.guidedText, '其實所有的準備都是為了去衝這一波、那一波，般若波羅蜜多。');
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].sentenceId, 'sent-13');
  assert.equal(blockedByGuard.length, 2);
  assert.match(blockedByGuard[0].guardReason, /^cross-sentence-move:/);
  assert.equal(blockedByGuard[1].guardReason, 'content-word-omitted:剛好');

  const updated = applyPolishProposals(session, proposals);
  assert.equal(updated.paragraphs[0].sentences[2].text, '其實所有的準備，都是為了去衝這一波、那一波──般若波羅蜜多。');
  assert.equal(updated.paragraphs[0].sentences[2].start, 86.16);
  assert.equal(updated._meta.fluentPolishedCount, 1);
});

test('mergeParagraphsByLayout merges short fragments into natural paragraphs while preserving all timestamps', () => {
  const session = {
    sessionId: '25',
    title: '第 25 講 | 空三摩地',
    pageRange: 'p.121-123',
    paragraphs: [
      {
        id: 'p_1',
        heading: '1. 開場',
        start: 0,
        end: 10,
        sentences: [
          { id: 'sent-1', start: 0, end: 5, text: '第一句話比較短，這裡先做一個說明。' },
        ],
      },
      {
        id: 'p_2',
        heading: null,
        start: 5,
        end: 15,
        sentences: [
          { id: 'sent-2', start: 5, end: 15, text: '第二句話接續前面的脈絡繼續展開說明，直到這裡完整結束。' },
        ],
      },
    ],
  };

  const merged = mergeParagraphsByLayout(session, { minChars: 40, maxChars: 200 });
  assert.equal(merged.paragraphs.length, 1);
  assert.equal(merged.paragraphs[0].heading, '1. 開場');
  assert.deepEqual(merged.paragraphs[0].sentences.map((s) => s.id), ['sent-1', 'sent-2']);

  const md = renderReadableMarkdown(merged);
  assert.match(md, /^# 第 25 講 \| 空三摩地/m);
  assert.match(md, /^## 1\. 開場/m);
});

test('validatePolishProposal and parsePolishChangesJson handle edge cases', () => {
  assert.deepEqual(parsePolishChangesJson('invalid'), { changes: [] });
  assert.equal(
    validatePolishProposal({ originalText: '因為這樣', proposedText: '這樣' }).guardReason,
    'content-word-omitted:因為',
  );
});
