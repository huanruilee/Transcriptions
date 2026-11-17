/**
 * 四念住閱讀體驗改進契约测试（2026-11-17）:
 * 1. term_annotations.json 品質（term 必須真實出現在課程文本）
 * 2. 術語 tooltip UI 契約（App.vue 載入/包裝/CSS）
 * 3. 審校標顯示開關契約（按鈕/localStorage/CSS）
 * 4. 本講引用經論清單契約（引號擷取/Overview 渲染）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('四念住 term_annotations.json 結構與術語 grounding', () => {
  const data = JSON.parse(read('courses/四念住/term_annotations.json'));
  assert.ok(Array.isArray(data.terms) && data.terms.length >= 12);
  const courseText = [];
  for (let i = 1; i <= 8; i++) {
    const d = JSON.parse(read(`courses/四念住/sessions/session_${String(i).padStart(2, '0')}.json`));
    for (const p of d.paragraphs) for (const s of p.sentences) courseText.push(s.text || '');
  }
  const text = courseText.join(' ');
  const bad = [];
  for (const t of data.terms) {
    assert.ok(typeof t.term === 'string' && t.term.length >= 2, 'term shape');
    assert.ok(typeof t.definition === 'string' && t.definition.length >= 8, `${t.term} definition shape`);
    if (!text.includes(t.term)) bad.push(t.term);
  }
  assert.deepEqual(bad, [], 'terms not present in course text: ' + bad.join(','));
  const simplified = data.terms.filter((t) => /[与帯简习练应观实义乱]./.test(t.definition));
  assert.deepEqual(simplified.map((t) => t.term), [], 'definitions must be Traditional Chinese');
});

test('術語 tooltip UI 契約 (App.vue + main.css)', () => {
  const app = read('src/App.vue');
  assert.ok(app.includes('term_annotations.json'), 'App.vue loads term_annotations.json');
  assert.ok(app.includes('wrapTermSegments'), 'App.vue wraps term segments');
  assert.ok(app.includes("'term-tip': segment.isTerm"), 'term spans get term-tip class');
  assert.ok(app.includes('segment.isTerm ? segment.termDef'), 'term spans carry definition in title');
  const css = read('src/css/main.css');
  assert.ok(/\.term-tip\s*{/.test(css), 'term-tip CSS exists');
});

test('審校標顯示開關契約 (App.vue + main.css)', () => {
  const app = read('src/App.vue');
  assert.ok(app.includes('review-badges-toggle-btn'), 'toggle button exists');
  assert.ok(app.includes("localStorage.setItem('transcriptions:showReviewBadges'"), 'toggle persists');
  assert.ok(app.includes("classList.toggle('review-badges-hidden'"), 'html class toggled');
  const css = read('src/css/main.css');
  assert.ok(css.includes('.review-badges-hidden .sentence-review-badge.sentence-review-badge'), 'hide rule exists with doubled class to beat scoped-style specificity');
  assert.match(css, /\.review-badges-hidden \.sentence-review-badge\.sentence-review-badge\s*{\s*display:\s*none/, 'hide rule sets display:none');
  assert.match(app, /\.review-badges-hidden \.sentence-review-badge\s*{\s*display:\s*none/, 'hide rule also lives in App.vue scoped block (V2 bundles component styles only)');
});

test('本講引用經論清單契約 (App.vue + TranscriptOverview.vue)', () => {
  const app = read('src/App.vue');
  assert.ok(app.includes('sessionCitations'), 'citations computed exists');
  assert.ok(app.includes(':citations="sessionCitations"'), 'citations passed to overview');
  assert.ok(app.includes('matchAll(/《([^《》'), 'citations extracted from 《》 quotes');
  const ov = read('src/components/TranscriptOverview.vue');
  assert.ok(ov.includes('data-testid="overview-citations"'), 'citations group rendered');
  assert.ok(ov.includes('citations?: Array'), 'citations prop optional with default');
});
