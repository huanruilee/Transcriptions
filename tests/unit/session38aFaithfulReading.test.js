import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { build38A, markdown38A, render38A, text38A } from '../../scripts/session38a_faithful_reading.mjs';

const sourceBytes = fs.readFileSync('courses/入中論善顯密意疏/sessions/session_38A.json');
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const plan = (extra = {}) => ({ sourceDigest: digest(sourceBytes), processedAt: '2026-10-23T09:00:00+08:00', corrections: [], pending: [], ...extra });
const buildFull = (extra = {}) => build38A(sourceBytes, plan(extra));

function fixture() {
  const source = {
    sessionId: '38A', title: 'fixture', audioUrl: 'https://buddha.flyday.com.tw/audio.mp3', lastUpdated: 'old',
    _meta: { keep: true }, contentOverview: { status: 'baseline' },
    paragraphs: [
      { id: 'p_1', heading: '題目', start: 1, end: 5, speaker: '講者A', custom: { keep: 7 }, sentences: [
        { id: 'source-1', start: 1, end: 2, text: '甲甲，嗯，我是說甲。', speaker: '講者A', confidence: 0.6 },
        { start: 3, end: 5, text: '乙 <script>alert(1)</script> [click](javascript:alert(1))', confidence: 0.7 },
      ] },
    ],
  };
  const bytes = Buffer.from(JSON.stringify(source));
  return { source, bytes, sourcePlan: (extra = {}) => ({ sourceDigest: digest(bytes), processedAt: '2026-10-23T09:00:00+08:00', corrections: [], pending: [], ...extra }) };
}

test('build preserves the full 38A source structure and only changes explicit locator text', () => {
  const { source, bytes, sourcePlan } = fixture();
  const result = build38A(bytes, sourcePlan({
    corrections: [{ locator: 'p_1:0', from: '甲甲，嗯，我是說甲。', to: '甲甲，嗯，我是說甲。？', count: 1, basis: 'source path/line 2, context' }],
    pending: [{ locator: 'p_1:1', reason: '句尾待配合原音確認' }],
    headingCorrections: [{ paragraphId: 'p_1', from: '題目', to: '題目修訂', basis: 'source path/heading line' }],
    overview: { status: 'reviewed overview' },
  }));
  assert.deepEqual(result.sourceSnapshot, source);
  assert.equal(Object.hasOwn(result.session, 'sourceSnapshot'), false);
  assert.equal(result.session.sessionId, '38A');
  assert.equal(result.session.paragraphs[0].id, 'p_1');
  assert.equal(result.session.paragraphs[0].sentences[0].text, '甲甲，嗯，我是說甲。？');
  assert.equal(result.session.paragraphs[0].sentences[0].rawText, '甲甲，嗯，我是說甲。');
  assert.equal(result.session.paragraphs[0].sentences[0].start, 1);
  assert.equal(result.session.paragraphs[0].sentences[0].confidence, 0.6);
  assert.equal(result.session.paragraphs[0].sentences[1].rawText, undefined);
  assert.equal(result.session.paragraphs[0].sentences[1].speaker, undefined);
  assert.equal(result.session.paragraphs[0].custom.keep, 7);
  assert.equal(result.session.paragraphs[0].heading, '題目修訂');
  assert.deepEqual(result.session.contentOverview, { status: 'reviewed overview' });
  assert.equal(result.session.transcriptPublicationState, 'review-ready');
  assert.equal(result.session.lastUpdated, '2026-10-23T09:00:00+08:00');
  assert.equal(result.session._meta.processed_at, '2026-10-23T09:00:00+08:00');
  assert.equal(result.session._meta.last_updated, '2026-10-23T09:00:00+08:00');
  assert.equal(result.session.qualityReview.humanAudioAcceptance, false);
  assert.match(result.session.qualityReview.readerNotice, /新 ASR 僅供輔助核對/);
  assert.deepEqual(result.session.qualityReview.pendingItems, [{ locator: 'p_1:1', reason: '句尾待配合原音確認' }]);
  assert.equal(result.session.paragraphs[0].sentences[1].reviewNeeded, true);
  assert.equal(result.session.paragraphs[0].sentences[1].uncertainty, '句尾待配合原音確認');
  assert.equal(result.verbatim.paragraphs.p_1.length, 2);
  assert.equal(result.verbatim.paragraphs.p_1[0].id, 'source-1');
  assert.equal(result.verbatim.paragraphs.p_1[0].sourceLocator, 'p_1:0');
  assert.equal(result.verbatim.paragraphs.p_1[0].text, '甲甲，嗯，我是說甲。？');
  assert.equal(result.verbatim.paragraphs.p_1[0].textcorrected, undefined);
  assert.equal(result.verbatim.paragraphs.p_1[1].id, 'p1-s2');
  assert.equal(result.verbatim.paragraphs.p_1[1].rawText, '乙 <script>alert(1)</script> [click](javascript:alert(1))');
  assert.equal(result.verbatim.humanListened, false);
  assert.equal(result.ledger.length, 2);
  assert.equal(result.ledger[0].sourceDigest, digest(bytes));
  assert.equal(result.ledger[0].humanListened, false);
  assert.equal(result.ledger[1].locator, 'p_1:heading');
});

test('full source output covers every source sentence in its original order', () => {
  const result = buildFull();
  const source = JSON.parse(sourceBytes.toString('utf8'));
  assert.equal(source.paragraphs.length, 329);
  assert.equal(result.verbatim.sessionId, '38A');
  assert.deepEqual(Object.keys(result.verbatim.paragraphs), source.paragraphs.map((paragraph) => paragraph.id));
  assert.equal(Object.values(result.verbatim.paragraphs).flat().length, 657);
  source.paragraphs.forEach((paragraph) => paragraph.sentences.forEach((sentence, index) => {
    const output = result.verbatim.paragraphs[paragraph.id][index];
    assert.equal(output.sourceLocator, `${paragraph.id}:${index}`);
    assert.equal(output.text, sentence.text);
    assert.equal(output.textcorrected, undefined);
    assert.deepEqual(output.start, sentence.start);
    assert.deepEqual(output.end, sentence.end);
  }));
});

test('metadata extraction may remove only a complete explicit review block and retains it in rawText', () => {
  const { bytes, sourcePlan } = fixture();
  const source = JSON.parse(bytes.toString());
  source.paragraphs[0].sentences[0].text = '甲 [REVIEW: model annotation]';
  const changedBytes = Buffer.from(JSON.stringify(source));
  const result = build38A(changedBytes, { ...sourcePlan(), sourceDigest: digest(changedBytes), corrections: [{ locator: 'p_1:0', from: '[REVIEW: model annotation]', to: '', count: 1, kind: 'metadata-extraction', basis: 'annotation is tool metadata, not speech; retain in rawText' }] });
  assert.equal(result.session.paragraphs[0].sentences[0].text, '甲 ');
  assert.equal(result.verbatim.paragraphs.p_1[0].text, '甲 ');
  assert.equal(result.verbatim.paragraphs.p_1[0].rawText, '甲 [REVIEW: model annotation]');
  assert.equal(result.ledger[0].kind, 'metadata-extraction');
});

test('rejects wrong session, stale digest, unknown or overlapping locators, count mismatch and invalid headings', () => {
  const { bytes, sourcePlan } = fixture();
  const wrong = JSON.parse(bytes.toString()); wrong.sessionId = '38B';
  assert.throws(() => build38A(Buffer.from(JSON.stringify(wrong)), { ...sourcePlan(), sourceDigest: digest(Buffer.from(JSON.stringify(wrong))) }), /expected sessionId 38A/);
  assert.throws(() => build38A(bytes, { ...sourcePlan(), sourceDigest: 'sha256:stale' }), /stale or mismatched/);
  assert.throws(() => build38A(bytes, sourcePlan({ corrections: [{ locator: 'p_9:0', from: '甲', to: '乙', count: 1, basis: 'context' }] })), /unknown locator/);
  assert.throws(() => build38A(bytes, sourcePlan({ corrections: [{ locator: 'p_1:0', from: '甲', to: '乙', count: 1, basis: 'context' }] })), /count mismatch/);
  assert.throws(() => build38A(bytes, sourcePlan({ corrections: [{ locator: 'p_1:0', from: '甲', to: 'A', count: 2, basis: 'context' }] })), /count mismatch/);
  const partialAndPending = build38A(bytes, sourcePlan({ corrections: [{ locator: 'p_1:0', from: '嗯', to: '啊', count: 1, basis: 'context' }], pending: [{ locator: 'p_1:0', reason: '待核' }] }));
  assert.equal(partialAndPending.session.paragraphs[0].sentences[0].reviewNeeded, true);
  const sameEdit = { locator: 'p_1:0', from: '甲甲，嗯，我是說甲。', to: '修訂', count: 1, basis: 'context' };
  assert.throws(() => build38A(bytes, sourcePlan({ corrections: [sameEdit, sameEdit] })), /overlapping source spans/);
  assert.throws(() => build38A(bytes, sourcePlan({ pending: [{ locator: 'p_1:1', reason: '待核' }, { locator: 'p_1:1', reason: '重複' }] })), /duplicate pending/);
  assert.throws(() => build38A(bytes, sourcePlan({ headingCorrections: [{ paragraphId: 'p_1', from: '錯誤標題', to: '新標題', basis: 'basis' }] })), /invalid heading/);
  assert.throws(() => build38A(bytes, sourcePlan({ corrections: [{ locator: 'p_1:0', from: '甲甲，嗯，我是說甲。', to: '', count: 1, basis: 'basis' }] })), /empty replacement requires/);
});

test('allows multiple non-overlapping source replacements in one sentence and pending review beside a partial edit', () => {
  const { bytes, sourcePlan } = fixture();
  const source = JSON.parse(bytes.toString());
  source.paragraphs[0].sentences[0].text = '甲乙丙丁';
  const changedBytes = Buffer.from(JSON.stringify(source));
  const result = build38A(changedBytes, { ...sourcePlan(), sourceDigest: digest(changedBytes), corrections: [
    { locator: 'p_1:0', from: '甲', to: '乙', count: 1, basis: 'source line A' },
    { locator: 'p_1:0', from: '乙', to: 'B', count: 1, basis: 'source line B' },
  ], pending: [{ locator: 'p_1:0', reason: '其餘內容待核' }] });
  assert.equal(result.session.paragraphs[0].sentences[0].text, '乙B丙丁');
  assert.equal(result.verbatim.paragraphs.p_1[0].text, '乙B丙丁');
  assert.equal(result.verbatim.paragraphs.p_1[0].rawText, '甲乙丙丁');
  assert.equal(result.session.paragraphs[0].sentences[0].reviewNeeded, true);
  assert.equal(result.session.paragraphs[0].sentences[0].uncertainty, '其餘內容待核');
  assert.equal(result.ledger.length, 2);
});

test('rejects overlapping source matches and never matches text introduced by a prior replacement', () => {
  const { bytes, sourcePlan } = fixture();
  const source = JSON.parse(bytes.toString()); source.paragraphs[0].sentences[0].text = '甲乙丙丁';
  const changedBytes = Buffer.from(JSON.stringify(source));
  assert.throws(() => build38A(changedBytes, { ...sourcePlan(), sourceDigest: digest(changedBytes), corrections: [
    { locator: 'p_1:0', from: '甲乙', to: 'X', count: 1, basis: 'source span one' },
    { locator: 'p_1:0', from: '乙丙', to: 'Y', count: 1, basis: 'source span two' },
  ] }), /overlapping source spans/);
  assert.throws(() => build38A(changedBytes, { ...sourcePlan(), sourceDigest: digest(changedBytes), corrections: [
    { locator: 'p_1:0', from: '甲', to: 'B', count: 1, basis: 'source span one' },
    { locator: 'p_1:0', from: 'B', to: 'C', count: 1, basis: 'must exist in original' },
  ] }), /count mismatch/);
});

test('pending flags preserve pre-existing uncertainty while setting reviewNeeded', () => {
  const { bytes, sourcePlan } = fixture();
  const source = JSON.parse(bytes.toString());
  source.paragraphs[0].sentences[0].uncertainty = '既有疑義原因';
  const changedBytes = Buffer.from(JSON.stringify(source));
  const result = build38A(changedBytes, { ...sourcePlan(), sourceDigest: digest(changedBytes), pending: [{ locator: 'p_1:0', reason: '新增待核原因' }] });
  assert.equal(result.session.paragraphs[0].sentences[0].reviewNeeded, true);
  assert.equal(result.session.paragraphs[0].sentences[0].uncertainty, '既有疑義原因');
  assert.match(markdown38A(result), /待核：新增待核原因/);
});

test('HTML, Markdown and TXT expose the review warning and cover all sentences with escaped content and official audio links', () => {
  const { bytes, sourcePlan } = fixture();
  const result = build38A(bytes, sourcePlan({ pending: [{ locator: 'p_1:1', reason: '<待確認>' }] }));
  const html = render38A(result);
  const md = markdown38A(result);
  const txt = text38A(result);
  assert.match(html, /待閱校・尚未人工聽核/);
  assert.match(html, /新 ASR 僅供輔助核對/);
  assert.match(html, /<audio controls[^>]+buddha\.flyday\.com\.tw/);
  assert.ok(html.includes('https://buddha.flyday.com.tw/audio.mp3#t=3'));
  assert.match(html, /待核：&lt;待確認&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.ok(html.includes('\\u003cscript>'));
  assert.match(html, /下載忠實原話 TXT/);
  assert.match(md, /待閱校版/);
  assert.match(md, /原有辨識文字：乙 &lt;script&gt;/);
  assert.match(md, /#t=3/);
  assert.doesNotMatch(md, /\]\(javascript:/i);
  assert.doesNotMatch(md, /原有辨識文字：[\s\S]*\]\(javascript:/);
  assert.match(txt, /待閱校・尚未人工聽核/);
  assert.match(txt, /\[p1-s2\] \[0:03\] 乙/);
  assert.match(txt, /待核：<待確認>/);
  assert.doesNotMatch(txt, /原有辨識文字：/);
  assert.match(txt, /source-1/);
  assert.throws(() => render38A({ ...result, session: { ...result.session, audioUrl: 'https://evil.example/a.mp3' } }), /official HTTPS audio host/);
  const injectedAudio = JSON.parse(bytes.toString());
  injectedAudio.audioUrl = 'https://buddha.flyday.com.tw/audio](javascript:alert(1)).mp3';
  const injectedAudioBytes = Buffer.from(JSON.stringify(injectedAudio));
  const injectedAudioDigest = digest(injectedAudioBytes);
  const injectedAudioResult = build38A(injectedAudioBytes, { ...sourcePlan(), sourceDigest: injectedAudioDigest });
  assert.doesNotMatch(markdown38A(injectedAudioResult), /\]\(\s*javascript:/i);
});
