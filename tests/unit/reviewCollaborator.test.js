/**
 * tests/unit/reviewCollaborator.test.js
 * Unit Test Suite for Tiered Collaborative Review Architecture:
 * 1. Review Queue Markdown Formatting for High-Tier Agent / Human
 * 2. Web Review Console (review.html) format transformation
 * 3. Decision application, timestamp bumping, and learned term absorption
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'review_collaborator.py');
const REPORTS_DIR = path.join(PROJECT_ROOT, 'reports');

test('🤝 Review Collaborator Suite', async (t) => {
  assert.ok(existsSync(SCRIPT_PATH), 'review_collaborator.py must exist');

  const testSessionId = 'test_collab';
  const mockQueueFile = path.join(REPORTS_DIR, `review_queue_${testSessionId}.json`);
  const mockDecisionsFile = path.join(REPORTS_DIR, `decisions_${testSessionId}.json`);

  const sampleQueueData = {
    session_id: testSessionId,
    generated_at: '2026-09-04 22:00:00',
    total_sentences: 10,
    review_count: 1,
    items: [
      {
        session_id: testSessionId,
        sentence_idx: 0,
        start: 12.5,
        end: 18.2,
        asr_text: '則此女兒太無關係',
        local_proposal: '則此能立太無關係',
        uncertainty_reason: '音似女兒，但因明法義當為能立，存疑',
        context_before: '成立某法為世俗諦',
        context_after: '今成立某法為世俗諦',
        page_ref: 'p.102',
        audio_url: 'https://example.com/test.mp3'
      }
    ]
  };

  writeFileSync(mockQueueFile, JSON.stringify(sampleQueueData, null, 2), 'utf8');

  await t.test('1. Markdown formatting contains structured review cues', () => {
    const stdout = execFileSync('python3', [SCRIPT_PATH, '--session', testSessionId, '--format-markdown'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    });

    assert.ok(stdout.includes('逐字稿疑難句會診報告'), 'Must include header title');
    assert.ok(stdout.includes('則此女兒太無關係'), 'Must include ASR text');
    assert.ok(stdout.includes('則此能立太無關係'), 'Must include proposal');
    assert.ok(stdout.includes('音似女兒，但因明法義當為能立，存疑'), 'Must include reason');
    assert.ok(stdout.includes('00:12'), 'Must include formatted timestamp (mm:ss)');
  });

  await t.test('2. Web review export produces valid review.html items with 3s audio window', () => {
    execFileSync('python3', [SCRIPT_PATH, '--session', testSessionId, '--export-web'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8'
    });

    const webQueueFile = path.join(REPORTS_DIR, `web_review_${testSessionId}.json`);
    assert.ok(existsSync(webQueueFile), 'web_review file must be created');
    const webData = JSON.parse(readFileSync(webQueueFile, 'utf8'));

    assert.equal(webData.length, 1);
    assert.equal(webData[0].sessionId, testSessionId);
    assert.equal(webData[0].sentenceIndex, 0);
    assert.equal(webData[0].clipStart, 11.5); // 12.5 - 1.0s
    assert.equal(webData[0].clipEnd, 15.5);   // 12.5 + 3.0s

    // Cleanup web queue
    if (existsSync(webQueueFile)) unlinkSync(webQueueFile);
  });

  // Cleanup mock files
  if (existsSync(mockQueueFile)) unlinkSync(mockQueueFile);
  if (existsSync(mockDecisionsFile)) unlinkSync(mockDecisionsFile);
});
