import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * 朝聖前行課程（2026 印度朝聖前行課程，如性法師）專屬 gate。
 *
 * 本課程形狀：官方整編校稿（5 講）＋ ASR 時間碼 ＋ 結行節（無逐字底本，ASR-primary）。
 * 所有斷言都以「磁碟上的實檔」為準，不從單一來源自我推導。
 */

const ROOT = process.cwd();
const COURSE_DIR = path.join(ROOT, 'courses', '朝聖前行課程');
const EVIDENCE_DIR = path.join(ROOT, 'reviews', 'evidence', '朝聖前行課程');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const SESSION_IDS = ['01', '02', '03', '04', '05', '06'];
const AUDIO_BASE = 'https://gx10-2887.tail378c21.ts.net/audio/chaosheng-qianxing-2026';

test('朝聖前行課程音檔只存 gx10 自托管，repo 內不得出現 mp3', () => {
  const audioMap = readJson(path.join(COURSE_DIR, 'audio_map.json'));
  const entries = Object.entries(audioMap);
  assert.deepEqual(entries.map(([k]) => k).sort(), SESSION_IDS);
  for (const [id, url] of entries) {
    assert.equal(typeof url, 'string', `${id} 的 value 必須是 URL 字串（app.js 直接當字串用）`);
    assert.equal(url, `${AUDIO_BASE}/CSQX_${id}.mp3`);
  }
  const tracked = fs.readdirSync(COURSE_DIR, { recursive: true })
    .filter((f) => String(f).toLowerCase().endsWith('.mp3'));
  assert.deepEqual(tracked, [], 'repo 內不得有 mp3');
});

test('course.json / toc.json 登記 6 節（五講＋結行）且維持待閱校', () => {
  const course = readJson(path.join(COURSE_DIR, 'course.json'));
  assert.equal(course.courseId, 'chao-sheng-qian-xing-2026');
  assert.equal(course.master, '如性法師');
  assert.equal(course.totalSessions, 6);
  assert.equal(course.sessions.length, 6);
  assert.deepEqual(course.sessions.map((s) => s.sessionId), SESSION_IDS);

  // 結行是結行，不是第六講
  const closing = course.sessions.find((s) => s.sessionId === '06');
  assert.equal(closing.title, '結行指導與問答');
  assert.equal(closing.sessionKind, 'closing');
  assert.ok(!/第\s*6\s*講|第六講/.test(closing.title));

  assert.equal(course.publicationState, 'candidate-review-required');
  assert.equal(course.qualityReview.humanProofread, false);
  assert.notEqual(course.qualityReview.humanListened, true);
  assert.ok(Array.isArray(course.studyGuides));

  const toc = readJson(path.join(COURSE_DIR, 'toc.json'));
  assert.equal(toc.sections.length, 6, 'toc 必須與 course.json 同為 6 節（含結行）');
  assert.deepEqual(toc.sections.map((s) => s.sessionId), SESSION_IDS);
  for (const section of toc.sections) {
    assert.equal(section.sessionRef, `courses/朝聖前行課程/sessions/session_${section.sessionId}.json`);
    assert.equal(section.available, true);
  }

  // 三處 sessionId 契約一致性：course.json / toc.json / audio_map.json
  const audioMap = readJson(path.join(COURSE_DIR, 'audio_map.json'));
  assert.deepEqual(Object.keys(audioMap).sort(), course.sessions.map((s) => s.sessionId).sort());
});

test('磁碟上的 session 檔數與 course.json 宣告一致（跨來源一致性，非自我推導）', () => {
  const course = readJson(path.join(COURSE_DIR, 'course.json'));
  const onDisk = fs.readdirSync(path.join(COURSE_DIR, 'sessions'))
    .filter((f) => /^session_\d+\.json$/.test(f))
    .sort();
  assert.deepEqual(onDisk, course.sessions.map((s) => `session_${s.sessionId}.json`).sort());
});

test('grounding.json 完整，且 reference inventory 的 local_path/sha256 與實檔相符', () => {
  const g = readJson(path.join(COURSE_DIR, 'grounding.json'));
  assert.equal(g.courseId, 'chao-sheng-qian-xing-2026');
  assert.ok(g.verified_at);
  assert.ok(Array.isArray(g.high_frequency_doctrinal_terms) && g.high_frequency_doctrinal_terms.length > 0);
  for (const term of g.high_frequency_doctrinal_terms) assert.ok(term.term, 'term 缺 term 欄位');
  assert.ok(Array.isArray(g.reference_materials) && g.reference_materials.length > 0);

  const inventory = path.join(EVIDENCE_DIR, 'reference', 'README.md');
  assert.ok(fs.existsSync(inventory), '缺少 reference/README.md');

  const edited = g.reference_materials.filter((r) => r.type === 'edited-text-reference');
  assert.ok(edited.length >= 6, '應有 5 份三校稿＋1 份結行紀要');

  for (const ref of g.reference_materials) {
    assert.ok(ref.referenceId, 'reference 缺 referenceId');
    assert.ok(ref.retrieved_at, `${ref.referenceId} 缺 retrieved_at`);
    assert.ok(ref.url || ref.local_path, `${ref.referenceId} 缺 url/local_path`);
    const localPath = ref.local_path;
    if (!localPath) continue;
    const abs = path.join(ROOT, localPath);
    assert.ok(fs.existsSync(abs), `${ref.referenceId} 的 local_path 不存在：${localPath}`);
    assert.ok(ref.sha256, `${ref.referenceId} 缺 sha256`);
    assert.equal(sha256(abs), ref.sha256, `${ref.referenceId} 的 sha256 與實檔不符`);
  }
});

test('底本清理後不得殘留校稿者的編輯指令標記（白名單外【】允許保留）', () => {
  const pendingPath = path.join(EVIDENCE_DIR, 'work', 'pending_confirmations.json');
  assert.ok(fs.existsSync(pendingPath), '缺少 work/pending_confirmations.json');
  const pending = readJson(pendingPath);
  assert.ok(Array.isArray(pending.items) && pending.items.length > 0);

  const editorial = /再麻煩確認|請確認|抱歉.{0,12}干擾|未補錄|前面說|念.{1,3}聲|讀音/;
  for (const id of SESSION_IDS.slice(0, 5)) {
    const text = fs.readFileSync(path.join(COURSE_DIR, 'source_text', `lecture_${id}.txt`), 'utf8');
    for (const marker of text.match(/【[^】]*】/g) || []) {
      assert.ok(!editorial.test(marker), `lecture_${id} 正文殘留編輯指令標記：${marker}`);
    }
  }
});
