import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const COURSE_DIR = path.join(process.cwd(), 'courses/入中論善顯密意疏');
const SESSION_PATH = path.join(COURSE_DIR, 'sessions/session_01.json');

function readSessionText() {
  const session = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  return session.paragraphs
    .flatMap(paragraph => paragraph.sentences || [])
    .map(sentence => sentence.text || '')
    .join('\n');
}

test('session 01 opening praise is grounded to the source text', () => {
  const text = readSessionText();

  for (const required of [
    '敬禮皈依恩師妙音與聖者父子足',
    '一切深廣善說藏',
    '普為世間不請友',
    '遍於無央佛會中',
    '三世諸佛心中心',
    '緣起中道離二邊',
    '佛記龍猛如理釋',
    '此間欲宣彼宗者',
    '我為除其惡說垢',
    '當即廣釋入中論'
  ]) {
    assert.match(text, new RegExp(required), `missing source-grounded phrase: ${required}`);
  }
});

test('session 01 opening praise has no known ASR-corrupted liturgy phrases', () => {
  const text = readSessionText();

  for (const forbidden of [
    '恩師廟',
    '父子主下',
    '不許多',
    '無壓佛會眾',
    '典賞罪神主',
    '龍面敬禮',
    '佛神中',
    '不夠盡為也',
    '受夠',
    '廣續如中文'
  ]) {
    assert.doesNotMatch(text, new RegExp(forbidden), `known ASR-corrupted phrase remains: ${forbidden}`);
  }
});
