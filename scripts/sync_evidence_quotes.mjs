#!/usr/bin/env node
// 同步 contentOverview 的 evidence.quote 逐字快照，使其與來源句一致。
//
// 背景（2026-11-04）：
//   入中論 session_09A 的 2 筆 evidence.quote 是來源句的「逐字快照」
//   （validator 以 String(evidence.quote).trim() !== 實際句文 判定不一致）。
//   來源句句尾的多餘句號被修正後，快照自然過期，須一併同步。
//
// 這不是「改寫審閱證據」：
//   - 這是 AI 生成（generatedBy / reviewedBy = MiniMax-M3）的衍生快照，
//     不是 reviews/evidence/** 下人工審閱過的 evidence.quote（紅線 6 保護後者）
//   - 只讓快照跟上來源句的標點修正，不新增、不刪除、不改寫任何引文語意
//   - 全 repo 3,158 筆 quote 中僅這 2 筆結尾為「逗號+句號」，修正後應為 0
//
// 用法：node scripts/sync_evidence_quotes.mjs [--apply]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/henry/.gx10/xiaofa/workdirs/regress-main';
const COURSE = '入中論善顯密意疏';
const FILES = ['session_09A', 'session_99A'];
const APPLY = process.argv.includes('--apply');

// 依 pipeline 官方的 flatten 規則建立 sentenceId → 句文 對照
function buildSentenceMap(transcript) {
  const map = new Map();
  for (const [pi, p] of (transcript.paragraphs || []).entries()) {
    for (const [si, s] of (p.sentences || []).entries()) {
      const text = String(s.text || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const id = String(s.id || `p${pi + 1}-s${si + 1}`);
      map.set(id, text);
    }
  }
  return map;
}

let changed = 0;

for (const file of FILES) {
  const p = path.join(ROOT, 'courses', COURSE, 'sessions', `${file}.json`);
  if (!fs.existsSync(p)) continue;
  const raw = fs.readFileSync(p, 'utf8');
  const doc = JSON.parse(raw);
  const ov = doc.contentOverview;
  if (!ov) continue;
  const map = buildSentenceMap(doc);

  const groups = ['mainPoints', 'discussionTopics', 'referenceViews'];
  const localChanges = [];

  for (const g of groups) {
    for (const item of ov[g] || []) {
      for (const ev of item?.evidence || []) {
        const id = String(ev?.sentenceId || '');
        const actual = map.get(id);
        if (!actual) continue;
        const quoted = String(ev?.quote || '').trim();
        if (quoted === actual) continue;
        // 只同步尾端標點差異；若非標點內容有差異則不動（避免越權改寫）
        const strip = (s) => s.replace(/[，。！？；：、,.!?;:"'()（）「」『』《》〈〉—…～·]/g, '');
        if (strip(quoted) !== strip(actual)) {
          console.log(`  略過（引文內容與來源句有實質差異）：${g}/${id}`);
          continue;
        }
        localChanges.push({ group: g, id, old: quoted, new: actual });
      }
    }
  }

  if (!localChanges.length) continue;
  console.log(`\n=== ${file}：${localChanges.length} 筆 quote 需同步 ===`);
  for (const c of localChanges) {
    console.log(`  ${c.group} / ${c.id}`);
    console.log(`    old: …${c.old.slice(-16)}`);
    console.log(`    new: …${c.new.slice(-16)}`);
    const g = c.group;
    const item = ov[g].find((it) => (it.evidence || []).some((e) => String(e.sentenceId) === c.id));
    const ev = item.evidence.find((e) => String(e.sentenceId) === c.id);
    ev.quote = c.new;
    changed++;
  }
  if (APPLY) {
    // ⚠️ 序列化陷阱（2026-11-04 巡檢修正）：
    //   原版用 `JSON.stringify(doc, null, 2)` 整檔寫回，會把 JSON 數值正規化：
    //   0.0 → 0、207.0 → 207、1097.0 → 1097。
    //   本 repo 的 published session 檔所有 start/end 都是浮點字面（.0 結尾），
    //   整檔重新序列化會產生 start/end 的「非標點」漂移。
    //   改用「字串層面 surgical replace」：只替換 quote 欄位的值，
    //   其餘位元組完全不動，因此 start/end 浮點字面、縮排、key 順序皆保持原樣。
    let out = raw;
    for (const c of localChanges) {
      const oldEscaped = JSON.stringify(c.old);
      const newEscaped = JSON.stringify(c.new);
      // 精準比對：quote 值必須完全等於 old 才替換，避免誤改同值的其他欄位
      const needle = `"quote": ${oldEscaped}`;
      const idx = out.indexOf(needle);
      if (idx === -1) {
        throw new Error(`${file}: 找不到 quote 字串 ${oldEscaped}，中止寫入`);
      }
      out = out.slice(0, idx) + `"quote": ${newEscaped}` + out.slice(idx + needle.length);
    }
    // 防呆：替換後必須仍是合法 JSON，且句數未變
    const afterDoc = JSON.parse(out);
    const countSentences = (d) =>
      (d.paragraphs || []).reduce((n, p) => n + (p.sentences || []).length, 0);
    if (countSentences(afterDoc) !== countSentences(doc)) {
      throw new Error(`${file}: 句數改變，中止寫入`);
    }
    fs.writeFileSync(p, out);
    console.log('  已寫入（字串層面 surgical replace）');
  }
}

console.log(`\n合計同步：${changed} 筆`);
console.log(APPLY ? '模式：APPLY' : '模式：dry-run（未修改檔案）');
