import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

test('Multi-Course Catalog: courses/catalog.json exists and is valid', () => {
  const catalogPath = path.join(ROOT, 'courses', 'catalog.json');
  assert.ok(fs.existsSync(catalogPath), 'courses/catalog.json must exist');

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.ok(catalog.defaultCourseId, 'defaultCourseId must be defined');
  assert.ok(Array.isArray(catalog.courses), 'courses must be an array');
  assert.ok(catalog.courses.length >= 1, 'at least one course must be registered');

  const defaultCourse = catalog.courses.find(c => c.id === catalog.defaultCourseId || c.title === catalog.defaultCourseId);
  assert.ok(defaultCourse, 'default course must be in the courses list');
  assert.ok(defaultCourse.title, 'default course must have a title');
  assert.ok(defaultCourse.path, 'default course must have a path');
  assert.equal(defaultCourse.master, '見悲青增格西', 'default course lecturer/master must be 見悲青增格西');

  const courseDir = path.join(ROOT, defaultCourse.path);
  assert.ok(fs.existsSync(courseDir), 'default course path must exist on disk');
  assert.ok(fs.existsSync(path.join(courseDir, 'course.json')), 'course.json must exist in course directory');
  assert.ok(fs.existsSync(path.join(courseDir, 'toc.json')), 'toc.json must exist in course directory');
  assert.ok(fs.existsSync(path.join(courseDir, 'audio_map.json')), 'audio_map.json must exist in course directory');
});

test('Multi-Course Catalog: UI elements and app.js contract', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8');
  assert.match(indexHtml, /id="course-select"/, 'index.html must contain #course-select');
  assert.match(indexHtml, /class="course-selector-container"/, 'index.html must have course-selector-container');

  const appJs = fs.readFileSync(path.join(ROOT, 'src', 'js', 'app.js'), 'utf8');
  assert.match(appJs, /catalog\.json/, 'app.js must fetch catalog.json');
  assert.match(appJs, /parseHashRoute/, 'app.js must support hash route parsing');
  assert.match(appJs, /switchSession\(target\)/, 'app.js must maintain backward-compatible session switching');
});

test('Multi-Course Catalog: scripts/init_course.py correctly scaffolds new course', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-init-test-'));
  try {
    const cmd = `python3 scripts/init_course.py --id "test-course" --title "測試課程" --master "見悲青增格西" --base-dir "${tmpDir}"`;
    execSync(cmd, { cwd: ROOT, stdio: 'pipe' });

    const newCourseDir = path.join(tmpDir, 'courses', '測試課程');
    assert.ok(fs.existsSync(newCourseDir), 'new course directory must be created');
    assert.ok(fs.existsSync(path.join(newCourseDir, 'course.json')), 'course.json must be generated');
    assert.ok(fs.existsSync(path.join(newCourseDir, 'audio_map.json')), 'audio_map.json must be generated');
    assert.ok(fs.existsSync(path.join(newCourseDir, 'toc.json')), 'toc.json must be generated');
    assert.ok(fs.existsSync(path.join(newCourseDir, 'learned_corrections.json')), 'learned_corrections.json must be generated');
    assert.ok(fs.existsSync(path.join(newCourseDir, 'sessions')), 'sessions/ must be generated');
    assert.ok(fs.existsSync(path.join(newCourseDir, 'source_text')), 'source_text/ must be generated');

    const catFile = path.join(tmpDir, 'courses', 'catalog.json');
    assert.ok(fs.existsSync(catFile), 'catalog.json must be generated/updated in temp dir');
    const catData = JSON.parse(fs.readFileSync(catFile, 'utf8'));
    const reg = catData.courses.find(c => c.id === 'test-course');
    assert.ok(reg, 'test-course must be registered in catalog.json');
    assert.equal(reg.master, '見悲青增格西');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
