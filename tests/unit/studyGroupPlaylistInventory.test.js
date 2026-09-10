import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INVENTORY_PATH = path.join(
  ROOT,
  'reviews/evidence/study-group-2025/playlist_inventory.json',
);

function loadInventory() {
  assert.equal(fs.existsSync(INVENTORY_PATH), true, 'playlist inventory is required');
  return JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
}

test('study-group playlist inventory is a complete, source-grounded manifest', () => {
  const inventory = loadInventory();
  assert.equal(inventory.schema, 'transcriptions/playlist_inventory/v1');
  assert.equal(
    inventory.playlistUrl,
    'https://www.youtube.com/playlist?list=PLlVfdhU37xZCXzlW90v10Y6z8w3Oue0Uh',
  );
  assert.equal(inventory.declaredCount, 44);
  assert.equal(inventory.visibleCount, 44);
  assert.equal(inventory.hiddenOrUnavailableCount, 2);
  assert.equal(inventory.items.length, inventory.declaredCount);
  assert.deepEqual(
    inventory.items.map((item) => item.playlistIndex),
    Array.from({ length: 44 }, (_, index) => index + 1),
  );
});

test('unavailable playlist entries fail closed and are excluded from execution', () => {
  const inventory = loadInventory();
  const unavailable = inventory.items.filter((item) => !item.playable);
  assert.deepEqual(unavailable.map((item) => item.videoId), ['BGruVOFnFhI', '8sDCFUj5E_c']);
  assert.deepEqual(unavailable.map((item) => item.availabilityStatus), ['unavailable', 'unavailable']);
  assert.match(unavailable[0].availabilityDetail, /Video unavailable/i);
  assert.match(unavailable[1].availabilityDetail, /Private video/i);
  assert.equal(inventory.scopeDecision.executableTranscriptScope, 42);
  assert.equal(inventory.scopeDecision.excludedCount, 2);
});

test('normalization never invents lecture numbers for the review-only entry', () => {
  const inventory = loadInventory();
  const review = inventory.items.find((item) => item.videoId === '-m6sV_rS1bU');
  assert.ok(review);
  assert.equal(review.normalized, true);
  assert.equal(review.lecture, null);
  assert.equal(review.segment, null);
  assert.match(review.normalizationNote, /lacks lecture number/i);
});

test('every executable source has a stable YouTube identity and duration', () => {
  const inventory = loadInventory();
  for (const item of inventory.items.filter((entry) => entry.playable)) {
    assert.match(item.videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.match(item.watchUrl, new RegExp(`watch\\?v=${item.videoId}$`));
    assert.equal(typeof item.durationMinutes, 'number');
    assert.ok(item.durationMinutes > 0);
  }
});
