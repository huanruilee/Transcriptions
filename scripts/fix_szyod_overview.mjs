#!/usr/bin/env node
// 三主要道校字後修復 contentOverview：
//   1) sourceDigest 依校字後的 session 重算（digest 由 {id,text,heading} 的 JSON 決定）
//   2) evidence.quote 逐字同步為校字後的來源句（實質字面改變，非僅標點）
//
// 邊界：不新增／刪除／改寫任何引文語意，只讓快照跟上來源句。
// 用法：node scripts/fix_szyod_overview.mjs [--apply]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'courses', '三主要道', 'sessions');
const APPLY = process.argv.includes('--apply');
const GROUPS = ['mainPoints', 'discussionTopics', 'referenceViews'];

function flattenSentences(t) {
  const out = [];
  for (const p of t.paragraphs || []) {
    for (const s of p.sentences || []) {
      out.push({ id: String(s.id || ''), text: String(s.text || ''), heading: p.heading || '' });
    }
  }
  return out;
}

function computeSourceDigest(t) {
  const source = flattenSentences(t).map(({ id, text, heading }) => ({ id, text, heading }));
  return `sha256:${createHash('sha256').update(JSON.stringify(source)).digest('hex')}`;
}

let digestFixed = 0, quoteFixed = 0, skipped = 0;
const reports = [];

for (let n = 1; n <= 24; n++) {
  const sid = String(n).padStart(2, '0');
  const p = path.join(DIR, `session_${sid}.json`);
  if (!fs.existsSync(p)) continue;
  const raw = fs.readFileSync(p, 'utf8');
  const doc = JSON.parse(raw);
  const ov = doc.contentOverview;
  if (!ov) continue;

  const map = new Map(flattenSentences(doc).map((s) => [s.id, s.text]));
  const local = [];

  for (const g of GROUPS) {
    for (const item of ov[g] || []) {
      for (const ev of item?.evidence || []) {
        const id = String(ev?.sentenceId || '');
        const actual = map.get(id);
        if (!actual) continue;
        const quoted = String(ev?.quote || '').trim();
        if (quoted === actual) continue;
        // 校字造成的實質字面差異：允許同步（快照本來就只是來源句的複本）
        local.push({ group: g, id, old: quoted, new: actual });
      }
    }
  }

  const expected = computeSourceDigest(doc);
  const digestChanged = ov.sourceDigest !== expected;

  if (!local.length && !digestChanged) continue;
  reports.push({ sid, quotes: local.length, digestChanged });
  digestFixed += digestChanged ? 1 : 0;
  quoteFixed += local.length;

  if (!APPLY) continue;

  // 先寫 quote（surgical replace，保留 start/end 浮點字面與縮排）
  let out = raw;
  for (const c of local) {
    const needle = `"quote": ${JSON.stringify(c.old)}`;
    const idx = out.indexOf(needle);
    if (idx === -1) { skipped++; continue; }
    out = out.slice(0, idx) + `"quote": ${JSON.stringify(c.new)}` + out.slice(idx + needle.length);
  }
  // 再更新 sourceDigest（字串層 surgical replace）
  const oldDigest = ov.sourceDigest;
  if (digestChanged && typeof oldDigest === 'string') {
    const needle = `"sourceDigest": ${JSON.stringify(oldDigest)}`;
    const idx = out.indexOf(needle);
    if (idx === -1) { skipped++; }
    else {
      out = out.slice(0, idx) + `"sourceDigest": ${JSON.stringify(expected)}` + out.slice(idx + needle.length);
    }
  }
  const after = JSON.parse(out);
  const count = (d) => (d.paragraphs || []).reduce((k, q) => k + (q.sentences || []).length, 0);
  if (count(after) !== count(doc)) throw new Error(`session_${sid}: 句數改變，中止`);
  fs.writeFileSync(p, out);
}

for (const r of reports) console.log(`session_${r.sid}: quote 同步 ${r.quotes} 筆 / digest ${r.digestChanged ? '重算' : '不變'}`);
console.log(`\n合計：digest 重算 ${digestFixed} 講、quote 同步 ${quoteFixed} 筆${skipped ? `、跳過 ${skipped}` : ''}`);
console.log(APPLY ? '模式：APPLY' : '模式：dry-run（未修改檔案）');
