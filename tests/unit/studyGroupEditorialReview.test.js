import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_DIR = 'reviews/evidence/study-group-2025/playlist-01';
const AUDIT_DIR = path.join(ROOT, EVIDENCE_DIR, 'editorial-audit');
const REFINEMENT_PATH = path.join(AUDIT_DIR, 'refinement_evidence.json');
const MANIFEST_PATH = path.join(ROOT, EVIDENCE_DIR, 'acceptance-prep/input_manifest.json');
const PRIVATE_DIR = '/home/henry/.gx10/tasks/study-group-session01-gpu-anchors-20260916/evidence';

const BASELINE_COMMIT = 'b69d71fde25f52f86fafb4bd0e89a77ab4fa33f7';
const TASK_HEAD_COMMIT = '28748fbd9021ffb5b73a326606af749f13c79327';
const MANIFEST_SHA256 = 'f63497d0508ed4f4623d75bd7edeb0cbbf58da79f9fafb886f12b9f4f2014a9c';
const EXPECTED_ROLES = ['ending', 'middle', 'opening', 'question', 'teacher-summary'];
const EXPECTED_VERDICTS = new Set(['CONFIRMED', 'LIKELY', 'UNCERTAIN']);
const HEX64 = /^[0-9a-f]{64}$/;

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sha256Text = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// Recursively assert that no node carries raw transcript content under a
// transcript-bearing key. Evidence records carry hashes only.
function assertNoRawTranscript(node, seen = new WeakSet()) {
  if (node === null || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  const RAW_KEYS = new Set(['text', 'rawText', 'raw_text', 'transcript', 'asrText', 'asr_text',
    'audioText', 'audio_text', 'publishedText', 'published_text']);
  for (const [key, value] of Object.entries(node)) {
    if (RAW_KEYS.has(key)) {
      assert.fail(`raw transcript field "${key}" is not allowed in editorial-audit evidence`);
    }
    assertNoRawTranscript(value, seen);
  }
}

test('study-group playlist-01 editorial audit ledger invariants', () => {
  // 1. The ledger artifact must exist in the repository evidence directory.
  const reviewPath = path.join(AUDIT_DIR, 'review.json');
  assert.ok(fs.existsSync(reviewPath), 'editorial-audit/review.json must exist');
  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));

  // 2. Provenance: baseline and manifest hash pinning.
  assert.equal(review.baselineCommit, BASELINE_COMMIT, 'review.json must pin the fixed PR baseline commit');
  assert.equal(review.taskHeadCommit, TASK_HEAD_COMMIT, 'review.json must pin the task baseline HEAD');
  assert.equal(sha256File(MANIFEST_PATH), MANIFEST_SHA256, 'input_manifest.json sha256 drifted');
  assert.equal(review.inputManifestSha256, MANIFEST_SHA256, 'review.json must pin the input manifest sha256');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  // 3. Anchors: exact roles and identity against the frozen manifest.
  assert.deepEqual(review.anchors.map((a) => a.role).sort(), EXPECTED_ROLES,
    'review.json must carry exactly the five manifest anchor roles');
  const manifestAnchors = Object.fromEntries(manifest.anchors.map((a) => [a.role, a]));
  for (const anchor of review.anchors) {
    const m = manifestAnchors[anchor.role];
    assert.ok(m, `unexpected role ${anchor.role} not in manifest`);
    assert.equal(anchor.segmentId, m.segmentId);
    assert.equal(anchor.start, m.start);
    assert.equal(anchor.end, m.end);
    assert.equal(anchor.textSha256, m.textSha256, `${anchor.role}: manifest text hash mismatch`);
  }

  // 4. Verdicts: classification only, with SHA256 before/after, no invented text.
  for (const anchor of review.anchors) {
    assert.ok(EXPECTED_VERDICTS.has(anchor.verdict),
      `${anchor.role}: verdict must be CONFIRMED|LIKELY|UNCERTAIN, got ${anchor.verdict}`);
    assert.match(anchor.publishedTextSha256, HEX64, `${anchor.role}: publishedTextSha256 must be sha256 hex`);
    assert.match(anchor.audioTextSha256, HEX64, `${anchor.role}: audioTextSha256 must be sha256 hex`);
    assert.ok(['none', 'proposed'].includes(anchor.correction.decision));
    if (anchor.correction.decision === 'proposed') {
      assert.match(anchor.correction.beforeSha256, HEX64);
      assert.match(anchor.correction.afterSha256, HEX64);
      assert.notEqual(anchor.correction.beforeSha256, anchor.correction.afterSha256);
      assert.equal(anchor.correction.applied, false, 'automatic edits must never be applied by this ledger');
    } else {
      assert.equal(anchor.correction.proposedText, undefined,
        `${anchor.role}: no-proposed corrections must not carry replacement text`);
    }
  }

  // Published-text hashes must match the frozen content_review.json segment text.
  const contentReview = JSON.parse(fs.readFileSync(
    path.join(ROOT, manifest.files['content_review.json'].repoPath), 'utf8'));
  const crSegs = new Map(contentReview.segments.map((s) => [s.id, s]));
  for (const anchor of review.anchors) {
    const seg = crSegs.get(anchor.segmentId);
    assert.ok(seg, `${anchor.role}: segment missing from content_review.json`);
    assert.equal(anchor.publishedTextSha256, sha256Text(seg.text),
      `${anchor.role}: publishedTextSha256 must hash the exact content_review.json segment text`);
  }

  // 5. Audio evidence: every anchor must carry clip/response hashes and the ASR
  // runtime, cross-checked against the private anchor_index.json when present.
  assert.equal(review.audioEvidence.length, 5);
  const audioByRole = Object.fromEntries(review.audioEvidence.map((e) => [e.role, e]));
  for (const role of EXPECTED_ROLES) {
    const ev = audioByRole[role];
    assert.ok(ev, `audio evidence missing for role ${role}`);
    assert.match(ev.clipSha256, HEX64, `${role}: clipSha256`);
    assert.match(ev.responseSha256, HEX64, `${role}: responseSha256`);
    assert.match(ev.textSha256, HEX64, `${role}: textSha256`);
    assert.equal(ev.runtime.asr, 'http://127.0.0.1:8010/v1/audio/transcriptions');
    assert.equal(ev.runtime.model, 'faster-whisper-large-v3-turbo');
    assert.equal(ev.runtime.device, 'cuda-int8');
    assert.ok(Number.isFinite(ev.serverElapsedSeconds) && ev.serverElapsedSeconds > 0);
  }
  const idxPath = path.join(PRIVATE_DIR, 'anchor_index.json');
  if (fs.existsSync(idxPath)) {
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    const byRole = Object.fromEntries(idx.items.map((i) => [i.role, i]));
    assert.deepEqual(Object.keys(byRole).sort(), EXPECTED_ROLES, 'private index must hold all five roles');
    for (const role of EXPECTED_ROLES) {
      const priv = byRole[role];
      const pub = audioByRole[role];
      assert.equal(pub.clipSha256, priv.clipSha256, `${role}: clip hash mismatch vs private index`);
      assert.equal(pub.responseSha256, priv.responseSha256, `${role}: response hash mismatch vs private index`);
      assert.equal(pub.textSha256, priv.textSha256, `${role}: text hash mismatch vs private index`);
      assert.deepEqual(pub.runtime, priv.runtime, `${role}: runtime mismatch vs private index`);
      // Audio text hash must be the SHA256 of the private ASR response text.
      const respFile = path.join(PRIVATE_DIR, `${role}.asr.json`);
      const resp = JSON.parse(fs.readFileSync(respFile, 'utf8'));
      assert.equal(pub.textSha256, sha256Text(resp.text), `${role}: text hash not of private ASR text`);
      const anchor = review.anchors.find((a) => a.role === role);
      assert.equal(anchor.audioTextSha256, priv.textSha256,
        `${role}: anchor audioTextSha256 must equal private index textSha256`);
    }
  }

  // 6. No raw transcript content anywhere in the ledger evidence.
  assertNoRawTranscript(review);

  // 7. Terminal state must be a review gate, never an acceptance claim.
  assert.ok(['READY_FOR_INDEPENDENT_REVIEW', 'BLOCKED'].includes(review.status),
    `status must be READY_FOR_INDEPENDENT_REVIEW or BLOCKED, got ${review.status}`);

  // 8. Companion artifacts referenced by the ledger must exist.
  for (const name of ['source_evidence.json', 'summary.md', 'receipt.json', 'smoke.txt', 'fix_receipt.json']) {
    assert.ok(fs.existsSync(path.join(AUDIT_DIR, name)), `editorial-audit/${name} must exist`);
  }
  const sourceEvidence = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'source_evidence.json'), 'utf8'));
  assert.equal(sourceEvidence.inputManifestSha256, MANIFEST_SHA256);
  assertNoRawTranscript(sourceEvidence);
});

// F1 guard: the ledger advertises hash-only transcript evidence, so no committed
// evidence string may embed anchor transcript wording. Rationale text must use
// structured evidence codes and SHA256 field references instead of quoted
// snippets. This is the value-level complement of assertNoRawTranscript (which
// only guards keys).
const CJK = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function collectStrings(node, found = []) {
  if (typeof node === 'string') found.push(node);
  else if (node !== null && typeof node === 'object') {
    for (const value of Object.values(node)) collectStrings(value, found);
  }
  return found;
}

// True if `haystack` contains any window of `min` consecutive chars of `needle`.
function sharesFragment(haystack, needle, min = 4) {
  for (let i = 0; i + min <= needle.length; i++) {
    if (haystack.includes(needle.slice(i, i + min))) return needle.slice(i, i + min);
  }
  return null;
}

test('study-group playlist-01 ledger rationale is hash-only (no embedded anchor transcript fragments)', () => {
  const reviewPath = path.join(AUDIT_DIR, 'review.json');
  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));

  // (a) No committed ledger string may contain CJK transcript wording — the
  // published/ASR text of this project is Chinese, so hash-and-code-only
  // rationale is necessarily ASCII.
  for (const str of collectStrings(review)) {
    assert.ok(!CJK.test(str),
      `review.json embeds transcript wording (CJK characters found in free text): ${str.slice(0, 40)}...`);
  }

  // (b) Rationale strings must not share a 4+ char fragment with any anchor's
  // published segment text (frozen manifest input) or private ASR response text.
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const contentReview = JSON.parse(fs.readFileSync(
    path.join(ROOT, manifest.files['content_review.json'].repoPath), 'utf8'));
  const crSegs = new Map(contentReview.segments.map((s) => [s.id, s]));
  for (const anchor of review.anchors) {
    const sources = [crSegs.get(anchor.segmentId)?.text ?? ''];
    const respFile = path.join(PRIVATE_DIR, `${anchor.role}.asr.json`);
    if (fs.existsSync(respFile)) sources.push(JSON.parse(fs.readFileSync(respFile, 'utf8')).text);
    for (const src of sources) {
      const frag = sharesFragment(anchor.rationale, src);
      assert.equal(frag, null,
        `${anchor.role}: rationale embeds anchor transcript fragment "${frag}"; use structured evidence codes / hash references instead`);
    }
  }

  // (c) The fix must preserve every verdict and the no-auto-edit decision.
  const EXPECTED_ANCHOR_VERDICTS = {
    'opening': 'LIKELY',
    'middle': 'UNCERTAIN',
    'ending': 'UNCERTAIN',
    'question': 'UNCERTAIN',
    'teacher-summary': 'CONFIRMED',
  };
  for (const anchor of review.anchors) {
    assert.equal(anchor.verdict, EXPECTED_ANCHOR_VERDICTS[anchor.role],
      `${anchor.role}: verdict must be preserved by the F1 fix`);
    assert.equal(anchor.correction.decision, 'none', `${anchor.role}: no-auto-edit decision must be preserved`);
    assert.equal(anchor.correction.applied, false, `${anchor.role}: corrections must remain unapplied`);
    assert.match(anchor.publishedTextSha256, HEX64);
    assert.match(anchor.audioTextSha256, HEX64);
  }

  // (d) Directory prose must not embed transcript wording either (the summary
  // claims hash-only evidence).
  const summary = fs.readFileSync(path.join(AUDIT_DIR, 'summary.md'), 'utf8');
  assert.ok(!CJK.test(summary), 'editorial-audit/summary.md embeds transcript wording; hash-only claim would be inaccurate');
});

test('study-group playlist-01 refinement evidence may confirm only the re-sampled question anchor', () => {
  const refinement = JSON.parse(fs.readFileSync(REFINEMENT_PATH, 'utf8'));
  assert.equal(refinement.schema, 'study-group-session01-refinement/v1');
  assert.equal(refinement.baselineCommit, 'fd0f6f87f93700064526f4fcad8a51c936e863e0');
  assert.equal(refinement.decisions.question.decision, 'CONFIRMED');
  assert.equal(refinement.decisions.question.automaticEdit, false);
  assert.equal(refinement.decisions.middle.decision, 'UNCERTAIN');
  assert.equal(refinement.decisions.ending.decision, 'UNCERTAIN');
  assert.match(refinement.adjudicationEvidence.officialSourceResponseSha256, HEX64);
  assert.match(refinement.adjudicationEvidence.crossSessionEndingResponseSha256, HEX64);
  assert.equal(refinement.adjudicationEvidence.youtubeCaptionStatus, 'unavailable');
  for (const item of Object.values(refinement.decisions)) {
    assert.match(item.adjudicationResponseSha256, HEX64);
    assert.match(item.inputSha256, HEX64);
    assert.equal(typeof item.reasonCode, 'string');
  }
  assertNoRawTranscript(refinement);
});
