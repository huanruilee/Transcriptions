import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  detectParagraphBoundaryCandidates,
  detectSentenceBoundaryCandidates,
  detectTextCandidates,
  detectVerseMappingCandidates,
} from './lib/transcriptDetectors.js';

const COURSE_DIR = path.resolve('courses/釋量論第二品');
const OUTPUT = path.resolve(
  process.argv[2] || 'reviews/evidence/transcript_web_refactor/runs/m3_candidates.json',
);
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const canonicalId = (value) => String(Number(String(value))).padStart(2, '0');

const baseline = readJson(path.resolve(
  'reviews/evidence/transcript_web_refactor/runs/m0_baseline.json',
));
const course = readJson(path.join(COURSE_DIR, 'course.json'));
const verseDocument = readJson(path.join(COURSE_DIR, 'verse_annotations.json'));
const learned = readJson(path.join(COURSE_DIR, 'learned_corrections.json'));
const verseSource = fs.readFileSync(
  path.join(COURSE_DIR, 'source_text', 'pramana_chapter2_root_verses.txt'),
  'utf8',
);
const corrections = Object.entries(learned.replacements || {}).map(([from, to]) => ({
  from,
  to: typeof to === 'string' ? to : to.replacement,
}));

const candidates = [];
for (const declared of course.sessions) {
  const sessionId = canonicalId(declared.sessionId);
  const session = readJson(path.join(COURSE_DIR, 'sessions', `session_${sessionId}.json`));
  const sourcePath = path.join(COURSE_DIR, 'source_text', `session_${sessionId}_official_raw.txt`);
  const sourceText = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
  const manifest = (verseDocument.manifests || []).find(
    (item) => canonicalId(item.sessionId) === sessionId,
  );

  candidates.push(
    ...detectTextCandidates(session, { sourceText, corrections }),
    ...detectSentenceBoundaryCandidates(session),
    ...detectParagraphBoundaryCandidates(session),
    ...detectVerseMappingCandidates({ session, manifest, sourceText: verseSource }),
  );
}

const uniqueCandidates = [...new Map(
  candidates.map((candidate) => [JSON.stringify(candidate), candidate]),
).values()];
const withIds = uniqueCandidates.map((candidate) => ({
  candidateId: sha(JSON.stringify(candidate)).slice(0, 16),
  ...candidate,
}));
if (new Set(withIds.map(({ candidateId }) => candidateId)).size !== withIds.length) {
  throw new Error('duplicate candidateId detected');
}
const payload = {
  schema: 'transcript-candidate-manifest/v1',
  course: '釋量論第二品',
  baselineCommit: baseline.repository.commit,
  baselineImmutableSha256: baseline.aggregateImmutableSha256,
  candidates: withIds,
  duplicatesDiscarded: candidates.length - uniqueCandidates.length,
  candidateSha256: sha(JSON.stringify(withIds)),
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
const byRule = Object.fromEntries(
  [...new Set(withIds.map(({ ruleId }) => ruleId))].sort().map((ruleId) => [
    ruleId,
    withIds.filter((candidate) => candidate.ruleId === ruleId).length,
  ]),
);
console.log(JSON.stringify({
  output: path.relative(process.cwd(), OUTPUT),
  candidates: withIds.length,
  duplicatesDiscarded: payload.duplicatesDiscarded,
  candidateSha256: payload.candidateSha256,
  byRule,
}, null, 2));
