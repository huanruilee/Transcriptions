import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');

test('published and approved transcript states have explicit reader labels', () => {
  assert.match(APP, /approved:\s*['\"].*已校勘核定/);
  assert.match(APP, /published:\s*['\"].*已發布/);
});

test('candidate transcript states remain visibly distinct from approved content', () => {
  assert.match(APP, /candidate:\s*['\"].*候選稿/);
  assert.match(APP, /['\"]review-ready['\"]:\s*['\"].*待審閱/);
});
