/**
 * tests/unit/webReviewMarkers.test.js
 * Verification of Web UI Review Confirmation Contract:
 * 1. Has review-needed CSS classes (.has-review-needed, .sentence-review-badge)
 * 2. Sentence DOM rendering attaches review badge when reviewNeeded is true
 * 3. Modal displays AI uncertainty callout banner
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');

test('🔍 Web UI Review Confirmation Markers Contract', (t) => {
  const cssPath = path.join(PROJECT_ROOT, 'src', 'css', 'main.css');
  const appJsPath = path.join(PROJECT_ROOT, 'src', 'js', 'app.js');
  const annotationJsPath = path.join(PROJECT_ROOT, 'src', 'js', 'annotation.js');

  assert.ok(existsSync(cssPath), 'main.css must exist');
  assert.ok(existsSync(appJsPath), 'app.js must exist');
  assert.ok(existsSync(annotationJsPath), 'annotation.js must exist');

  const css = readFileSync(cssPath, 'utf8');
  const appJs = readFileSync(appJsPath, 'utf8');
  const annotationJs = readFileSync(annotationJsPath, 'utf8');

  // 1. CSS styles exist
  assert.ok(css.includes('.sentence.has-review-needed'), 'Must define .sentence.has-review-needed style');
  assert.ok(css.includes('.sentence-review-badge'), 'Must define .sentence-review-badge style');

  // 2. app.js renders review badge
  assert.ok(appJs.includes('has-review-needed'), 'app.js must check and apply has-review-needed class');
  assert.ok(appJs.includes('sentence-review-badge'), 'app.js must render sentence-review-badge');
  assert.ok(appJs.includes('🔍 待核定'), 'app.js must show 🔍 待核定 badge text');

  // 3. annotation.js shows AI review banner
  assert.ok(annotationJs.includes('review-needed-callout'), 'annotation.js must include review-needed-callout banner');
  assert.ok(annotationJs.includes('AI 大模型存疑提示（待人工聽音核定）'), 'annotation.js must include review prompt title');
});
