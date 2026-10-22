import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../courses/入中論善顯密意疏/', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const toc = read('toc.json');
const flatten = (nodes) => nodes.flatMap(n => [n, ...flatten(n.children || [])]);
const nodes = flatten(toc.sections);
const associated = n => n.sessionId === '36A' || n.sessionIds?.includes('36A');
const legitimate = [
  ['巳三、明破他生之功德', 111, 127],
  ['巳四、明全無自性生', 113, 1609],
  ['午一、破計有自相', 113, 1609],
  ['未一、聖根本智應是破諸法之因', 113, 2105],
];

test('36A associations contain actual lecture sections, not p100/109/110 or future headings', () => {
  assert.deepEqual(nodes.filter(associated).map(n => n.title), legitimate.map(n => n[0]));
  for (const [title, page, timestamp] of legitimate) {
    const node = nodes.find(n => n.title === title);
    assert.equal(node.page, page);
    assert.equal(node.timestamp, timestamp);
    assert.equal(node.sessionId, '36A');
  }
});

test('all other session references, ancestor structure and TOC fields remain identical', () => {
  const copy = structuredClone(toc);
  for (const node of flatten(copy.sections)) {
    if (node.sessionIds) node.sessionIds = node.sessionIds.filter(s => s !== '36A');
  }
  // Baseline captured before this bounded fix; excludes only 36A list membership.
  assert.equal(createHash('sha256').update(JSON.stringify(copy)).digest('hex'),
    '610acea3d1bf08348ad0b707313babbbe75d96c92077f0ac3d1462f1b6693d12');
});

test('root-page boundaries distinguish p104 flashback and 36B continuation from future mentions', () => {
  const page = n => readFileSync(new URL(`source_text/page_${n}.txt`, root), 'utf8').split('\n');
  assert.match(page(104)[15], /若得隨一處/);
  assert.equal(page(111)[24], '巳三、明破他生之功德');
  assert.match(page(112)[2], /由芽非離種為他/);
  assert.match(page(113)[6], /巳四.*午一/);
  assert.match(page(113)[7], /未一.*未二/);
  assert.equal(page(114)[21], '未二、名言諦應堪正理觀察');
  const a = read('sessions/session_36A.json').paragraphs.flatMap(p => p.sentences || []);
  const b = read('sessions/session_36B.json').paragraphs.flatMap(p => p.sentences || []);
  assert.match(a[0].text, /104/);
  assert.match(a.find(s => s.id === 'p26-s1')?.text || '',
    /第 113 頁倒數第 2 行至第 114 頁第 5 行.*不以空性令諸法空，但法性自空/);
  assert.match(a.at(-1)?.text || '', /我們先休息一下，下節課繼續/);
  assert.match(b[0].text, /114 頁第 3 行/);
  const next = nodes.find(n => n.title === '未二、名言諦應堪正理觀察');
  assert.equal(next.sessionId, '36B');
  assert.equal(next.timestamp, 1398);
  assert.ok(!associated(next));
});
