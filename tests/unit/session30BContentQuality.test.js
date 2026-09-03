import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SESSION_PATH = '../../courses/入中論善顯密意疏/sessions/session_30B.json';
const REFERENCE_PATHS = [
  '../../courses/入中論善顯密意疏/sessions/session_29A.json',
  '../../courses/入中論善顯密意疏/sessions/session_31A.json'
];

function load(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

function sentences(session) {
  return session.paragraphs.flatMap((paragraph) => paragraph.sentences || []);
}

function substantive(sentence) {
  return sentence.text.trim().length >= 4;
}

function punctuationRate(session) {
  const rows = sentences(session).filter(substantive);
  return rows.filter((sentence) => /[。！？；：，、]$/.test(sentence.text.trim())).length / rows.length;
}

const fragmentTexts = new Set(['嗯', '是', '對', '可是', '或者是', '這個', '有沒有']);

test('30B published text has the punctuation quality of neighboring sessions', () => {
  const session = load(SESSION_PATH);
  const referenceRates = REFERENCE_PATHS.map((path) => punctuationRate(load(path)));
  const targetRate = punctuationRate(session);
  const referenceFloor = Math.min(...referenceRates) - 0.05;

  assert.ok(
    targetRate >= referenceFloor,
    `30B punctuation rate ${targetRate.toFixed(3)} is below neighboring-session floor ${referenceFloor.toFixed(3)}`
  );
});

test('30B published text is divided into readable paragraphs', () => {
  const session = load(SESSION_PATH);
  const rows = session.paragraphs.map((paragraph) => paragraph.sentences?.length || 0);
  const referenceParagraphCount = Math.min(...REFERENCE_PATHS.map((path) => load(path).paragraphs.length));

  assert.ok(
    session.paragraphs.length >= referenceParagraphCount * 0.75,
    `30B has ${session.paragraphs.length} paragraphs; expected at least 75% of neighboring-session minimum ${referenceParagraphCount}`
  );
  assert.ok(Math.max(...rows) <= 12, `30B has an oversized paragraph with ${Math.max(...rows)} sentences`);
});

test('30B published text does not punctuate standalone filler fragments', () => {
  const session = load(SESSION_PATH);
  const paddedFragments = sentences(session).filter((sentence) => {
    const text = sentence.text.trim();
    return text.endsWith('。') && fragmentTexts.has(text.slice(0, -1));
  });

  assert.deepEqual(
    paddedFragments,
    [],
    `standalone filler fragments must not receive mechanical periods: ${paddedFragments
      .map((sentence) => sentence.text)
      .join(', ')}`
  );
});

test('30B published text does not expose known unresolved ASR artifacts', () => {
  const session = load(SESSION_PATH);
  const text = sentences(session).map((sentence) => sentence.text).join('\n');
  for (const artifact of [
    '民語何世俗',
    '錢為地',
    '何錢不地',
    '三類葡萄萄羅',
    '寬頻一生',
    '世俗錢',
    '世俗地',
    '藏幣',
    '不地的',
    '言而逼之生意',
    '影像古生'
  ]) {
    if (text.includes(artifact)) {
      assert.notEqual(session._meta?.status, 'PUBLISHED',
        `unresolved artifact must not appear in a PUBLISHED 30B session: ${artifact}`);
      assert.ok(
        session._meta?.candidateEvidence?.unresolved?.some((item) => item.text?.includes(artifact)),
        `unresolved artifact must have an explicit evidence ledger entry: ${artifact}`
      );
    }
  }
});

test('30B preserves source-grounded high-confidence terminology corrections', () => {
  const session = load(SESSION_PATH);
  const bySegment = new Map(sentences(session).map((sentence) => [sentence.sourceSegmentId, sentence.text]));
  const expected = new Map([
    [17, '三類補特伽羅見不見'],
    [64, '世俗諦的這些法'],
    [75, '明叫做世俗諦'],
    [96, '人人說為世俗諦'],
    [654, '就是初地菩薩二地菩薩到七地']
  ]);

  for (const [segmentId, text] of expected) {
    assert.equal(bySegment.get(segmentId)?.replace(/[。！？；：，、]$/, ''), text,
      `source segment ${segmentId} must use the source-grounded correction`);
  }
});

test('30B records the first-pass adjudication for the final uncertain passage', () => {
  const session = load(SESSION_PATH);
  const sentence = sentences(session).find((item) => item.sourceSegmentId === 868);
  const ledger = session._meta?.candidateEvidence?.applied?.find((item) => item.sourceSegmentId === 868);

  assert.equal(sentence?.text, '他的名言識之諦實的意思。');
  assert.equal(sentence?.rawText, '他的言而逼之生意');
  assert.equal(ledger?.confidence, 'LIKELY');
  assert.match(ledger?.evidence || '', /page_101\.txt/);
});

test('30B published metadata cannot claim acceptance while semantic review is incomplete', () => {
  const session = load(SESSION_PATH);
  const text = sentences(session).map((sentence) => sentence.text).join('\n');
  const unresolved = ['民語何世俗', '寬頻一生', '藏幣', '不地的', '言而逼之生意'];

  if (unresolved.some((artifact) => text.includes(artifact))) {
    assert.notEqual(session._meta?.status, 'PUBLISHED',
      'unresolved semantic artifacts must keep the session out of PUBLISHED status');
  }
});

test('30B evidence ledger does not mark one source segment both applied and unresolved', () => {
  const session = load(SESSION_PATH);
  const applied = new Set((session._meta?.candidateEvidence?.applied || []).map((item) => item.sourceSegmentId));
  const unresolved = (session._meta?.candidateEvidence?.unresolved || []).map((item) => item.sourceSegmentId);
  const overlap = unresolved.filter((segmentId) => applied.has(segmentId));

  assert.deepEqual(overlap, [], `evidence ledger has applied/unresolved overlap: ${overlap.join(', ')}`);
});

test('30B includes semantic headings for the source chapter outline', () => {
  const session = load(SESSION_PATH);
  const headings = session.paragraphs.filter((paragraph) => typeof paragraph.heading === 'string' && paragraph.heading.trim());
  assert.ok(headings.length >= 8, `30B must expose at least 8 source-grounded headings, found ${headings.length}`);
});

test('editorial punctuation gate rejects blanket punctuation padding', () => {
  const candidate = [
    { text: '嗯，' },
    { text: '接下去' },
    { text: '這是核心義理。' },
    { text: '對不對。' }
  ];
  const substantive = candidate.filter((sentence) => sentence.text.trim().length >= 4);
  const padded = substantive.filter((sentence) => sentence.text.trim().endsWith('。'));

  assert.ok(
    padded.length === substantive.length,
    `fixture should represent blanket padding: ${padded.length}/${substantive.length}`
  );
});

test('editorial terminology gate rejects blind 世俗 homophone substitution', () => {
  const candidate = [
    '明於何世俗前為諦何前不諦',
    '就是變成世民世俗諦為和世俗前安利為地之世俗'
  ];
  assert.equal(
    candidate.some((text) => /世俗.*(錢|地)/.test(text)),
    true,
    'fixture should expose blind 錢/地 replacement near 世俗 for rejection'
  );
});
