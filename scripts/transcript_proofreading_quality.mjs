#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverTranscriptSessions,
  selectStratifiedPilot,
} from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const inventory = discoverTranscriptSessions(ROOT);

if (args.has('--inventory')) {
  const courses = Object.fromEntries(
    Object.entries(Object.groupBy(inventory, (item) => item.course))
      .map(([course, rows]) => [course, rows.length]),
  );
  console.log(JSON.stringify({ total: inventory.length, courses }, null, 2));
} else if (args.has('--pilot')) {
  const pilot = {
    schema: 'transcript-proofreading-pilot/v1',
    sourceInventoryCount: inventory.length,
    perCourse: 3,
    sessions: selectStratifiedPilot(inventory, 3),
  };
  if (args.has('--write')) {
    const output = path.join(ROOT, 'reviews', 'evidence', 'transcript_proofreading', 'pilot-manifest.json');
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(pilot, null, 2)}\n`, 'utf8');
    console.log(output);
  } else {
    console.log(JSON.stringify(pilot, null, 2));
  }
} else {
  console.error('Usage: node scripts/transcript_proofreading_quality.mjs --inventory | --pilot [--write]');
  process.exitCode = 2;
}
