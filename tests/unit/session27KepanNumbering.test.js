import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sessionPath = path.join(ROOT, 'courses/釋量論第二品/sessions/session_27.json');
const tocPath = path.join(ROOT, 'courses/釋量論第二品/toc.json');

test('session_27 文章小標題保留一至九的科判編號', () => {
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const toc = JSON.parse(fs.readFileSync(tocPath, 'utf8'));
  const children = toc.sections.find((section) => section.sessionId === '27').children;
  const headings = session.paragraphs.filter((paragraph) => paragraph.heading).map((paragraph) => paragraph.heading);

  assert.equal(children.length, 9, '第27講應有九個科判節點');
  for (const [index, child] of children.entries()) {
    const number = child.title.slice(0, 2);
    const topic = child.title.slice(2);
    const matches = headings.filter((heading) => heading.includes(`${number}${topic}`));
    assert.ok(matches.length > 0, `文章小標題缺少科判：${child.title}`);
    assert.ok(matches.every((heading) => heading.includes(number)), `科判編號未保留：${child.title}`);
    assert.equal(number, `${['一','二','三','四','五','六','七','八','九'][index]}、`);
  }
});
