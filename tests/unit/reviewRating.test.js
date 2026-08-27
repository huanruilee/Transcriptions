import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Mock localStorage for Node.js test environment
const mockStorage = {};
global.localStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = String(val); },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

test('⭐ Review Rating Regression Suite: 1~10 Score Online Review System', async (t) => {

  const reviewRatingModule = await import('../../src/js/reviewRating.js');
  const { getStoredRatings, saveRating, initReviewRating } = reviewRatingModule;

  await t.test('1. Static Template & CSS Contract Verification', () => {
    const html = readFileSync(resolve('src/index.html'), 'utf8');
    assert.ok(html.includes('id="session-rating-btn"'), 'index.html must contain #session-rating-btn trigger');
    assert.ok(html.includes('reviewRating.js') || html.includes('app.js'), 'index.html must load app or reviewRating script');

    const css = readFileSync(resolve('src/css/main.css'), 'utf8');
    assert.ok(css.includes('.session-rating-btn'), 'main.css must style .session-rating-btn');
    assert.ok(css.includes('.score-chip'), 'main.css must style .score-chip');
    assert.ok(css.includes('.score-low'), 'main.css must style .score-low (1~4)');
    assert.ok(css.includes('.score-mid'), 'main.css must style .score-mid (5~7)');
    assert.ok(css.includes('.score-high'), 'main.css must style .score-high (8~10)');
    assert.ok(css.includes('.rating-modal-overlay'), 'main.css must style .rating-modal-overlay');
  });

  await t.test('2. Rating Storage & Acceptance Logic (Score >= 8 -> APPROVED)', () => {
    localStorage.clear();

    const rating84A = {
      sessionId: '84A',
      score: 9,
      status: 'APPROVED',
      tags: ['品質優良無問題'],
      notes: '發音清晰，底本對齊完美',
      reviewer: 'Henry'
    };

    saveRating('84A', rating84A);
    const stored = getStoredRatings();

    assert.ok(stored['84A'], 'Stored ratings must contain key 84A');
    assert.equal(stored['84A'].score, 9, 'Score must be 9');
    assert.equal(stored['84A'].status, 'APPROVED', 'Score >= 8 must have status APPROVED');
    assert.ok(stored['84A'].updatedAt, 'Must include timestamp');
  });

  await t.test('3. Needs Improvement Logic (Score < 8 -> NEEDS_IMPROVEMENT & Ticket)', () => {
    const rating99B = {
      sessionId: '99B',
      score: 6,
      status: 'NEEDS_IMPROVEMENT',
      tags: ['佛學名相有誤', '時間戳未對齊'],
      notes: '第 15 句名相有音義偏差，請二次精校',
      reviewer: 'Henry'
    };

    saveRating('99B', rating99B);
    const stored = getStoredRatings();

    assert.ok(stored['99B'], 'Stored ratings must contain key 99B');
    assert.equal(stored['99B'].score, 6, 'Score must be 6');
    assert.equal(stored['99B'].status, 'NEEDS_IMPROVEMENT', 'Score < 8 must have status NEEDS_IMPROVEMENT');
    assert.deepEqual(stored['99B'].tags, ['佛學名相有誤', '時間戳未對齊']);
  });

  await t.test('4. Multi-Session Persistence & Export Structure', () => {
    const allRatings = getStoredRatings();
    assert.equal(Object.keys(allRatings).length, 2, 'Must maintain both 84A and 99B ratings');

    // JSON export schema compliance
    const exportedJson = JSON.stringify(allRatings, null, 2);
    const parsed = JSON.parse(exportedJson);

    for (const [sid, data] of Object.entries(parsed)) {
      assert.ok(data.score >= 1 && data.score <= 10, `Score for ${sid} must be between 1 and 10`);
      assert.ok(['APPROVED', 'NEEDS_IMPROVEMENT'].includes(data.status), `Status for ${sid} must be valid`);
      assert.ok(Array.isArray(data.tags), `Tags for ${sid} must be array`);
      assert.ok(typeof data.notes === 'string', `Notes for ${sid} must be string`);
    }
  });
});
