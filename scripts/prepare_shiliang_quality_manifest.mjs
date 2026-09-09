#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { findTimestampViolations } from './lib/shiliangAudit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const courseRoot = path.join(root, 'courses', '釋量論第二品');
const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const sessionIds = (value('--sessions') || '').split(',').map(x => x.trim()).filter(Boolean);
const output = value('--output');
const baseline = value('--baseline') || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

if (!sessionIds.length || !output) {
  console.error('Usage: prepare_shiliang_quality_manifest.mjs --sessions 01,02 --output PATH [--baseline COMMIT]');
  process.exit(2);
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const descriptor = file => ({ path: path.relative(root, file), sha256: sha256(file) });
const batchFor = id => `B${Math.floor((Number(id) - 1) / 4) + 1}`;
const batches = new Set(sessionIds.map(batchFor));
if (batches.size !== 1) {
  console.error('All sessions in one manifest must belong to the same four-session batch.');
  process.exit(2);
}
const batch = [...batches][0];

const sessions = sessionIds.map(id => {
  if (!/^\d{2}$/.test(id) || Number(id) < 1 || Number(id) > 32) {
    throw new Error(`Invalid session id: ${id}`);
  }
  const sessionFile = path.join(courseRoot, 'sessions', `session_${id}.json`);
  const officialFile = path.join(courseRoot, 'source_text', `session_${id}_official_raw.txt`);
  const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  const sentences = data.paragraphs.flatMap(p => p.sentences || []);
  return {
    id,
    files: { session: descriptor(sessionFile), officialRaw: descriptor(officialFile) },
    counts: { paragraphs: data.paragraphs.length, sentences: sentences.length },
    timestampViolations: findTimestampViolations(sentences),
  };
});

const allowedPaths = [
  ...sessionIds.map(id => `courses/釋量論第二品/sessions/session_${id}.json`),
  `reviews/evidence/shiliang_32_continuous/${batch}/`,
];
const manifest = {
  schema: 'shiliang-quality-input/v1',
  course: '釋量論第二品',
  batch,
  baselineCommit: baseline,
  sessions,
  sharedFiles: {
    audioMap: descriptor(path.join(courseRoot, 'audio_map.json')),
    rootVerses: descriptor(path.join(courseRoot, 'source_text', 'pramana_chapter2_root_verses.txt')),
  },
  allowedPaths,
  forbidden: ['raw ASR mutation', 'test relaxation', 'merge', 'deploy', 'unlisted session edits'],
};

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, batch, sessions: sessionIds, violations: sessions.reduce((n, x) => n + x.timestampViolations.length, 0) }));
