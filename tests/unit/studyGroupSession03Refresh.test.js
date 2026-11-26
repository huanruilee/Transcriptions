import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSession } from '../../scripts/audit_reading_quality.mjs';
import { computeSourceDigest } from '../../scripts/content_overview_pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COURSE = 'courses/2025釋量論第二品大組共學';
const EVIDENCE = 'reviews/evidence/study-group-2025/session03-refresh';
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const loadSession = () => json(`${COURSE}/sessions/session_03.json`);
const flatten = (s) => s.paragraphs.flatMap((p) => p.sentences);
const sources = (s) => s.sourceSentenceIds ?? [s.id];
const normalized = (s) => s.replace(/\s+/gu, '');
const containsSource = (s, id) => sources(s).includes(id);

// Source values come from the fetched official description, not the old question index.
test('session 03 presents the three actual discussion topics at their official chapter boundaries', () => {
  const session = loadSession();
  const official = json(`${EVIDENCE}/official-video.json`);
  assert.equal(session.youtubeVideoId, official.id);
  assert.equal(session.sourceOutlineId, '32-02');
  assert.equal(session.displaySessionId, '2上');
  assert.equal(session.discussionQuestions.length, 3);
  const expected = [425, 5586, 7131];
  const chapters = official.chapters.filter((c) => ['第1題', '第2題', '第3題⑴⑵'].includes(c.title));
  assert.deepEqual(chapters.map((c) => c.start_time), expected);
  assert.deepEqual(session.discussionQuestions.map((q) => q.start), expected);
  for (const q of session.discussionQuestions) {
    assert.match(q.displayQuestion, /？$/u);
    assert.ok(q.teacherSummary.items.length >= 4, `${q.id}: needs substantive teacher guidance`);
  }
  assert.match(session.discussionQuestions[0].displayQuestion, /大象/u);
  assert.match(session.discussionQuestions[1].displayQuestion, /宗.*因/u);
  assert.match(session.discussionQuestions[2].displayQuestion, /解脫/u);
  const toc = json(`${COURSE}/toc.json`);
  const nodes = toc.nodes.filter((n) => n.sessionId === '03');
  assert.equal(nodes.length, 3);
  for (const q of session.discussionQuestions) {
    const node = nodes.find((n) => n.id === q.id);
    assert.ok(node, `missing TOC entry ${q.id}`);
    assert.equal(node.timestamp, q.start);
  }
});

test('teacher summaries start at the real teacher handoffs rather than student debate', () => {
  const session = loadSession();
  const sents = flatten(session);
  const expected = [
    ['seg-0954', 2235.52],
    ['seg-2853', 6304.56],
    ['seg-3555', 7764.92],
  ];
  assert.equal(session.discussionQuestions.length, expected.length);
  session.discussionQuestions.forEach((q, i) => {
    const [sourceId, time] = expected[i];
    const startId = q.teacherTeaching.startSentenceId;
    const start = sents.find((s) => s.id === startId);
    assert.ok(start, `${q.id}: missing teacher start sentence`);
    assert.ok(containsSource(start, sourceId), `${q.id}: teacher start must retain ${sourceId}`);
    assert.ok(start.start <= time && start.end >= time, `${q.id}: teacher timestamp alignment`);
    assert.equal(start.speaker, '如性法師');
  });
  const earlyStudent = sents.find((s) => containsSource(s, 'seg-0380'));
  assert.equal(earlyStudent?.speaker, '學員', 'pre-handoff student debate must not be called teacher guidance');
  const handoff = sents.find((s) => containsSource(s, 'seg-0953'));
  assert.equal(handoff?.speaker, '維那/主持');
});

test('official chapter titles and timestamps remain distinct from natural paragraph starts', () => {
  const official = json(`${EVIDENCE}/official-video.json`);
  const session = loadSession();
  const headings = session.paragraphs.filter((p) => p.heading);
  assert.deepEqual(
    headings.map((p) => [p.heading, p.chapterStart ?? p.start]),
    official.chapters.map((c) => [c.title, c.start_time]),
  );
  for (const p of session.paragraphs) {
    assert.ok(p.sentences.length > 0);
    assert.equal(p.start, p.sentences[0].start);
    assert.equal(p.end, p.sentences.at(-1).end);
    assert.ok(p.sentences.length <= 35, `${p.id}: paragraph exceeds hard limit`);
  }
});

test('refreshed session passes the actual reading-quality gate and overview digest', () => {
  const session = loadSession();
  const report = auditSession(session);
  assert.equal(report.ok, true, JSON.stringify(report.violations));
  assert.equal(session.contentOverview.sourceDigest, computeSourceDigest(session));
  assert.ok(session.contentOverview.mainPoints.length >= 3, 'overview must cover all three units');
  assert.ok(session.contentOverview.mainPoints.some((p) => /解脫/u.test(p.text)), 'late topic missing from overview');
  assert.equal(session._meta.publicationState, 'candidate-review-required');
  assert.notEqual(session.humanListened, true);
  assert.match(session.lastUpdated, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/u);
});

test('raw source survives consolidation with source IDs, original timing, and explicit removals', () => {
  const baseline = json(`${EVIDENCE}/baseline-session.json`);
  const old = new Map(flatten(baseline).map((s) => [s.id, s]));
  const session = loadSession();
  const ledger = json(`${EVIDENCE}/editorial-ledger.json`);
  const covered = new Set();
  for (const s of flatten(session)) {
    if (s.id.startsWith('re-asr-')) {
      assert.ok(s.provenance, `${s.id}: new audio-derived text requires provenance`);
      continue;
    }
    const ids = sources(s);
    const originals = ids.map((id) => {
      assert.ok(old.has(id), `${s.id}: unknown source ${id}`);
      assert.equal(covered.has(id), false, `${id}: source copied into multiple sentences`);
      covered.add(id);
      return old.get(id);
    });
    assert.equal(normalized(s.rawText), normalized(originals.map((x) => x.rawText).join('')));
    assert.equal(s.start, originals[0].start);
    assert.equal(s.end, originals.at(-1).end);
  }
  for (const removed of ledger.removedSentences ?? []) {
    assert.ok(old.has(removed.id));
    assert.equal(covered.has(removed.id), false);
    assert.equal(removed.rawText, old.get(removed.id).rawText);
    assert.ok(removed.reason);
    covered.add(removed.id);
  }
  assert.deepEqual([...covered].sort(), [...old.keys()].sort(), 'baseline source must never disappear silently');
});

test('the concluding qualification belongs to the teacher and unsupported time-zero verse is removed', () => {
  const session = loadSession();
  const sents = flatten(session);
  const conclusion = sents.filter((s) => sources(s).some((id) => {
    const n = Number(id.replace('seg-', ''));
    return n >= 4511 && n <= 4528;
  }));
  assert.ok(conclusion.length > 0);
  assert.ok(conclusion.every((s) => s.speaker === '如性法師'));
  const text = conclusion.map((s) => s.text).join('');
  assert.match(text, /選項[四4⑷]/u);
  assert.match(text, /選項[三3⑶]/u);
  assert.match(text, /沒有辦法|不能|不可以/u);
  assert.match(text, /解脫/u);
  for (const mapping of session.studyScaffolding?.verseMappings ?? []) {
    assert.ok(mapping.time > 0, 'no invented verse at time zero');
    const corresponding = sents.find((s) => s.start === mapping.time);
    assert.ok(corresponding, 'verse time must come from an actual sentence');
  }
});

test('the study guide supplies four learning layers, visible candidate status, and real-time anchors', () => {
  const md = read(`${COURSE}/publications/lecture_02A_study_guide.md`);
  assert.match(md, /待閱校版/u);
  assert.match(md, /AI/u);
  assert.match(md, /課前導讀/u);
  assert.match(md, /名相/u);
  assert.match(md, /學員研討光譜/u);
  assert.match(md, /如性法師核心開示/u);
  assert.match(md, /本題正見定調/u);
  assert.match(md, /法師特別提點/u);
  assert.match(md, /自我檢核/u);
  assert.ok((md.match(/<details>/gu) ?? []).length >= 3, '3-5 self-check cards required');
  assert.doesNotMatch(md, /watch？v=|續寫章節/u);
  const anchors = [...md.matchAll(/\[▶\s*(\d{2,3}):(\d{2})\]\([^\s)]+[#&]t=(\d+(?:\.\d+)?)\)/gu)];
  assert.ok(anchors.length >= 6, 'each core question needs source-linked discussion and teacher guidance');
  const times = anchors.map((a) => Number(a[3]));
  const starts = new Set(flatten(loadSession()).map((s) => Math.floor(s.start)));
  for (const time of times) assert.ok(starts.has(Math.floor(time)), `guide anchor ${time} has no sentence start`);
  assert.ok(Math.max(...times) >= 9902 * 0.7, 'guide omits the later part of the lecture');
  const html = read(`${COURSE}/publications/lecture_02A_study_guide.html`);
  assert.match(html, /verbatim-drawer/u);
  assert.match(html, /待閱校版/u);
});

test('teacher argument about merely retaining a thesis keeps its missing causal reasoning', () => {
  const sentence = flatten(loadSession()).find(s => containsSource(s, 'seg-3075'));
  assert.ok(sentence);
  assert.match(sentence.text, /放在心裡面/u);
  assert.match(sentence.text, /沒有去思考.*因/u);
  assert.match(sentence.text, /很容易轉變為猶豫知/u);
  assert.match(sentence.text, /我們真的認同嗎？/u);
});

test('merging the scripture example retains the teachers explicit negative conclusion', () => {
  const sentence = flatten(loadSession()).find(s => containsSource(s, 'seg-1441'));
  assert.ok(sentence);
  assert.match(sentence.text, /這個也沒有辦法/u);
});
