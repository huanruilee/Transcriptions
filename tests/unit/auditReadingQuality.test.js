import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  auditSession,
  auditBaseTextNfkc,
  auditCourseDir,
} from '../../scripts/audit_reading_quality.mjs';

function makeHealthySession() {
  return {
    sessionId: 'session_01',
    paragraphs: [
      {
        id: 'p-1',
        heading: '1. 調整學法的動機',
        start: 0,
        end: 60,
        sentences: [
          { id: 'seg-0001', start: 0, end: 15, text: '我們在學習佛法之前，應該先調整自己的動機。', rawText: '呃，我們在學習佛法之前，應該先調整自己的動機' },
          { id: 'seg-0002', start: 15, end: 30, text: '動機純正，所聞思的法才能成為解脫的正因。', rawText: '動機純正所聞思的法才能成為解脫的正因' },
          { id: 'seg-0003', start: 30, end: 45, text: '因此尊者一再強調，初學者要從二諦與四諦下手。', rawText: '因此尊者一再強調初學者要從二地與四地下手' },
          { id: 'seg-0004', start: 45, end: 60, text: '這是我們修學佛法最核心的基礎。', rawText: '這是我們修學佛法最核心的基礎' },
        ],
      },
    ],
    _meta: {
      correctionsPending: 0,
      hallucinationSuspects: 0,
    },
    contentOverview: {
      status: 'ai-reviewed',
      discussionTopics: [
        { text: '為何學法前必須先調整動機？', evidence: [] },
        { text: '二諦與四諦在初學階段扮演什麼角色？', evidence: [] },
        { text: '如何檢視自己的聞思是否成為解脫正因？', evidence: [] },
      ],
    },
  };
}

test('passes a healthy session that satisfies v1.7 reading quality gates', () => {
  const result = auditSession(makeHealthySession());
  assert.equal(result.ok, true, JSON.stringify(result.violations));
  assert.equal(result.violations.length, 0);
  assert.equal(result.metrics.totalSentences, 4);
  assert.equal(result.metrics.missingEndPunctRatio, 0);
  assert.equal(result.metrics.shortFragmentRatio, 0);
});

test('fails when missing end punctuation ratio exceeds 5%', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences[0].text = '我們在學習佛法之前應該先調整動機';
  const result = auditSession(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'MISSING_END_PUNCTUATION'));
});

test('fails when pure filler-only or empty sentences remain', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences.push({ id: 'seg-0005', start: 60, end: 61, text: '是。', rawText: '是' });
  s.paragraphs[0].sentences.push({ id: 'seg-0006', start: 61, end: 62, text: '   ', rawText: '呃' });
  const result = auditSession(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'FILLER_ONLY_SENTENCES'));
  assert.ok(result.violations.some((v) => v.code === 'EMPTY_SENTENCES'));
});

test('fails when isolated 1-3 char short fragments exceed 2%', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences.push({ id: 'seg-0005', start: 60, end: 61, text: '第一點', rawText: '第一點' });
  const result = auditSession(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'SHORT_FRAGMENT_RATIO'));
});

test('fails when a single paragraph exceeds maxParagraphSentences', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences = Array.from({ length: 40 }, (_, i) => ({
    id: `seg-${String(i + 1).padStart(4, '0')}`,
    start: i * 5,
    end: (i + 1) * 5,
    text: `這是第 ${i + 1} 句完整的法義說明。`,
    rawText: `這是第 ${i + 1} 句完整的法義說明`,
  }));
  const result = auditSession(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'PARAGRAPH_TOO_LONG'));
});

test('fails when correctionsPending or hallucinationSuspects are non-zero without adjudication', () => {
  const s = makeHealthySession();
  s._meta.correctionsPending = 3;
  s._meta.hallucinationSuspects = 1;
  const result = auditSession(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'CORRECTIONS_PENDING'));
  assert.ok(result.violations.some((v) => v.code === 'HALLUCINATION_SUSPECTS'));
});

test('fails when discussionTopics count is outside 3..7 or missing full-width question mark', () => {
  const s = makeHealthySession();
  s.contentOverview.discussionTopics = [
    { text: '學佛者應先釐清自己的學習目標。', evidence: [] },
  ];
  const result = auditSession(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'DISCUSSION_TOPICS_COUNT'));
  assert.ok(result.violations.some((v) => v.code === 'DISCUSSION_TOPICS_QUESTION_MARK'));
});

test('detects non-NFKC Kangxi/CJK compatibility characters in base text', () => {
  const bad = auditBaseTextNfkc('1.教㈻藍圖㆗的課程介紹');
  assert.equal(bad.ok, false);
  assert.ok(bad.nonNfkcCount >= 2);

  const good = auditBaseTextNfkc('1.教學藍圖中的課程介紹');
  assert.equal(good.ok, true);
  assert.equal(good.nonNfkcCount, 0);
});

test('auditCourseDir scans sessions/ and source_text/ inside a course directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-rq-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'sessions'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'source_text'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'sessions', 'session_01.json'),
      JSON.stringify(makeHealthySession(), null, 2),
      'utf8',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'source_text', 'lecture_01.txt'),
      '1.教㈻藍圖㆗的課程介紹\n',
      'utf8',
    );

    const report = auditCourseDir(tmpDir);
    assert.equal(report.ok, false);
    assert.equal(report.sessions.length, 1);
    assert.equal(report.sessions[0].ok, true);
    assert.equal(report.sourceTexts.length, 1);
    assert.equal(report.sourceTexts[0].ok, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
