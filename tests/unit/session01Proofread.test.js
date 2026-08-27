import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// session 01 opening-praise grounded proofreading
// Source: courses/入中論善顯密意疏/source_text/page_006.txt
// Session: courses/入中論善顯密意疏/sessions/session_01.json

const SOURCE_TEXT_PATH = path.resolve(
  'courses/入中論善顯密意疏/source_text/page_006.txt'
);
const SESSION_PATH = path.resolve(
  'courses/入中論善顯密意疏/sessions/session_01.json'
);

// 9 known ASR-corrupted phrases from task spec (rendered as actual chars)
const CORRUPT_PHRASES = [
  '恩師廟',           // 恩師妙音
  '父子主下',         // 父子足
  '無壓佛會眾',       // 無央佛會中
  '典賞罪神主',       // 演唱最勝甚深處（or similar）
  '龍面敬禮',         // 龍猛提婆 / 頭面敬禮
  '佛神中',           // 三世諸佛心中心
  '不夠盡為也',       // 不共要義皆善見
  '受夠',             // 惡說垢
  '廣續如中文',       // 廣釋入中論
];

// Source-grounded phrases from page_006.txt that MUST appear (opening praise)
const REQUIRED_PHRASES = [
  '敬禮皈依',
  '恩師妙音',
  '聖者父子足',
  '一切深廣善說藏',
  '普為世間不請友',
  '啟示三地善道眼',
  '牟尼法王',
  '常照護',
  '遍於無央佛會中',
  '演唱最勝甚深處',
  '作獅子吼',
  '妙音恩師',
  '恆加持',
  '三世諸佛心中心',
  '緣起中道離二邊',
  '佛記龍猛',
  '如理釋',
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

describe('Session 01 opening-praise grounded proofreading', () => {
  it('source text page_006.txt exists and is non-empty', () => {
    assert.ok(fs.existsSync(SOURCE_TEXT_PATH), 'page_006.txt must exist');
    const content = fs.readFileSync(SOURCE_TEXT_PATH, 'utf8');
    assert.ok(content.length > 100, 'page_006.txt must have content');
  });

  it('session_01.json exists and is valid JSON', () => {
    assert.ok(fs.existsSync(SESSION_PATH), 'session_01.json must exist');
    const content = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    assert.equal(content.sessionId, '01');
    assert.ok(Array.isArray(content.paragraphs));
    assert.ok(content.paragraphs.length > 0);
  });

  it('contains required source-grounded phrases from page_006.txt', () => {
    const content = fs.readFileSync(SESSION_PATH, 'utf8');
    const missing = REQUIRED_PHRASES.filter((p) => !content.includes(p));
    assert.equal(
      missing.length,
      0,
      `Missing required source-grounded phrases: ${JSON.stringify(missing)}`
    );
  });

  it('does NOT contain known ASR-corrupted phrases', () => {
    const content = fs.readFileSync(SESSION_PATH, 'utf8');
    const found = CORRUPT_PHRASES.filter((p) => content.includes(p));
    assert.equal(
      found.length,
      0,
      `Found banned ASR-corrupted phrases: ${JSON.stringify(found)}`
    );
  });

  it('preserves existing timestamps (no audio-alignment rerun)', () => {
    const content = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    // Spot-check 4 representative timestamps from paragraphs that should be
    // preserved verbatim across the correction.
    const expectedStarts = [0.21, 29.45, 116.12, 318.94];
    const expectedEnds = [12.72, 48.74, 118.56, 321.36];

    // Find first paragraph with start = 0.21 etc.
    const findPara = (start) => content.paragraphs.find((p) => p.start === start);
    for (let i = 0; i < expectedStarts.length; i++) {
      const para = findPara(expectedStarts[i]);
      assert.ok(para, `Paragraph starting at ${expectedStarts[i]} must exist`);
      assert.equal(para.end, expectedEnds[i]);
    }
  });

  it('paragraphs 3-7 (the opening praise recitation) are doctrinally calibrated', () => {
    const content = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    const praiseIds = ['p_3', 'p_4', 'p_5', 'p_6', 'p_7'];
    const praiseParagraphs = content.paragraphs.filter((p) =>
      praiseIds.includes(p.id)
    );
    assert.equal(praiseParagraphs.length, 5);

    // Each praise paragraph should now reference recognizable source-grounded
    // verse fragments rather than the gibberish ASR noise.
    const versesExpected = ['敬禮', '三地', '佛記', '教授', '月稱'];
    const fullText = praiseParagraphs
      .map((p) => p.sentences.map((s) => s.text).join(' '))
      .join(' ');

    for (const v of versesExpected) {
      assert.ok(
        fullText.includes(v),
        `Praise paragraph text should contain "${v}" (source-grounded verse fragment)`
      );
    }
  });
});