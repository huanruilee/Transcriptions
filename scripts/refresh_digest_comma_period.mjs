#!/usr/bin/env node
// 重算並寫回 contentOverview.sourceDigest（演算法 A：computeSourceDigest）
// 只更新 digest 欄位，不動任何其他內容。
//
// ⚠️ 序列化陷阱（2026-11-04 巡檢修正）：
//   原版用 `JSON.stringify(doc, null, 2)` 整檔寫回，會把 JSON 數值正規化：
//   0.0 → 0、207.0 → 207、1097.0 → 1097。
//   本 repo 的 published session 檔所有 start/end 都是浮點字面（.0 結尾），
//   整檔重新序列化會產生 start/end 的「非標點」漂移。
//   本版改用「字串層面 surgical replace」：只替換 digest 那個字串值，
//   其餘位元組完全不動，因此 start/end 浮點字面、縮排、key 順序皆保持原樣。
//
// 演算法說明（見 skill 的「digest 雙演算法不可混用」）：
//   contentOverview.sourceDigest → computeSourceDigest（演算法 A）
//   _meta.sourceDigest            → stableStringify（演算法 B）
//   本檔只碰演算法 A；演算法 B 若存在則另外用對應函式處理。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 直接使用 pipeline 官方的 computeSourceDigest，避免重複實作走樣
// （官方版會 trim heading、正規化空白、並在 id 缺漏時補 p{N}-s{M}）
import { computeSourceDigest } from './content_overview_pipeline.mjs';

// 專案根目錄由本檔位置推導（不可寫死絕對路徑，否則在其他 checkout 會 ENOENT）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const COURSE = '入中論善顯密意疏';
const FILES = ['session_09A', 'session_99A'];

// 在原始字串中，把 contentOverview 區塊的 "sourceDigest": "<old>" 換成 "<new>"
function surgicalDigestReplace(raw, oldDigest, newDigest) {
  const needle = `"sourceDigest": "${oldDigest}"`;
  const idx = raw.indexOf(needle);
  if (idx === -1) return null;
  // 確認這是 contentOverview 裡的那一個（避免誤改 _meta 的演算法 B）
  const before = raw.slice(Math.max(0, idx - 4000), idx);
  const coIdx = before.lastIndexOf('"contentOverview"');
  const metaIdx = before.lastIndexOf('"_meta"');
  if (coIdx === -1 || (metaIdx !== -1 && metaIdx > coIdx)) {
    return { error: 'sourceDigest 不在 contentOverview 區塊內（可能命中 _meta），中止' };
  }
  return raw.slice(0, idx) + `"sourceDigest": "${newDigest}"` + raw.slice(idx + needle.length);
}

for (const file of FILES) {
  const p = path.join(ROOT, 'courses', COURSE, 'sessions', `${file}.json`);
  const raw = fs.readFileSync(p, 'utf8');
  const doc = JSON.parse(raw);
  const before = doc.contentOverview?.sourceDigest;
  const after = computeSourceDigest(doc);
  if (!doc.contentOverview) {
    console.log(`${file}: 無 contentOverview，略過`);
    continue;
  }
  if (before === after) {
    console.log(`${file}: digest 已是最新（${before}），略過`);
    continue;
  }

  const replaced = surgicalDigestReplace(raw, before, after);
  if (!replaced) {
    console.log(`${file}: 找不到 digest 字串於原檔，中止`);
    continue;
  }
  if (replaced.error) {
    console.log(`${file}: ${replaced.error}`);
    continue;
  }

  // 防呆：替換後必須仍是合法 JSON，且 digest 已更新、句數未變
  const afterDoc = JSON.parse(replaced);
  const countSentences = (d) =>
    (d.paragraphs || []).reduce((n, p) => n + (p.sentences || []).length, 0);
  if (countSentences(afterDoc) !== countSentences(doc)) {
    throw new Error(`${file}: 句數改變，中止寫入`);
  }
  if (afterDoc.contentOverview.sourceDigest !== after) {
    throw new Error(`${file}: digest 未正確寫入，中止`);
  }

  fs.writeFileSync(p, replaced);
  console.log(`${file}:`);
  console.log(`  before: ${before}`);
  console.log(`  after : ${after}`);
  console.log('  已寫入（字串層面 surgical replace）');
}
