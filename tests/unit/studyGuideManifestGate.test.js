import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COURSES = fs.readdirSync(path.join(ROOT, 'courses')).filter((d) =>
  fs.existsSync(path.join(ROOT, 'courses', d, 'course.json')),
);

test('every course.json declares a studyGuides manifest matching existing publication assets', () => {
  for (const dir of COURSES) {
    const course = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses', dir, 'course.json'), 'utf8'));
    assert.ok(Array.isArray(course.studyGuides), `${dir}: course.json must declare studyGuides (may be [])`);
    for (const page of course.studyGuides) {
      assert.ok(/^[A-Za-z0-9._/-]+_study_guide\.html$/.test(page), `${dir}: bad manifest entry ${page}`);
      assert.ok(
        fs.existsSync(path.join(ROOT, 'courses', dir, page)),
        `${dir}: studyGuides manifest references missing asset ${page}`,
      );
    }
  }
});

test('courses without study-guide publications declare an empty manifest (no 404 iframe fallback)', () => {
  for (const dir of ['四念住', '三主要道', '菩薩就是這樣成佛']) {
    const course = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses', dir, 'course.json'), 'utf8'));
    assert.deepEqual(course.studyGuides, [], `${dir} must declare studyGuides: []`);
  }
});

test('App.vue gates study-guide URL/button/drawer on the manifest (static contract)', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  assert.match(app, /currentCourseStudyGuides/);
  assert.match(app, /Array\.isArray\(manifest\)[\s\S]{0,80}return '';/);
  assert.match(app, /id="toggle-study-guide-btn"\s*\n\s*v-if="currentStudyGuideUrl"/);
  assert.match(app, /function toggleStudyGuideDrawer\(\)\s*\{\s*\n\s*if \(!currentStudyGuideUrl\.value\) return;/);
});
