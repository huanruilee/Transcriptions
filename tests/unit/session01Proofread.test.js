import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourceTextPath = path.resolve(
  'courses/入中論善顯密意疏/source_text/page_006.txt'
);
const sessionPath = path.resolve(
  'courses/入中論善顯密意疏/sessions/session_01.json'
);

const corruptPhrases = [
  '恩師廟',
  '父子主下',
  '無壓佛會眾',
  '典賞罪神主',
  '龍面敬禮',
  '佛神中',
  '不夠盡為也',
  '受夠',
  '廣續如中文',
];

const sourceGroundedPhrases = [
  '敬禮皈依恩師妙音',
  '聖者父子足',
  '一切深廣善說藏',
  '普為世間不請友',
  '啟示三地善道眼',
  '牟尼法王常照護',
  '遍於無央佛會中',
  '演唱最勝甚深處',
  '作獅子吼無能等',
  '妙音恩師恆加持',
  '三世諸佛心中心',
  '緣起中道離二邊',
  '佛記龍猛如理釋',
  '至心敬禮哀攝受',
  '由前教授登高位',
  '以自所見示眾生',
  '演說善道得自在',
  '敬禮吉祥聖天足',
  '奉行至尊妙音教',
  '開顯龍猛究竟意',
  '證得悉地持明位',
  '頭面敬禮佛護足',
  '微細難測大仙道',
  '龍猛不共諸關要',
  '圓滿開顯月稱師',
  '及靜天足我敬禮',
  '龍猛提婆所成宗',
  '三派大車廣解釋',
  '我以無垢淨慧眼',
  '不共要義皆善見',
  '此間欲宣彼宗者',
  '我為除其惡說垢',
  '因眾請故以淨語',
  '當即廣釋入中論',
];

function sessionText(session) {
  return session.paragraphs
    .flatMap((paragraph) => paragraph.sentences.map((sentence) => sentence.text))
    .join('\n');
}

describe('session 01 opening praise grounded proofreading', () => {
  it('keeps the page 006 source text available for review', () => {
    const sourceText = fs.readFileSync(sourceTextPath, 'utf8');

    assert.match(sourceText, /敬禮皈依恩師妙音與聖者父子足/);
    assert.match(sourceText, /我以無垢淨慧眼\s+不共要義皆善見/);
    assert.match(sourceText, /當即廣釋入中論/);
  });

  it('preserves source-grounded opening praise phrases in session 01', () => {
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    const text = sessionText(session);
    const missing = sourceGroundedPhrases.filter((phrase) => !text.includes(phrase));

    assert.deepEqual(missing, []);
  });

  it('does not reintroduce known ASR-corrupted opening praise phrases', () => {
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    const text = sessionText(session);
    const found = corruptPhrases.filter((phrase) => text.includes(phrase));

    assert.deepEqual(found, []);
  });

  it('records honest text-only provenance without overclaiming audio alignment', () => {
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    const proofread = session._meta?.groundedProofreading?.session01OpeningPraise;

    assert.equal(proofread?.method, 'source-grounded text-only correction');
    assert.equal(proofread?.source, 'courses/入中論善顯密意疏/source_text/page_006.txt');
    assert.equal(proofread?.paragraphs, 'p_3-p_8');
    assert.equal(proofread?.timestampsPreserved, true);
    assert.equal(proofread?.audioAlignmentRerun, false);
  });

  it('keeps representative paragraph timestamps unchanged', () => {
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    const expected = [
      { id: 'p_3', start: 29.45, end: 48.74 },
      { id: 'p_4', start: 48.74, end: 70.04 },
      { id: 'p_5', start: 70.04, end: 88.36 },
      { id: 'p_6', start: 88.36, end: 106.74 },
      { id: 'p_7', start: 106.74, end: 116.12 },
      { id: 'p_8', start: 116.12, end: 133.31 },
    ];

    for (const { id, start, end } of expected) {
      const paragraph = session.paragraphs.find((candidate) => candidate.id === id);
      assert.equal(paragraph?.start, start, `${id} start timestamp changed`);
      assert.equal(paragraph?.end, end, `${id} end timestamp changed`);
    }
  });
});
