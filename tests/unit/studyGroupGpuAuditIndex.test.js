import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Study-group GPU audit index — future contract (RED).
 *
 * The GPU-assisted audit pass over the 42 playable candidate sessions will
 * emit reviews/evidence/study-group-2025/sample_audit_index.json. This test
 * pins that file's contract BEFORE the index exists, so the generator must
 * conform to it and cannot retroactively define its own shape.
 *
 * Contract (study-group-gpu-audit-index/v1):
 *   - schema: 'study-group-gpu-audit-index/v1'
 *   - exactly 42 sessions
 *   - every session carries exactly five role records
 *     (opening, middle, ending, question, teacher-summary)
 *   - hash-only: every role record must carry a sha256 hex digest
 *   - privacy: the index must NOT embed any transcript-bearing payload.
 *     Keys 'text', 'rawText', 'transcript', 'audioPath', 'caption', and
 *     'rawAsr' are recursively forbidden anywhere in the document.
 *
 * This test is expected to fail (RED) until sample_audit_index.json exists.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INDEX_PATH = path.join(ROOT, 'reviews/evidence/study-group-2025/sample_audit_index.json');
const ROLES = ['opening', 'middle', 'ending', 'question', 'teacher-summary'];
const FORBIDDEN_KEYS = ['text', 'rawText', 'transcript', 'audioPath', 'caption', 'rawAsr'];

function loadIndex() {
  assert.equal(
    fs.existsSync(INDEX_PATH),
    true,
    'audit index is missing: generate reviews/evidence/study-group-2025/sample_audit_index.json conforming to study-group-gpu-audit-index/v1',
  );
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
}

function forbiddenKeyHits(node, trail, found) {
  if (Array.isArray(node)) {
    node.forEach((value, index) => forbiddenKeyHits(value, `${trail}[${index}]`, found));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_KEYS.includes(key)) found.push(`${trail}.${key}`);
      forbiddenKeyHits(value, `${trail}.${key}`, found);
    }
  }
  return found;
}

test('study-group GPU audit index satisfies study-group-gpu-audit-index/v1 contract', () => {
  const index = loadIndex();

  // 1. Schema identity
  assert.equal(index.schema, 'study-group-gpu-audit-index/v1');

  // 2. Coverage: exactly 42 sessions
  assert.ok(Array.isArray(index.sessions), 'index.sessions must be an array');
  assert.equal(index.sessions.length, 42, 'audit index must cover exactly the 42 candidate sessions');

  // 3. Role records: exactly the five audit roles per session, each hash-only
  const seenVideoIds = new Set();
  for (const session of index.sessions) {
    assert.equal(
      typeof session.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(session.videoId),
      true,
      `session ${JSON.stringify(session.videoId)} must carry an 11-char videoId`,
    );
    assert.equal(seenVideoIds.has(session.videoId), false, `duplicate videoId ${session.videoId}`);
    seenVideoIds.add(session.videoId);

    assert.ok(Array.isArray(session.roles), `session ${session.videoId}.roles must be an array`);
    assert.equal(session.roles.length, 5, `session ${session.videoId} must have exactly five role records`);
    const roleNames = session.roles.map((record) => record.role).sort();
    assert.deepEqual(roleNames, [...ROLES].sort(), `session ${session.videoId} roles must be the five audit roles`);

    for (const record of session.roles) {
      assert.match(
        String(record.sha256),
        /^[0-9a-f]{64}$/,
        `session ${session.videoId} role "${record.role}" must be hash-only (64-hex sha256)`,
      );
    }
  }

  // 4. Hash-only privacy: no transcript-bearing payload anywhere in the document
  const hits = forbiddenKeyHits(index, '$', []);
  assert.deepEqual(hits, [], `audit index must be hash-only; forbidden keys found: ${hits.join(', ')}`);
});
