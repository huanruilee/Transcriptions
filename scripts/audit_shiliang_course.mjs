#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { findTimestampViolations } from './lib/shiliangAudit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const outputRoot = value('--output-root');
const baselineCommit = value('--baseline') || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!outputRoot) {
  console.error('Usage: audit_shiliang_course.mjs --output-root PATH [--baseline COMMIT]');
  process.exit(2);
}
const minimumBaseline = '86c5b5a';
try {
  execFileSync('git', ['rev-parse', '--verify', `${baselineCommit}^{commit}`], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['merge-base', '--is-ancestor', minimumBaseline, baselineCommit], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['merge-base', '--is-ancestor', baselineCommit, 'HEAD'], { cwd: root, stdio: 'ignore' });
} catch {
  console.error(`Baseline must be between quality floor ${minimumBaseline} and HEAD: ${baselineCommit}`);
  process.exit(2);
}

const courseRoot = path.join(root, 'courses', '釋量論第二品');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let violationCount = 0;
for (let batch = 1; batch <= 8; batch += 1) {
  const sessions = [];
  for (let n = (batch - 1) * 4 + 1; n <= batch * 4; n += 1) {
    const id = String(n).padStart(2, '0');
    const file = path.join(courseRoot, 'sessions', `session_${id}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const sentences = data.paragraphs.flatMap(paragraph => paragraph.sentences || []);
    const timestampViolations = findTimestampViolations(sentences);
    violationCount += timestampViolations.length;
    sessions.push({
      id,
      sessionSha256: sha256(file),
      paragraphCount: data.paragraphs.length,
      sentenceCount: sentences.length,
      timestampViolations,
    });
  }
  const dir = path.resolve(outputRoot, `B${batch}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'scan_summary.json'), `${JSON.stringify({
    schema: 'shiliang-course-scan/v1', course: '釋量論第二品', batch: `B${batch}`, baselineCommit, sessions,
  }, null, 2)}\n`);
}
console.log(JSON.stringify({ batches: 8, sessions: 32, timestampViolations: violationCount }));
