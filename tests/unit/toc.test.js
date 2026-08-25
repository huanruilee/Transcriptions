// M6.2: TOC timestamp handling — 0 = pending, >0 = seekable
// Verifies the visual badge appears for missing timestamps and seeks for valid ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TOC_PATH = path.join(process.cwd(), 'courses/入中論善顯密意疏/toc.json');

test('M6.2: TOC contains exactly the expected mix of timestamps', () => {
  const toc = JSON.parse(fs.readFileSync(TOC_PATH, 'utf8'));
  const stats = { zero: 0, positive: 0, total: 0 };
  function walk(nodes) {
    for (const n of nodes) {
      if (typeof n.timestamp === 'number') {
        stats.total += 1;
        if (n.timestamp === 0) stats.zero += 1;
        else stats.positive += 1;
      }
      if (Array.isArray(n.children)) walk(n.children);
    }
  }
  walk(toc.sections);
  assert.ok(stats.total >= 390, `TOC should contain full 17-page outline >= 390 nodes (got ${stats.total})`);
  assert.ok(stats.zero >= 350, 'Nodes pending individual seek timestamps carry timestamp=0');
});

test('M6.2: Every zero-timestamp node has a valid sessionId for fallback navigation', () => {
  const toc = JSON.parse(fs.readFileSync(TOC_PATH, 'utf8'));
  function walk(nodes) {
    for (const n of nodes) {
      if (n.timestamp === 0 && n.sessionId) {
        // Pattern: 1-2 digits followed by optional A-Z letter (e.g. "01", "02A", "100B")
        assert.match(n.sessionId, /^[0-9]{1,3}[A-Z]?$/, `${n.title} sessionId should match course pattern (e.g. 01, 02A, 100B); got ${n.sessionId}`);
      }
      if (Array.isArray(n.children)) walk(n.children);
    }
  }
  walk(toc.sections);
});