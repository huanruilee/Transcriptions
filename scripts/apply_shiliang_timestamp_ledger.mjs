#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { resolveBoundedTimestampGaps } from './lib/shiliangAudit.js';

const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const sessionPath = value('--session');
const ledgerPath = value('--ledger');
const resolutionsPath = value('--resolutions');
const write = args.includes('--write');

if (!sessionPath || !ledgerPath) {
  console.error('Usage: apply_shiliang_timestamp_ledger.mjs --session FILE --ledger FILE [--resolutions FILE] [--write]');
  process.exit(2);
}

const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const resolutions = resolutionsPath ? JSON.parse(fs.readFileSync(resolutionsPath, 'utf8')) : [];
const entries = resolveBoundedTimestampGaps(ledger.entries, resolutions);
const unresolved = entries.filter(x => !['CONFIRMED', 'BOUNDED_CONFIRMED'].includes(x.confidence));
if (unresolved.length) throw new Error(`unresolved ledger entries: ${unresolved.map(x => x.sentenceId).join(', ')}`);

const decisions = new Map(entries.map(x => [x.sentenceId, x]));
const changed = [];
for (const paragraph of session.paragraphs) {
  for (const sentence of paragraph.sentences || []) {
    const decision = decisions.get(sentence.id);
    if (!decision) continue;
    if (sentence.start !== decision.proposedStart || sentence.end !== decision.proposedEnd) {
      changed.push({ sentenceId: sentence.id, before: [sentence.start, sentence.end], after: [decision.proposedStart, decision.proposedEnd] });
      sentence.start = decision.proposedStart;
      sentence.end = decision.proposedEnd;
    }
  }
  if (paragraph.sentences?.length) {
    paragraph.start = paragraph.sentences[0].start;
    paragraph.end = paragraph.sentences.at(-1).end;
  }
}

for (let index = 1; index < entries.length; index += 1) {
  if (entries[index].proposedStart < entries[index - 1].proposedEnd) {
    throw new Error(`ledger overlap: ${entries[index - 1].sentenceId}->${entries[index].sentenceId}`);
  }
}

if (write) fs.writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
const finalLedger = {
  ...ledger,
  entries,
  application: {
    sessionPath: path.normalize(sessionPath),
    ledgerEntryCount: entries.length,
    changedThisRun: changed.length,
    changed,
  },
};
const finalPath = ledgerPath.replace(/\.json$/, '.final.json');
if (write) fs.writeFileSync(finalPath, `${JSON.stringify(finalLedger, null, 2)}\n`);
console.log(JSON.stringify({ mode: write ? 'WRITE' : 'DRY_RUN', changedCount: changed.length, finalLedger: finalPath }));
