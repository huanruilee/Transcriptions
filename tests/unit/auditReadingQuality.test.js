import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  auditSession,
  auditBaseTextNfkc,
  auditCourseDir,
} from '../../scripts/audit_reading_quality.mjs';
import {
  RADAR_SYSTEM_PROMPT,
  buildRadarBatchMessages,
  adjudicateRadarCards,
  applyRadarDecisions,
} from '../../scripts/lib/radarAdjudicator.mjs';
import { computeSourceDigest } from '../../scripts/content_overview_pipeline.mjs';

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
      schemaVersion: 1,
      status: 'ai-reviewed',
      sourceTranscriptId: 'test/session_01',
      mainPoints: [
        { text: '學法前須先調整動機。', evidence: [{ sentenceId: 'seg-0001', quote: '我們在學習佛法之前，應該先調整自己的動機。' }] },
      ],
      discussionTopics: [
        { text: '為何學法前必須先調整動機？', evidence: [{ sentenceId: 'seg-0001', quote: '我們在學習佛法之前，應該先調整自己的動機。' }] },
        { text: '二諦與四諦在初學階段扮演什麼角色？', evidence: [{ sentenceId: 'seg-0003', quote: '因此尊者一再強調，初學者要從二諦與四諦下手。' }] },
        { text: '如何檢視自己的聞思是否成為解脫正因？', evidence: [{ sentenceId: 'seg-0002', quote: '動機純正，所聞思的法才能成為解脫的正因。' }] },
      ],
      referenceViews: [],
    },
  };
}

test('passes a healthy session that satisfies v1.9 reading quality gates', () => {
  const result = auditSession(makeHealthySession());
  assert.equal(result.ok, true, JSON.stringify(result.violations));
  assert.equal(result.violations.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.metrics.totalSentences, 4);
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
    assert.equal(report.errors.length, 0);
    assert.equal(report.sessions.length, 1);
    assert.equal(report.sessions[0].ok, true);
    assert.equal(report.sourceTexts.length, 1);
    assert.equal(report.sourceTexts[0].ok, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fails when both contentOverview.discussionTopics and discussionQuestions are missing', () => {
  const s = makeHealthySession();
  delete s.contentOverview;
  const result = auditSession(s);
  assert.equal(result.ok, false);
  assert.equal(result.metrics.discussionTopicCount, 0);
  assert.ok(result.violations.some((v) => v.code === 'DISCUSSION_TOPICS_COUNT'));
});

test('reads displayQuestion/rawQuestion on discussionQuestions and rejects empty or non-question entries', () => {
  const s = makeHealthySession();
  delete s.contentOverview;
  s.discussionQuestions = [
    { displayQuestion: '為何學法前要調整動機。' },
    { rawQuestion: '' },
    { displayQuestion: '如何區分二諦與四諦？' },
  ];
  const result = auditSession(s);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === 'DISCUSSION_TOPICS_QUESTION_MARK'));

  const sPass = makeHealthySession();
  delete sPass.contentOverview;
  sPass.discussionQuestions = [
    { displayQuestion: '為何學法前要調整動機？' },
    { rawQuestion: '如何區分二諦與四諦？' },
    { text: '如何檢視聞思是否成為解脫正因？' },
  ];
  const passRes = auditSession(sPass);
  assert.equal(passRes.ok, true, JSON.stringify(passRes.violations));
});

test('auditCourseDir fails when zero sessions/session_*.json files are found', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-rq-empty-'));
  try {
    const report = auditCourseDir(tmpDir);
    assert.equal(report.ok, false);
    assert.equal(report.sessions.length, 0);
    assert.ok(report.errors.some((e) => e.code === 'NO_SESSIONS_FOUND'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- v1.9 Red Gates (R1-R3) ---

test('R1: fails on audio vs YouTube duration drift > 10s unless offsetCalibrated/offsetSec is recorded', () => {
  const s = makeHealthySession();
  s._meta.audioDurationSec = 3315;
  s._meta.youtubeDurationSec = 3379;
  const failRes = auditSession(s);
  assert.equal(failRes.ok, false);
  assert.ok(failRes.violations.some((v) => v.code === 'AUDIO_YOUTUBE_DURATION_DRIFT'));

  s._meta.timeAlignment = { offsetSec: 64 };
  const passRes = auditSession(s);
  assert.equal(passRes.ok, true, JSON.stringify(passRes.violations));
});

test('R2: fails on Whisper hallucination phrases or 3+ repeated loop segments', () => {
  const s1 = makeHealthySession();
  s1.paragraphs[0].sentences.push({
    id: 'seg-0005',
    start: 60,
    end: 70,
    text: '請不吝點讚訂閱轉發打賞支持明鏡與點點欄目。',
    rawText: '请不吝点赞订阅转发打赏支持明镜与点点栏目',
  });
  const r1 = auditSession(s1);
  assert.equal(r1.ok, false);
  assert.ok(r1.violations.some((v) => v.code === 'WHISPER_HALLUCINATION'));

  const s2 = makeHealthySession();
  for (let k = 5; k <= 7; k++) {
    s2.paragraphs[0].sentences.push({
      id: `seg-000${k}`,
      start: 60 + k,
      end: 61 + k,
      text: '我們今天繼續講解這個段落。',
      rawText: '我們今天繼續講解這個段落',
    });
  }
  const r2 = auditSession(s2);
  assert.equal(r2.ok, false);
  assert.ok(r2.violations.some((v) => v.code === 'WHISPER_HALLUCINATION'));
});

test('R3: fails on trailing dangling connectives cut by period (e.g. ，此外。 / 。此時。)', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences[1].text = '想清楚這一點，對立感也會鬆動，此外。';
  const res = auditSession(s);
  assert.equal(res.ok, false);
  assert.ok(res.violations.some((v) => v.code === 'TRAILING_DANGLING_CONNECTIVE'));
});

// --- v1.9 Yellow Review Radar (Y1-Y4): warnings only, ok stays true ---

test('Y1: flags chopped incomplete clauses as yellow warnings without failing valid whitelisted endings', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences[0].text = '在內心深處，我們本能地覺得。';
  s.paragraphs[0].sentences[3].text = '答案是肯定的。';
  const res = auditSession(s);
  assert.equal(res.ok, true, 'Yellow warnings must not fail Hard Gate');
  assert.ok(res.warnings.some((w) => w.code === 'Y1_SUSPECT_CHOPPED_CLAUSE' && w.sentenceId === 'seg-0001'));
  assert.ok(!res.warnings.some((w) => w.sentenceId === 'seg-0004'), 'Whitelisted ending must not false-positive');
});

test('Y2: flags suspect questions ending in period without flagging real question marks', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences[0].text = '我想解脫、我想成佛，請問這是善法欲。';
  s.paragraphs[0].sentences[1].text = '請問這是善法欲還是執著？';
  const res = auditSession(s);
  assert.equal(res.ok, true);
  assert.ok(res.warnings.some((w) => w.code === 'Y2_SUSPECT_QUESTION_PERIOD' && w.sentenceId === 'seg-0001'));
  assert.ok(!res.warnings.some((w) => w.code === 'Y2_SUSPECT_QUESTION_PERIOD' && w.sentenceId === 'seg-0002'));
});

test('Y3: flags chapter headings that start mid-sentence or drift from heading topic, exempting generic headings', () => {
  const s = makeHealthySession();
  s.paragraphs[0].heading = '1. 重點複習與補充說明';
  s.paragraphs.push({
    id: 'p-2',
    heading: '2. 生我慢時如何思惟因果緣起',
    start: 60,
    end: 90,
    sentences: [
      { id: 'seg-0005', start: 60, end: 75, text: '進而輕視他人，覺得我比較優秀。', rawText: '進而輕視他人覺得我比較優秀' },
      { id: 'seg-0006', start: 75, end: 90, text: '這種心態需要透過觀察來化解。', rawText: '這種心態需要透過觀察來化解' },
    ],
  });
  const res = auditSession(s);
  assert.equal(res.ok, true);
  assert.ok(!res.warnings.some((w) => w.code === 'Y3_SUSPECT_HEADING_DRIFT' && w.sentenceId === 'seg-0001'));
  assert.ok(res.warnings.some((w) => w.code === 'Y3_SUSPECT_HEADING_DRIFT' && w.sentenceId === 'seg-0005'));
});

test('Y4: flags Buddhist homophone traps (稱心/對峙) while allowing safe phrases (稱心如意)', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences[0].text = '稱心原本所依附的那種實體化對立感會鬆動。';
  s.paragraphs[0].sentences[1].text = '這並不是追求世間的稱心如意。';
  const res = auditSession(s);
  assert.equal(res.ok, true);
  assert.ok(res.warnings.some((w) => w.code === 'Y4_SUSPECT_HOMOPHONE_TERM' && w.sentenceId === 'seg-0001'));
  assert.ok(!res.warnings.some((w) => w.code === 'Y4_SUSPECT_HOMOPHONE_TERM' && w.sentenceId === 'seg-0002'));
});

test('CLI --radar-out writes compact yellow cards and exits 0 when Hard Gates pass', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-radar-cli-'));
  try {
    const s = makeHealthySession();
    s.paragraphs[0].sentences[0].text = '在內心深處，我們本能地覺得。';
    const sessionFile = path.join(tmpDir, 'session_01.json');
    const radarFile = path.join(tmpDir, 'radar.json');
    fs.writeFileSync(sessionFile, JSON.stringify(s, null, 2), 'utf8');

    execFileSync(
      'node',
      ['scripts/audit_reading_quality.mjs', sessionFile, '--radar-out', radarFile],
      { encoding: 'utf8' },
    );
    const radar = JSON.parse(fs.readFileSync(radarFile, 'utf8'));
    assert.equal(radar.sessionId, 'session_01');
    assert.ok(radar.totalWarnings >= 1);
    assert.equal(radar.cards[0].ruleCode, 'Y1_SUSPECT_CHOPPED_CLAUSE');
    assert.ok(Array.isArray(radar.cards[0].allowedActions));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- Cheap-Model Radar Adjudicator ---

test('radarAdjudicator keeps system prompt compact and applies FIX / MERGE_NEXT / KEEP while preserving rawText and sourceDigest', async () => {
  assert.ok(RADAR_SYSTEM_PROMPT.length < 260, 'System prompt must stay compact for low-token cheap models');

  const s = makeHealthySession();
  s.paragraphs[0].sentences[0].text = '在內心深處，我們本能地覺得。';
  s.paragraphs[0].sentences[2].text = '請問這是善法欲。';
  s.contentOverview.sourceDigest = computeSourceDigest(s);

  const audit = auditSession(s);
  const messages = buildRadarBatchMessages(audit.radarCards, { courseHint: '三主要道' });
  assert.equal(messages.length, 2);

  const decisions = await adjudicateRadarCards(audit.radarCards, {
    apiKey: 'test-key',
    callModel: async () => JSON.stringify({
      decisions: [
        { id: 'seg-0001', action: 'MERGE_NEXT', reason: '未完子句併入下句' },
        { id: 'seg-0003', action: 'FIX', text: '請問這是善法欲？', reason: '實問句改全形問號' },
      ],
    }),
  });
  assert.equal(decisions.length, 2);

  const origRaw3 = s.paragraphs[0].sentences[2].rawText;
  const summary = applyRadarDecisions(s, decisions);
  assert.equal(summary.mergedCount, 1);
  assert.equal(summary.fixedCount, 1);
  assert.equal(s.paragraphs[0].sentences.length, 3);
  assert.equal(s.paragraphs[0].sentences[0].end, 30);
  assert.equal(s.paragraphs[0].sentences[1].text, '請問這是善法欲？');
  assert.equal(s.paragraphs[0].sentences[1].rawText, origRaw3, 'FIX must never mutate rawText');
  assert.equal(s.contentOverview.sourceDigest, computeSourceDigest(s), 'sourceDigest must be re-synced');
});

test('consolidates multi-rule radar cards per sentence and preserves FIX over duplicate KEEP', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences[0].text = '請問我們是不是覺得。';
  const audit = auditSession(s);
  const seg1Cards = audit.radarCards.filter((c) => c.id === 'seg-0001');
  assert.equal(seg1Cards.length, 1, 'Multiple rules on one sentence must emit a single consolidated card');
  assert.ok(seg1Cards[0].ruleCode.includes('Y1_SUSPECT_CHOPPED_CLAUSE'));
  assert.ok(seg1Cards[0].ruleCode.includes('Y2_SUSPECT_QUESTION_PERIOD'));

  const summary = applyRadarDecisions(s, [
    { id: 'seg-0001', action: 'FIX', text: '請問我們是不是覺得？' },
    { id: 'seg-0001', action: 'KEEP' },
  ]);
  assert.equal(summary.fixedCount, 1);
  assert.equal(s.paragraphs[0].sentences[0].text, '請問我們是不是覺得？');
});

test('MERGE_NEXT applies successor FIX before merging and supports chained merges', () => {
  const s = makeHealthySession();
  s.paragraphs[0].sentences[0].text = '我們認為。';
  s.paragraphs[0].sentences[1].text = '這是二地的意義。';
  const origRaw1 = s.paragraphs[0].sentences[0].rawText;
  const origRaw2 = s.paragraphs[0].sentences[1].rawText;

  const summary = applyRadarDecisions(s, [
    { id: 'seg-0001', action: 'MERGE_NEXT' },
    { id: 'seg-0002', action: 'FIX', text: '這是二諦的意義。' },
  ]);
  assert.equal(summary.mergedCount, 1);
  assert.equal(summary.fixedCount, 1);
  assert.equal(s.paragraphs[0].sentences.length, 3);
  assert.equal(s.paragraphs[0].sentences[0].text, '我們認為，這是二諦的意義。');
  assert.equal(s.paragraphs[0].sentences[0].rawText, `${origRaw1} ${origRaw2}`);
  assert.equal(s.paragraphs[0].sentences[0].end, 30);
});

test("R2 whitelist allows standard Buddhist triple-recitation chant (<=3) but catches 4+ repeats", () => {
  const s3 = makeHealthySession();
  s3.paragraphs[0].sentences[0].text = "南無本師釋迦牟尼佛。";
  s3.paragraphs[0].sentences[1].text = "南無本師釋迦牟尼佛。";
  s3.paragraphs[0].sentences[2].text = "南無本師釋迦牟尼佛。";
  const r3 = auditSession(s3);
  assert.equal(r3.violations.some((v) => v.code === "WHISPER_HALLUCINATION"), false);

  const s4 = makeHealthySession();
  s4.paragraphs[0].sentences.push({ id: "seg-0005", start: 40, end: 50, text: "南無本師釋迦牟尼佛。", rawText: "南無本師釋迦牟尼佛。" });
  for (let i = 0; i < 4; i += 1) s4.paragraphs[0].sentences[i].text = "南無本師釋迦牟尼佛。";
  const r4 = auditSession(s4);
  assert.equal(r4.violations.some((v) => v.code === "WHISPER_HALLUCINATION"), true);
});

test("prefers non-empty session.discussionQuestions over legacy contentOverview.discussionTopics", () => {
  const s = makeHealthySession();
  s.contentOverview.discussionTopics = ["只有一題？"];
  s.discussionQuestions = [
    { id: "q-1", displayQuestion: "第1題：何謂心的自性？" },
    { id: "q-2", displayQuestion: "第2題：為何無我慧能傷害我執？" },
    { id: "q-3", displayQuestion: "第3題：猶豫知是否為心的自性？" },
  ];
  const r = auditSession(s);
  assert.equal(r.violations.some((v) => v.code === "DISCUSSION_TOPICS_COUNT"), false);
  assert.equal(r.violations.some((v) => v.code === "DISCUSSION_TOPICS_QUESTION_MARK"), false);
});

test("Y5 radar flags suspect multi-speaker transition cue inside a long 學員 paragraph", () => {
  const s = makeHealthySession();
  s.paragraphs[0].speaker = "學員";
  s.paragraphs[0].sentences[0].text = "因為你剛剛是從自性光明的那個角度來說明，我覺得比較像是認知的性相那個部分，但是這邊強調的心自性到底強調的是什麼，可以再進一步看一下。好的，謝謝師兄。接下來我們再請第二位同學發表，法師好，大家好，我認為心的自性是如實取境。";
  const r = auditSession(s);
  assert.equal(r.warnings.some((w) => w.code === "Y5_SUSPECT_SPEAKER_MIX"), true);
  assert.equal(r.radarCards.some((c) => c.ruleCode === "Y5_SUSPECT_SPEAKER_MIX"), true);
});
