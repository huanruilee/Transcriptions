import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  auditSentence,
  applyConfirmedCandidates,
  applyAuditToSession,
  auditSession
} from '../../scripts/transcript_candidate_auditor.mjs';

const sourceText = [
  '於前所說世間顛倒世俗之前為諦實故，能仁說為世間的世俗諦。',
  '由於彼世俗前不諦實故，名唯世俗。',
  '如影像、谷響等少分緣起法。',
  '此所說之世俗，是明世俗諦為於何世俗前安立為諦之世俗。',
  '由此無明愚癡，令諸眾生不見諸法實性。',
  '故是清淨地菩薩，及二乘阿羅漢。'
].join('\n');

test('auditor proposes source-grounded corrections for real 30B ASR artifacts', () => {
  const cases = new Map([
    ['瓶子在無明前面是地。', '瓶子在無明前面是諦。'],
    ['是明世俗諦為何世俗前安利為地的那個世俗。', '是明世俗諦為何世俗前安立為諦的那個世俗。'],
    ['如影像古生的少分元起發。', '如影像、谷響的少分緣起法。'],
    ['魚吃障蔽真實義。', '愚癡障蔽真實義。'],
    ['三禁地的菩薩。', '清淨地的菩薩。']
  ]);

  for (const [input, expected] of cases) {
    const result = auditSentence({ text: input, sourceSegmentId: 1 }, { sourceText });
    assert.equal(result.suggestedText, expected, input);
    assert.ok(result.candidates.every((candidate) => candidate.evidence.length > 0));
  }
});

test('auditor does not blindly rewrite numbered bodhisattva grounds', () => {
  const input = '初地菩薩、二地菩薩到七地菩薩都尚未斷盡所知障。';
  const result = auditSentence({ text: input, sourceSegmentId: 2 }, { sourceText });

  assert.equal(result.suggestedText, input);
  assert.deepEqual(result.candidates, []);
});

test('auditor corrects the eye-consciousness passage from audio and source context', () => {
  const cases = new Map([
    ['現影像的演示。', '現影像的眼識。'],
    ['演示，', '眼識，'],
    ['直連面的影像為連面。', '執臉面的影像為臉面。'],
    ['執言，', '執陽焰，'],
    ['直骨身的。', '執谷響的。'],
    ['演示都是顛倒識。', '眼識都是顛倒識。']
  ]);

  for (const [input, expected] of cases) {
    const result = auditSentence({ text: input, sourceSegmentId: 3 }, { sourceText });
    assert.equal(result.suggestedText, expected, input);
    assert.equal(result.confidence, 'CONFIRMED');
  }
});

test('auditor keeps residual ASR artifacts visible after a partial correction', () => {
  const result = auditSentence(
    { text: '它在演示前面是地。', sourceSegmentId: 4 },
    { sourceText }
  );

  assert.equal(result.suggestedText, '它在演示前面是諦。');
  assert.ok(result.residualWarnings.some((warning) => warning.matched === '演示'));
});

test('auditor uses bounded context for recurring 30B homophones', () => {
  const cases = new Map([
    ['具無名者根本就見不到。', '具無明者根本就見不到。'],
    ['它在五米前面是地。', '它在無明前面是諦。'],
    ['對反覆的世俗來說。', '對凡夫的世俗來說。'],
    ['反覆的世俗四。', '凡夫的世俗識。'],
    ['所以人人說為世俗諦。', '所以能仁說為世俗諦。'],
    ['所以像影像啊古神啊什麼。', '所以像影像啊谷響啊什麼。']
  ]);

  for (const [input, expected] of cases) {
    const result = auditSentence({ text: input, sourceSegmentId: 5 }, { sourceText });
    assert.equal(result.suggestedText, expected, input);
    assert.equal(result.residualWarnings.length, 0, input);
  }
});

test('auditor preserves ordinary non-doctrinal uses of similar words', () => {
  for (const input of [
    '無名氏留下題記。',
    '請反覆練習這一段。',
    '二地菩薩證悟空性。',
    '人人說今天下雨。',
    '我買了安利產品。',
    '古生物學不是本課術語。',
    '明眼人都看得見。',
    '線尾需要修剪。'
  ]) {
    const result = auditSentence({ text: input, sourceSegmentId: 6 }, { sourceText });
    assert.equal(result.suggestedText, input);
    assert.deepEqual(result.candidates, []);
  }
});

test('auditor restores source phrases instead of isolated characters', () => {
  const cases = new Map([
    ['生威阿羅漢、獨角阿羅漢。', '聲聞阿羅漢、獨覺阿羅漢。'],
    ['他完全是虛妄，全權虛妄。', '他完全是虛妄，全然虛妄。'],
    ['他這邊講不限為地實。', '他這邊講不現為諦實。'],
    ['由於比世俗前不是蒂固。', '由於彼世俗前不諦實故。'],
    ['以示當之論說。', '以是當知論說。'],
    ['一說善民眼。', '意說善名言者。'],
    ['現世，行止，但是一知。', '現似，形質，但是已知。']
  ]);

  for (const [input, expected] of cases) {
    const result = auditSentence({ text: input, sourceSegmentId: 7 }, { sourceText });
    assert.equal(result.suggestedText, expected, input);
    assert.equal(result.confidence, 'CONFIRMED');
  }
});

test('auditor restores the remaining page 101 source phrases', () => {
  const cases = new Map([
    ['對無名來說，', '對無明來說，'],
    ['看贊文的話。', '看藏文的話。'],
    [
      '是透有或者是說依有世俗諦的那個世俗而安立世俗諦。',
      '是透由或者是說依由世俗諦的那個世俗而安立世俗諦。'
    ],
    ['無名這個世俗前面。', '無明這個世俗前面。'],
    ['他這個不限為是要是怎麼解釋。', '他這個不現為是要是怎麼解釋。'],
    ['所以線尾是中文的。', '所以現為是中文的。'],
    ['無關限不限了。', '無關現不現了。'],
    ['由於三種前不限為第四。', '由於三種人前不現為諦實。'],
    ['則具無明則畢竟不限。', '則具無明者畢竟不見。'],
    ['意見為虛妄者。', '亦見為虛妄者。'],
    ['並不相為。', '並不相違。'],
    ['是觀待比心。', '是觀待彼心。'],
    ['知世俗諦也。', '是世俗諦也。']
  ]);

  for (const [input, expected] of cases) {
    const result = auditSentence({ text: input, sourceSegmentId: 8 }, { sourceText });
    assert.equal(result.suggestedText, expected, input);
    assert.equal(result.confidence, 'CONFIRMED');
  }
});

test('auditor flags ambiguous speech instead of auto-correcting it', () => {
  for (const input of [
    '可是就是變成世俗量。'
  ]) {
    const result = auditSentence({ text: input, sourceSegmentId: 9 }, { sourceText });
    assert.equal(result.suggestedText, input);
    assert.equal(result.confidence, null);
    assert.ok(result.residualWarnings.length > 0, input);
  }
});

test('audio-context proposals stay likely when no decoder emitted the exact wording', () => {
  const cases = [
    [{ sourceSegmentId: 170, text: '世俗諦是隨安立的。' }, '世俗諦是誰去安立的？'],
    [{ sourceSegmentId: 171, text: '那個其實明世俗是安立的了。' }, '那個其實名言識安立的了。'],
    [{ sourceSegmentId: 1307, text: '裝置了，' }, '總之呢，']
  ];

  for (const [sentence, expected] of cases) {
    const result = auditSentence(sentence, { sourceText });
    assert.equal(result.suggestedText, expected);
    assert.equal(result.confidence, 'LIKELY');
  }
});

test('only confirmed candidates are auto-applied', () => {
  const audited = [
    {
      sourceSegmentId: 1,
      originalText: '平子只是世俗而已。',
      suggestedText: '瓶子只是世俗而已。',
      confidence: 'CONFIRMED'
    },
    {
      sourceSegmentId: 2,
      originalText: '語音不清。',
      suggestedText: '名言識前面不諦實。',
      confidence: 'LIKELY'
    }
  ];
  const sentences = [
    { sourceSegmentId: 1, text: '平子只是世俗而已。', rawText: '平子只是世俗而已' },
    { sourceSegmentId: 2, text: '語音不清。', rawText: '語音不清' }
  ];

  const output = applyConfirmedCandidates(sentences, audited);
  assert.equal(output[0].text, '瓶子只是世俗而已。');
  assert.equal(output[0].rawText, '平子只是世俗而已');
  assert.equal(output[1].text, '語音不清。');
});

test('session application preserves raw text and appends auditable ledger entries', () => {
  const session = {
    sessionId: '30B',
    paragraphs: [{ sentences: [
      { sourceSegmentId: 1, text: '平子只是世俗而已。', proofreadText: '平子只是世俗而已。', rawText: '平子只是世俗而已' }
    ] }],
    _meta: { candidateEvidence: { applied: [], unresolved: [] } }
  };
  const report = auditSession(session, { sourceText });
  const output = applyAuditToSession(session, report);
  const sentence = output.paragraphs[0].sentences[0];
  const ledger = output._meta.candidateEvidence.applied[0];

  assert.equal(sentence.text, '瓶子只是世俗而已。');
  assert.equal(sentence.rawText, '平子只是世俗而已');
  assert.equal(ledger.sourceSegmentId, 1);
  assert.equal(ledger.before, '平子只是世俗而已。');
  assert.equal(ledger.after, '瓶子只是世俗而已。');
  assert.equal(ledger.confidence, 'CONFIRMED');
  assert.deepEqual(ledger.ruleIds, ['p瓶-homophone']);
  assert.ok(ledger.evidence.length > 0);
});

test('repeated session audits preserve a cumulative run history', () => {
  const session = {
    sessionId: '30B',
    paragraphs: [{ sentences: [
      { sourceSegmentId: 1, text: '平子。', proofreadText: '平子。', rawText: '平子' }
    ] }],
    _meta: { candidateEvidence: {
      applied: [],
      automatedAudit: {
        schemaVersion: 1,
        generatedBy: 'transcript_candidate_auditor.mjs',
        summary: { scanned: 1, candidates: 189, confirmed: 189, likely: 0, warnings: 0 },
        autoApplied: 189,
        requiresReview: false
      }
    } }
  };
  const report = auditSession(session, { sourceText });
  const output = applyAuditToSession(session, report);
  const audit = output._meta.candidateEvidence.automatedAudit;

  assert.equal(audit.autoApplied, 1);
  assert.equal(audit.totalAutoApplied, 190);
  assert.equal(audit.runs.length, 2);
  assert.equal(audit.runs[0].autoApplied, 189);
  assert.equal(audit.runs[1].autoApplied, 1);
});

test('session report is machine-readable and preserves segment identity', () => {
  const session = {
    sessionId: '30B',
    paragraphs: [{ sentences: [
      { sourceSegmentId: 7, start: 10, end: 12, text: '平子只是世俗而已。', rawText: '平子只是世俗而已' }
    ] }]
  };
  const report = auditSession(session, { sourceText });

  assert.equal(report.sessionId, '30B');
  assert.equal(report.items[0].sourceSegmentId, 7);
  assert.equal(report.items[0].confidence, 'CONFIRMED');
  assert.equal(report.summary.confirmed, 1);
});

test('session audit honors an evidence-bearing accepted-as-spoken exception', () => {
  const session = {
    sessionId: '30B',
    paragraphs: [{ sentences: [
      { sourceSegmentId: 9, text: '可是就是變成世俗量。', rawText: '可是就是變成世俗量' }
    ] }],
    _meta: { candidateEvidence: { reviewedExceptions: [{
      sourceSegmentId: 9,
      text: '可是就是變成世俗量。',
      disposition: 'ACCEPTED_AS_SPOKEN',
      evidence: ['two timestamped audio decodes agree']
    }] } }
  };
  const report = auditSession(session, { sourceText });

  assert.equal(report.summary.warnings, 0);
  assert.equal(report.summary.acceptedExceptions, 1);
  assert.deepEqual(report.items, []);
});

test('session audit carries an unresolved manual queue into the blocking report', () => {
  const session = {
    sessionId: '30B',
    paragraphs: [{ sentences: [
      { sourceSegmentId: 170, text: '世俗諦是誰去安立的？', rawText: '世俗地是隨安利的' }
    ] }],
    _meta: { candidateEvidence: { manualReviewQueue: [{
      sourceSegmentId: 170,
      text: '世俗諦是誰去安立的？',
      confidence: 'LIKELY',
      reason: 'same-model decodes disagree'
    }] } }
  };
  const report = auditSession(session, { sourceText });

  assert.equal(report.summary.warnings, 1);
  assert.equal(report.items[0].residualWarnings[0].warningId, 'manual-review-pending');
});

test('CLI accepts multiple source files and writes a JSON report', () => {
  const directory = mkdtempSync(join(tmpdir(), 'transcript-auditor-'));
  const sessionPath = join(directory, 'session.json');
  const sourceOne = join(directory, 'page_100.txt');
  const sourceTwo = join(directory, 'page_101.txt');
  const reportPath = join(directory, 'report.json');
  writeFileSync(sessionPath, JSON.stringify({
    sessionId: '30B',
    paragraphs: [{ sentences: [
      { sourceSegmentId: 9, start: 1, end: 2, text: '魚吃障蔽真實義。', rawText: '魚吃障蔽真實義' }
    ] }]
  }));
  writeFileSync(sourceOne, '無明愚癡。');
  writeFileSync(sourceTwo, '是名世俗。');

  execFileSync(process.execPath, [
    new URL('../../scripts/transcript_candidate_auditor.mjs', import.meta.url).pathname,
    '--session', sessionPath,
    '--source', sourceOne,
    '--source', sourceTwo,
    '--report', reportPath
  ]);

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.items[0].suggestedText, '愚癡障蔽真實義。');
});

test('CLI resolves a source page range relative to the session path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'transcript-auditor-range-'));
  const sessionsDirectory = join(directory, 'course', 'sessions');
  const sourceDirectory = join(directory, 'course', 'source_text');
  const sessionPath = join(sessionsDirectory, 'session_30B.json');
  const reportPath = join(directory, 'report.json');
  execFileSync('mkdir', ['-p', sessionsDirectory, sourceDirectory]);
  writeFileSync(sessionPath, JSON.stringify({
    sessionId: '30B',
    paragraphs: [{ sentences: [
      { sourceSegmentId: 10, start: 1, end: 2, text: '魚吃障蔽真實義。', rawText: '魚吃障蔽真實義' }
    ] }]
  }));
  writeFileSync(join(sourceDirectory, 'page_100.txt'), '無明愚癡。');
  writeFileSync(join(sourceDirectory, 'page_101.txt'), '是名世俗。');

  execFileSync(process.execPath, [
    new URL('../../scripts/transcript_candidate_auditor.mjs', import.meta.url).pathname,
    '--session', sessionPath,
    '--source-range', '100-101',
    '--report', reportPath
  ]);

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.summary.confirmed, 1);
});

test('CLI fails closed when review warnings remain', () => {
  const directory = mkdtempSync(join(tmpdir(), 'transcript-auditor-gate-'));
  const sessionPath = join(directory, 'session.json');
  writeFileSync(sessionPath, JSON.stringify({
    sessionId: '30B',
    paragraphs: [{ sentences: [
      { sourceSegmentId: 11, text: '可是就是變成世俗量。', rawText: '可是就是變成世俗量' }
    ] }]
  }));

  const result = spawnSync(process.execPath, [
    new URL('../../scripts/transcript_candidate_auditor.mjs', import.meta.url).pathname,
    '--session', sessionPath,
    '--fail-on-review'
  ]);

  assert.equal(result.status, 2);
});
