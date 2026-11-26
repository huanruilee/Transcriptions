import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { computeSessionMetrics } from '../../scripts/check_session.mjs';

const ROOT = process.cwd();
const LEGACY_PUBLISHED_DEBT_ALLOWLIST = new Set(['san-zhu-yao-dao']);

test('check:session CLI returns concise JSON schema and passing metrics for jin-gang-jing-1999 01', () => {
  const stdout = execFileSync('node', ['scripts/check_session.mjs', 'jin-gang-jing-1999', '01'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const lineCount = stdout.trim().split('\n').length;
  assert.ok(lineCount <= 20, `Expected <= 20 lines, got ${lineCount}`);

  const summary = JSON.parse(stdout);
  assert.equal(summary.courseId, 'jin-gang-jing-1999');
  assert.equal(summary.sessionFile, 'courses/金剛般若波羅蜜經/sessions/session_01.json');
  assert.equal(summary.hasGrounding, true);
  assert.equal(summary.hasCourseGuide, true);
  assert.ok(summary.noEndPunctPct < 5, `noEndPunctPct=${summary.noEndPunctPct}`);
  assert.ok(summary.shortFragmentPct < 2, `shortFragmentPct=${summary.shortFragmentPct}`);
  assert.ok(summary.paraSents.max <= 35, `paraSents.max=${summary.paraSents.max}`);
  assert.ok(Array.isArray(summary.relatedFiles));
  assert.ok('rawTextDiffCount' in summary);
  assert.ok(summary.qualityFlags && Array.isArray(summary.qualityFlags.speakers));
  assert.equal(summary.qualityFlags.emptyParas, 0);
  assert.equal(summary.qualityFlags.missingParaIds, 0);
  assert.equal(summary.qualityFlags.simplifiedChars, 0);
});

test('computeSessionMetrics qualityFlags catches emptyParas, missingParaIds, missingReviewNeeded, and simplifiedChars', () => {
  const m = computeSessionMetrics({
    paragraphs: [
      { paragraphId: 'p_0001', speaker: '學員1', sentences: [{ id: 's1', text: '这是测试。' }] },
      { id: 'p_0002', speaker: '如性法師', sentences: [] },
    ],
    discussionQuestions: [{ displayQuestion: '为何说不是瞋心？' }],
  });
  assert.deepEqual(m.qualityFlags.speakers, ['如性法師', '學員1']);
  assert.equal(m.qualityFlags.emptyParas, 1);
  assert.equal(m.qualityFlags.missingParaIds, 1);
  assert.equal(m.qualityFlags.missingReviewNeeded, 1);
  assert.equal(m.qualityFlags.simplifiedChars, 3);
});

test('publicationState honesty gate: published courses outside legacy debt allowlist meet reading quality thresholds', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses/catalog.json'), 'utf8'));
  for (const course of catalog.courses || []) {
    if (course.publicationState !== 'published') continue;
    if (LEGACY_PUBLISHED_DEBT_ALLOWLIST.has(course.id)) continue;

    const sessionsDir = path.join(ROOT, course.path, 'sessions');
    const files = fs.readdirSync(sessionsDir).filter(f => /^session_.*\.json$/.test(f));
    assert.ok(files.length > 0, `Published course ${course.id} has no sessions`);

    for (const file of files) {
      const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
      const m = computeSessionMetrics(session);
      assert.ok(m.noEndPunctPct < 5, `${course.id}/${file}: noEndPunctPct=${m.noEndPunctPct}`);
      assert.ok(m.shortFragmentPct < 2, `${course.id}/${file}: shortFragmentPct=${m.shortFragmentPct}`);
      assert.ok(m.paraSents.max <= 35, `${course.id}/${file}: paraSents.max=${m.paraSents.max}`);
    }
  }
});
