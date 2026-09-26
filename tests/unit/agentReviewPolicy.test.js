import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COURSE = path.join(ROOT, 'courses/四念住');
const SESSION_IDS = Array.from({ length: 8 }, (_, i) => `session_${String(i + 1).padStart(2, '0')}`);

test('四念住 Agent review leaves only unresolved uncertainty markers', () => {
  let total = 0;
  let uncertain = 0;
  for (const id of SESSION_IDS) {
    const data = JSON.parse(fs.readFileSync(path.join(COURSE, 'sessions', `${id}.json`), 'utf8'));
    assert.equal(data._meta?.reviewPolicy, 'agent-uncertainty-only', id);
    assert.equal(data._meta?.agentReviewStatus, 'completed', id);
    const sentences = data.paragraphs.flatMap((p) => p.sentences || []);
    const pending = sentences.filter((s) => s.agentReviewStatus === 'uncertain');
    assert.equal(pending.length, data._meta.agentReviewUncertainSentences, id);
    assert.ok(sentences.every((s) => s.agentReviewStatus === 'reviewed' || s.agentReviewStatus === 'uncertain'), id);
    assert.ok(sentences.filter((s) => s.agentReviewStatus === 'reviewed').every((s) => !s.reviewNeeded), id);
    assert.ok(pending.every((s) => s.reviewNeeded === true && s.uncertainty), id);
    assert.ok(pending.every((s) => s.humanReviewNeeded === true), id);
    total += sentences.length;
    uncertain += pending.length;
  }
  assert.ok(total > 0);
  assert.ok(uncertain > 0);
});

test('Vue review UI exposes Agent summary instead of implying every sentence is pending', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  assert.match(app, /agent-review-summary/);
  assert.match(app, /currentAgentReviewedCount/);
  assert.match(app, /currentAgentUncertainCount/);
  assert.match(app, /仍需人工判定/);
});
