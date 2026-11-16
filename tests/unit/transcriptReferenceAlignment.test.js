import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/align_transcript_reference.py');

test('reference alignment maps ASR-like errors to exact lecture-note spans', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'transcript-reference-alignment-'));
  const sourcePath = path.join(work, 'source.json');
  const referencePath = path.join(work, 'reference.txt');
  const outputPath = path.join(work, 'output.json');
  writeFileSync(sourcePath, JSON.stringify({ paragraphs: [{ sentences: [
    { id: 'seg-001', text: '如是等類 深受心法' },
    { id: 'seg-002', text: '朱差別門' },
    { id: 'seg-003', text: '當之多種' },
    { id: 'seg-004', text: '堅於始終卻嫌少分' },
  ] }] }));
  writeFileSync(referencePath, '如是等類身受心法諸差別門，當知多種，今於此中，且顯少分。');

  execFileSync('python3', [SCRIPT,
    '--source', sourcePath,
    '--reference-text', referencePath,
    '--reference-url', 'https://example.test/lecture.pdf',
    '--output', outputPath,
  ]);
  const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(artifact.schema, 'transcript-reference-alignment/v1');
  assert.equal(artifact.itemCount, 4);
  assert.equal(artifact.riskClusterCount, 0);
  assert.match(artifact.sourceFileDigest, /^sha256:/u);
  assert.match(artifact.referenceTextDigest, /^sha256:/u);
  assert.deepEqual(artifact.items.map((item) => item.after), [
    '如是等類身受心法',
    '諸差別門',
    '當知多種',
    '今於此中，且顯少分',
  ]);
  assert.ok(artifact.items.every((item) => item.referenceEnd >= item.referenceStart));
});

test('reference alignment rejects duplicate sentence IDs', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'transcript-reference-alignment-'));
  const sourcePath = path.join(work, 'source.json');
  const referencePath = path.join(work, 'reference.txt');
  const outputPath = path.join(work, 'output.json');
  writeFileSync(sourcePath, JSON.stringify({ paragraphs: [{ sentences: [
    { id: 'dup', text: '甲' }, { id: 'dup', text: '乙' },
  ] }] }));
  writeFileSync(referencePath, '甲乙');
  assert.throws(() => execFileSync('python3', [SCRIPT,
    '--source', sourcePath, '--reference-text', referencePath,
    '--reference-url', 'https://example.test/lecture.pdf', '--output', outputPath,
  ], { stdio: 'pipe' }), /Command failed/u);
});
