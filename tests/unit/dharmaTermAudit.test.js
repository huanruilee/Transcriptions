import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditSessionDharmaTerms,
  buildReAsrWindows,
} from '../../scripts/lib/dharmaTermAudit.js';
import {
  auditSessionWithLlm,
  mergeAuditFindings,
  parseLlmSuspectsJson,
} from '../../scripts/lib/llmOmissionAudit.js';

test('detects missing 般若 prefix before 波羅蜜多 in six-paramitas context and merges adjacent windows', () => {
  const session = {
    sessionId: '25',
    title: '第 25 講 | 空三摩地',
    paragraphs: [
      {
        id: 'p_2',
        heading: '【科判導讀】空三摩地',
        sentences: [
          { id: 'sent-12', start: 84.14, end: 85.94, text: '要怎麼辦？要怎麼做？' },
          { id: 'sent-13', start: 86.16, end: 93.5, text: '其實所有的準備呢，都是為了去衝這一波，那一波，波羅蜜多。' },
          { id: 'sent-14', start: 94.1, end: 100.64, text: '所以呢，在這個六度的最後一個，也就是波羅蜜多這裡呢，' },
          { id: 'sent-15', start: 100.96, end: 107.76, text: '我們之前呢，也是有詳細的講過前述的內容。' },
        ],
      },
    ],
  };

  const findings = auditSessionDharmaTerms(session);
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((f) => f.sentenceId), ['sent-13', 'sent-14']);
  assert.equal(findings[0].findings[0].ruleId, 'missing-paramita-prefix');
  assert.equal(findings[1].findings[0].suggestedTerm, '般若波羅蜜多');

  const windows = buildReAsrWindows(findings, { paddingSeconds: 2, mergeGapSeconds: 4 });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].clipStart, 84.16);
  assert.equal(windows[0].clipEnd, 102.64);
  assert.deepEqual(windows[0].sentenceIds, ['sent-13', 'sent-14']);
  assert.match(windows[0].prompt, /般若波羅蜜多/);
});

test('does not flag complete paramita terms such as 布施波羅蜜多 or 般若波羅蜜多', () => {
  const session = {
    sessionId: '25',
    title: '第 25 講 | 空三摩地',
    paragraphs: [
      {
        id: 'p_1',
        heading: null,
        sentences: [
          { id: 'sent-1', start: 0, end: 5, text: '前面講了布施波羅蜜多與持戒波羅蜜多，最後是般若波羅蜜多。' },
        ],
      },
    ],
  };

  const findings = auditSessionDharmaTerms(session);
  assert.equal(findings.length, 0);
});

test('auditSessionWithLlm detects non-rule-table omissions, ignores unknown IDs, and merges with rule findings', async () => {
  const session = {
    sessionId: '25',
    title: '第 25 講 | 空三摩地',
    paragraphs: [
      {
        id: 'p_2',
        heading: '【科判導讀】空三摩地',
        sentences: [
          { id: 'sent-13', start: 86.16, end: 93.5, text: '其實所有的準備呢，都是為了去衝這一波，那一波，波羅蜜多。' },
          { id: 'sent-20', start: 130.0, end: 135.0, text: '這個十二緣起的第一支就是行，由無明生。' },
        ],
      },
    ],
  };

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: '```json\n{"suspects":[{"sentenceId":"sent-20","reason":"十二緣起第一支應為無明而非行，疑似漏字","suspectedMissingTerm":"無明","promptHints":["十二緣起","無明緣行"]},{"sentenceId":"nonexistent-99","reason":"hallucinated"}]}\n```',
          },
        },
      ],
    }),
  });

  const ruleFindings = auditSessionDharmaTerms(session);
  const llmFindings = await auditSessionWithLlm({
    session,
    endpoint: 'http://127.0.0.1:18001/v1',
    fetchImpl: mockFetch,
  });

  assert.equal(llmFindings.length, 1);
  assert.equal(llmFindings[0].sentenceId, 'sent-20');
  assert.equal(llmFindings[0].findings[0].ruleId, 'llm-semantic-omission');

  const merged = mergeAuditFindings(ruleFindings, llmFindings);
  assert.deepEqual(merged.map((m) => m.sentenceId), ['sent-13', 'sent-20']);

  const windows = buildReAsrWindows(merged, { paddingSeconds: 2, mergeGapSeconds: 4 });
  assert.equal(windows.length, 2);
  assert.match(windows[1].prompt, /十二緣起/);
});

test('parseLlmSuspectsJson safely handles malformed responses', () => {
  assert.deepEqual(parseLlmSuspectsJson('not json at all'), { suspects: [] });
});
