import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { applyDecisionLedger } from './lib/transcriptDecisionApplier.js';

const APPLY = process.argv.includes('--apply');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const courseDir = path.resolve('courses/釋量論第二品');
const ledgerPath = path.resolve(
  'reviews/evidence/transcript_web_refactor/decisions/m4_paragraph_decisions.json',
);
const baselinePath = path.resolve(
  'reviews/evidence/transcript_web_refactor/runs/m0_baseline.json',
);
const manifestPath = path.resolve(
  'reviews/evidence/transcript_web_refactor/runs/m4_review_manifest.json',
);
const reportPath = path.resolve(
  'reviews/evidence/transcript_web_refactor/runs/m5_apply_report.json',
);

const ledger = readJson(ledgerPath);
const baseline = readJson(baselinePath);
const manifest = readJson(manifestPath);
const sessionIds = [...new Set(ledger.decisions.map(({ sessionId }) => sessionId))].sort();
const files = Object.fromEntries(sessionIds.map((sessionId) => [
  sessionId,
  path.join(courseDir, 'sessions', `session_${sessionId}.json`),
]));
const sessions = Object.fromEntries(sessionIds.map((sessionId) => [sessionId, readJson(files[sessionId])]));
const beforeFileSha256 = Object.fromEntries(sessionIds.map((sessionId) => [
  sessionId,
  sha(fs.readFileSync(files[sessionId])),
]));
const baselineById = new Map(baseline.sessions.map((item) => [item.sessionId, item]));

const result = applyDecisionLedger({
  sessions,
  ledger,
  expectedBaselineCommit: baseline.repository.commit,
  expectedManifestSha256: manifest.inputManifestSha256,
});

for (const sessionId of sessionIds) {
  const immutable = baselineById.get(sessionId)?.immutableSha256;
  if (!immutable) throw new Error(`immutable baseline missing for ${sessionId}`);
  const fields = baseline.canonicalization.immutableFields;
  const absent = baseline.canonicalization.absentFieldEncoding;
  const canonical = result.sessions[sessionId].paragraphs.flatMap((paragraph) => paragraph.sentences || [])
    .map((sentence) => Object.fromEntries(fields.map((field) => [
      field,
      Object.prototype.hasOwnProperty.call(sentence, field) ? sentence[field] : absent,
    ])));
  if (sha(JSON.stringify(canonical)) !== immutable) {
    throw new Error(`immutable sentence hash changed for ${sessionId}`);
  }
}

if (APPLY) {
  for (const sessionId of result.report.changedSessionIds) {
    fs.writeFileSync(files[sessionId], `${JSON.stringify(result.sessions[sessionId], null, 2)}\n`);
  }
}
const afterFileSha256 = Object.fromEntries(sessionIds.map((sessionId) => [
  sessionId,
  APPLY ? sha(fs.readFileSync(files[sessionId])) : sha(`${JSON.stringify(result.sessions[sessionId], null, 2)}\n`),
]));
const report = {
  schema: 'transcript-decision-apply-report/v1',
  mode: APPLY ? 'apply' : 'dry-run',
  baselineCommit: ledger.baselineCommit,
  inputManifestSha256: ledger.inputManifestSha256,
  ...result.report,
  changedFiles: result.report.changedSessionIds.map((sessionId) => path.relative(process.cwd(), files[sessionId])),
  beforeFileSha256,
  afterFileSha256,
};
if (APPLY) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
