import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const COURSE = path.resolve('courses/釋量論第二品');
const toc = JSON.parse(fs.readFileSync(path.join(COURSE, 'toc.json'), 'utf8'));
const ORD = ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三'];
const artifactMap = { '㉃': '至', '㈻': '學', '㆘': '下', '㆝': '天' };
const norm = (s) => String(s).replace(/[㉃㈻㆘㆝]/g, (c) => artifactMap[c]).replace(/^[一二三四五六七八九十]+、/, '');
const heading = /^【[^】]+】([一二三四五六七八九十]+)、(.+)$/u;

const sessions = Array.from({ length: 32 }, (_, index) => {
  const id = String(index + 1).padStart(2, '0');
  return {
    id,
    data: JSON.parse(fs.readFileSync(path.join(COURSE, 'sessions', `session_${id}.json`), 'utf8')),
  };
});

for (let n = 1; n <= 32; n += 1) {
  const id = String(n).padStart(2, '0');
  test(`session_${id} 科判 headings 對應 toc 且順序一致`, () => {
    const session = JSON.parse(fs.readFileSync(path.join(COURSE, 'sessions', `session_${id}.json`), 'utf8'));
    const section = toc.sections.find((x) => x.sessionId === id);
    assert.ok(section);
    const expected = section.children.map((x, i) => ({ ordinal: ORD[i], title: norm(x.title) }));
    const valid = new Set(expected.map((x) => x.ordinal));
    const seen = [];
    const titleToOrd = new Map();
    for (const p of session.paragraphs) {
      const m = heading.exec(p.heading || '');
      if (!m) continue; // 非科判語意小標題，例如「48、49 個偈頌…」
      assert.ok(valid.has(m[1]), `${id} ${p.id} ordinal ${m[1]} is outside toc`);
      const title = norm(m[2]);
      if (titleToOrd.has(title)) assert.equal(titleToOrd.get(title), m[1], `${id} repeated title changed ordinal`);
      else titleToOrd.set(title, m[1]);
      if (!seen.includes(m[1])) seen.push(m[1]);
    }
    assert.deepEqual(seen, expected.map((x) => x.ordinal), `${id} toc ordinal order/count mismatch`);
  });
}

test('32 講 sentence invariants remain valid', () => {
  for (const { id, data: session } of sessions) {
    const ids = new Set();
    let previousSentence = null;
    for (const p of session.paragraphs) {
      for (const s of p.sentences) {
        assert.ok(s.id && s.text, `${id} missing sentence identity/text`);
        assert.ok(!ids.has(s.id), `${id} duplicate sentence id ${s.id}`);
        ids.add(s.id);
        assert.ok(Number.isFinite(s.start) && Number.isFinite(s.end), `${id} invalid timestamp at ${s.id}`);
        assert.ok(s.end >= s.start, `${id} negative duration at ${s.id}`);
        if (previousSentence) {
          assert.ok(
            s.start >= previousSentence.end,
            `${id} timestamp regression at ${previousSentence.id}->${s.id}`,
          );
        }
        previousSentence = s;
      }
      assert.equal(p.start, p.sentences[0]?.start, `${id} ${p.id} start mismatch`);
      assert.equal(p.end, p.sentences.at(-1)?.end, `${id} ${p.id} end mismatch`);
    }
  }
});

test('32 講都必須有官方文字稿，已宣告的 provenance 必須指向該稿', () => {
  const failures = [];
  for (const { id, data: session } of sessions) {
    const expectedSource = `courses/釋量論第二品/source_text/session_${id}_official_raw.txt`;
    if (!fs.existsSync(path.resolve(expectedSource))) failures.push(`${id}: source file missing`);
    if (session._meta && session._meta.source_text !== expectedSource) failures.push(`${id}: wrong source_text`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('32 講的講者括號在整講文字中必須成對且不可倒置', () => {
  const failures = [];
  for (const { id, data: session } of sessions) {
    let depth = 0;
    let minimumDepth = 0;
    const text = session.paragraphs.flatMap(p => p.sentences).map(s => s.text).join('');
    for (const character of text) {
      if (character === '（' || character === '(') depth += 1;
      if (character === '）' || character === ')') depth -= 1;
      minimumDepth = Math.min(minimumDepth, depth);
    }
    if (depth !== 0 || minimumDepth < 0) {
      failures.push(`${id}: finalDepth=${depth}, minimumDepth=${minimumDepth}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
