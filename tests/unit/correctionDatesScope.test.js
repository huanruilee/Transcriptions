import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function courseDirs() {
  const coursesRoot = path.join(repoRoot, 'courses');
  return fs.readdirSync(coursesRoot)
    .map((name) => path.join(coursesRoot, name))
    .filter((dir) => fs.existsSync(path.join(dir, 'course.json')));
}

test('correction-dates pages list only sessions that have a real transcript file', () => {
  for (const dir of courseDirs()) {
    const htmlPath = path.join(dir, 'correction-dates.html');
    if (!fs.existsSync(htmlPath)) continue;

    const course = readJson(path.join(dir, 'course.json'));
    const html = fs.readFileSync(htmlPath, 'utf8');
    const sessionsDir = path.join(dir, 'sessions');
    const pending = new Set((course.pendingSessions || []).map((s) => String(s.sessionId)));

    // pendingSessions 只是待製作的骨架。若把它們列進「正式逐字稿記錄日期」，
    // 讀者會誤以為已存在逐字稿，卻看到「未記錄／無有效日期欄位」。
    for (const sessionId of pending) {
      const hasTranscript = fs.existsSync(path.join(sessionsDir, `session_${sessionId}.json`));
      if (hasTranscript) continue;
      assert.ok(
        !html.includes(`#session-${sessionId}"`),
        `${course.courseId}: pending session ${sessionId} has no transcript file but appears in correction-dates.html`,
      );
    }
  }
});

test('the 三主要道 correction-dates page covers only the delivered lecture', () => {
  const dir = path.join(repoRoot, 'courses', '三主要道');
  const html = fs.readFileSync(path.join(dir, 'correction-dates.html'), 'utf8');
  const course = readJson(path.join(dir, 'course.json'));

  assert.equal(course.sessions.length, 1);
  assert.ok(html.includes('共 1 講'), 'the page must report the number of lectures with transcripts');
  assert.ok(!html.includes('#session-02"'), 'pending lectures must not be listed');
});
