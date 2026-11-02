import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../src/App.vue', import.meta.url), 'utf8');
test('Mini Player hides without suspending the YouTube iframe', () => {
  const css = source.match(/\.audio-only-hidden\s*\{([^}]+)\}/)?.[1] || '';
  for (const value of ['opacity: 0 !important', 'pointer-events: none !important', 'width: 1px !important', 'height: 1px !important', 'overflow: hidden !important']) assert.ok(css.includes(value), value);
  assert.doesNotMatch(css, /display\s*:|visibility\s*:/);
});
test('Mini Player desktop docking reserves a lane outside the reader', () => {
  assert.match(source, /@media \(min-width: 1025px\)/);
  assert.match(source, /\.youtube-player-container\.is-floating\.dock-bottom-left/);
  assert.match(source, /\.mini-player-docked \.main-reader/);
});
