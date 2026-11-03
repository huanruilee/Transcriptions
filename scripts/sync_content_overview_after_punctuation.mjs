#!/usr/bin/env node
// R5：標點修正後，同步 contentOverview 的 evidence.quote 與 sourceDigest。
// 只動 overview 的衍生欄位，不重新呼叫 LLM，不改逐字稿文字。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeSourceDigest,
  hydrateEvidenceQuotes,
} from './content_overview_pipeline.mjs';

const REPO = '/home/henry/.gx10/xiaofa/workspace/Transcriptions';

function listSessions(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const course of fs.readdirSync(dir)) {
    const sdir = path.join(dir, course, 'sessions');
    if (!fs.existsSync(sdir)) continue;
    for (const fn of fs.readdirSync(sdir)) {
      if (fn.endsWith('.json')) out.push(`courses/${course}/sessions/${fn}`);
    }
  }
  return out;
}

const apply = process.argv.includes('--apply');
const files = listSessions(path.join(REPO, 'courses'));
let touched = 0;
let quoteFixed = 0;
let digestFixed = 0;

for (const rel of files) {
  const full = path.join(REPO, rel);
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    continue;
  }
  const overview = doc.contentOverview;
  if (!overview || typeof overview !== 'object') continue;

  const before = JSON.stringify(overview);
  const hydrated = hydrateEvidenceQuotes(overview, doc);
  const expectedDigest = computeSourceDigest(doc);

  let changed = false;
  if (hydrated.sourceDigest !== expectedDigest) {
    hydrated.sourceDigest = expectedDigest;
    changed = true;
    digestFixed += 1;
  }
  if (JSON.stringify(hydrated) !== before) {
    changed = true;
    quoteFixed += 1;
  }
  if (!changed) continue;

  doc.contentOverview = hydrated;
  touched += 1;
  if (apply) {
    fs.writeFileSync(full, `${JSON.stringify(doc, null, 2)}\n`);
  }
  console.log(`  ✓ ${rel}`);
}

console.log(`\n=== R5 ${apply ? '已套用' : 'dry-run'} ===`);
console.log(`  受影響檔案: ${touched}`);
console.log(`  quote 回填: ${quoteFixed}，sourceDigest 更新: ${digestFixed}`);
if (!apply) console.log('  （dry-run，未寫入；加 --apply 套用）');
