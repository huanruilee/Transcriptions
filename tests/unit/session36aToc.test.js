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

const movedTitles = ['庚一、明此地訓釋與慧度增勝', '庚二、讚慧度功德',
  '庚三、觀甚深緣起真實', '庚四、結述此地功德'];
const newTitle = '己二、釋第六現前地';
const oldTitle = '己一、釋極喜等五地';
const fields = ({ children, ...rest }) => rest;
const digest = rows => createHash('sha256').update(JSON.stringify(rows.sort())).digest('hex');

test('36A ancestry passes through authoritative sixth-ground sibling with exactly four existing children', () => {
  const parent = nodes.find(n => n.title === '戊二、諸地各別建立');
  assert.deepEqual(parent.children.map(n => n.title), [oldTitle, newTitle]);
  const sixth = parent.children[1];
  assert.equal(nodes.filter(n => n.title === newTitle).length, 1);
  assert.equal(nodes.filter(n => n.title === '丑二、成立彼宗之正理').length, 1);
  assert.deepEqual(sixth.children.map(n => n.title), movedTitles);
  assert.deepEqual(fields(sixth), { title: newTitle, sessionId: '01', page: 63,
    timestamp: 0, needsReview: true, reviewStatus: 'needs_review' });
  const paths = [];
  function walk(ns, ancestors = []) {
    for (const n of ns) {
      if (associated(n)) paths.push([...ancestors, n.title]);
      walk(n.children || [], [...ancestors, n.title]);
    }
  }
  walk(toc.sections);
  assert.equal(paths.length, 4);
  for (const path of paths) {
    assert.ok(path.includes(newTitle));
    assert.ok(!path.includes(oldTitle));
    assert.ok(path.includes('庚三、觀甚深緣起真實'));
    assert.ok(path.includes('丑二、成立彼宗之正理'));
    assert.ok(!path.includes('醜二、成立彼宗之正理'));
  }
  const page = n => readFileSync(new URL(`source_text/page_${n}.txt`, root), 'utf8').split('\n');
  assert.match(page('021')[20], /戊二.*己一.*己二、釋第六現前地/);
  assert.match(page('063')[16], /己二、釋第六現前地。分四：庚一/);
  assert.match(page('063')[17], /庚三.*庚四/);
  assert.equal(page('064')[11], '庚二、讚慧度功德');
  assert.match(page('064')[23], /庚三、觀甚深緣起真實/);
  assert.equal(page('240')[3], '庚四、結述此地功德');
  assert.match(page('080')[24], /丑二、成立彼宗之正理/);
  assert.ok(read('sessions/session_01.json').paragraphs.flatMap(p => p.verbatimSentences || p.sentences || [])
    .some(s => /六三，第六，現前地，分四/.test(s.text)));
});

test('flattened inventory preserves all fields and relationships except four reparentings and one 丑二 rename', () => {
  const inventory = [], edges = [];
  // Sole title exception: map the corrected source spelling back to the captured baseline.
  const baselineFields = n => {
    const value = fields(n);
    if (value.title === '丑二、成立彼宗之正理') value.title = '醜二、成立彼宗之正理';
    return value;
  };
  const oldKey = JSON.stringify(fields(nodes.find(n => n.title === oldTitle)));
  function walk(ns, parentKey = 'ROOT') {
    for (const n of ns) {
      const key = JSON.stringify(baselineFields(n));
      if (n.title !== newTitle) {
        inventory.push(key);
        edges.push(JSON.stringify([movedTitles.includes(n.title) ? oldKey : parentKey, key]));
      }
      walk(n.children || [], key);
    }
  }
  walk(toc.sections);
  // Captured before reparenting, after the four approved 36A membership removals.
  // Sorted flat records preserve duplicate multiplicity; only the new parent is excluded.
  assert.equal(digest(inventory), 'cba454d3f2fe1a03b92b9668fe0f50a7e5676d2ccd48cdd725c0a1dec1c76ffb');
  assert.equal(digest(edges), '0e9aaa225470a87f6613883958542aeafceac17828bbf3f60f76d68e940f5ac0');
  const orderRows = nodes.filter(n => n.title !== newTitle).map(n => JSON.stringify([
    baselineFields(n), (n.children || []).filter(c => c.title !== newTitle && !movedTitles.includes(c.title))
      .map(baselineFields),
  ]));
  assert.equal(digest(orderRows), '3373e736ada958f0bde7fc3556b4b4789f98c00ddb363285f37a07fc68b08ef7');
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
