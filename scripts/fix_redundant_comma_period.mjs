#!/usr/bin/env node
// 一次性修復：移除「逗號 + 句號」結尾中多餘的句號
//
// 背景（2026-11-04 巡檢實測）：
//   courses/入中論善顯密意疏/sessions/session_09A.json 與 session_99A.json
//   共 64 句結尾形如「…瓶子的火大，。」或「…這樣可以嗎,。」——
//   即逗號緊接句號。經比對下一段首句，該逗號是跨段延續的正確句讀，
//   而句號才是多餘產物（段落塊切分時重複補上）。
//
// 為何只刪句號、不改成句號：
//   這 64 句全是「段落塊」的末句，下一段首句緊接續寫同一個語意
//   （例：末句「…瓶子跟瓶子的火大，。」→ 下段「應該是生柱面也同體…」）。
//   改成「。」會把跨段的同一句讀硬生生切斷；刪掉句號保留逗號才是忠實讀法。
//
// ⚠️ 序列化陷阱（2026-11-04 巡檢修正）：
//   原版用 `JSON.stringify(doc, null, 2)` 整檔寫回，會把 JSON 數值正規化：
//   0.0 → 0、207.0 → 207、1097.0 → 1097。
//   本 repo 的 published session 檔所有 start/end 都是浮點字面（.0 結尾），
//   整檔重新序列化會產生 52 行 start/end 的「非標點」漂移，
//   違反資料忠實度守門（非標點字元未變）。
//
//   本版改用「字串層面 surgical replace」：
//   只對 text 欄位做精準的句尾替換，其餘位元組完全不動，
//   因此 start/end 的浮點字面、縮排、key 順序、尾端換行皆保持原樣。
//
// 安全性：
//   1. 只改句尾標點，不動句界、不動 rawText、不改任何非標點字元
//   2. 句數不變（逐句一對一替換）
//   3. 不觸碰有 rawText 的逐 ASR segment 句（有 rawText 的才是 ASR 來源句）
//   4. 不重新序列化整個 JSON（避免數值字面漂移）
//
// 用法：node scripts/fix_redundant_comma_period.mjs [--apply]
//        不加 --apply 為 dry-run（只報告）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

// 目標：逗號（半形 , 或全形 ，）緊接句號（。）
const REDUNDANT_TAIL = /([,，])。$/;

// 只有這些課程的「段落塊」（無 rawText）允許套用
const TARGET_COURSES = ['入中論善顯密意疏'];

const stripTrailingPeriod = (text) => text.replace(REDUNDANT_TAIL, '$1');

// ── 定位段落塊中「無 rawText 的句子」的 text 欄位 ────────────────────
// 這些 session 的段落塊句子是 { id, start, end, text }，
// 而有 rawText 的句子是 { ..., rawText, ... }。
// 我們在原始字串中尋找每個 "text": "..." 的值，
// 依出現順序對應到 walkSentences 收集到的候選句。
function findTextSpans(raw) {
  const spans = [];
  const re = /"text":\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    spans.push({ start: m.index, valueStart: m.index + m[0].indexOf('"') + 1, len: m[0].length, raw: m[0] });
  }
  return spans;
}

let totalFixed = 0;
const touchedFiles = [];

for (const course of TARGET_COURSES) {
  const dir = path.join(ROOT, 'courses', course, 'sessions');
  if (!fs.existsSync(dir)) continue;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch {
      console.log(`跳過（JSON 解析失敗）：${course}/${file}`);
      continue;
    }

    // 收集所有段落塊句（無 rawText），依出現順序
    const candidates = [];
    for (const p of doc.paragraphs || []) {
      for (const s of p.sentences || []) {
        if (s.rawText) continue; // 有 rawText 的是逐 ASR segment 句，句尾由 ASR 決定
        if (typeof s.text !== 'string' || !REDUNDANT_TAIL.test(s.text)) continue;
        candidates.push({ id: s.id, before: s.text, after: stripTrailingPeriod(s.text) });
      }
    }

    if (candidates.length === 0) continue;
    totalFixed += candidates.length;
    touchedFiles.push(`${course}/${file}（${candidates.length} 句）`);

    console.log(`\n=== ${course}/${file}：${candidates.length} 句 ===`);
    for (const c of candidates.slice(0, 3)) {
      console.log(`  before: …${c.before.slice(-18)}`);
      console.log(`  after : …${c.after.slice(-18)}`);
    }
    if (candidates.length > 3) console.log(`  … 另 ${candidates.length - 3} 句`);

    if (!APPLY) continue;

    // ── 字串層面 surgical replace ──────────────────────────────────
    // 逐個 text 欄位檢查是否以「,。」結尾；若是，把尾端「。」拿掉。
    // 只改字串內最後 2 個字元，其餘位元組完全不動。
    let out = '';
    let cursor = 0;
    const re = /"text":\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    let applied = 0;
    while ((m = re.exec(raw)) !== null) {
      const valueStart = m.index + m[0].indexOf('"') + 1;
      const valueLen = m[0].length - (valueStart - m.index) - 1; // 去掉收尾的 "
      const value = raw.slice(valueStart, valueStart + valueLen);

      // 判斷：值是否以 ,。 或 ，。 結尾，且 JSON 轉義不會影響這個尾端
      // （句號與逗號在 JSON 中都不需轉義）
      if (REDUNDANT_TAIL.test(value)) {
        out += raw.slice(cursor, valueStart + valueLen - 1); // 保留到最後一個句號之前
        applied++;
      } else {
        continue; // 不改，cursor 不動
      }
      cursor = valueStart + valueLen; // 跳過尾端句號
      re.lastIndex = cursor;
    }
    out += raw.slice(cursor);

    // 防呆：套用後必須仍是合法 JSON，且句數不變
    const afterDoc = JSON.parse(out);
    const countSentences = (d) =>
      (d.paragraphs || []).reduce((n, p) => n + (p.sentences || []).length, 0);
    if (countSentences(afterDoc) !== countSentences(doc)) {
      throw new Error(`${file}: 句數改變，中止寫入`);
    }
    if (applied !== candidates.length) {
      throw new Error(`${file}: 字串層面套用數 ${applied} != 候選數 ${candidates.length}，中止寫入`);
    }

    fs.writeFileSync(filePath, out);
    console.log(`  已寫入（字串層面 surgical replace，${applied} 處）`);
  }
}

console.log(`\n合計處理句數：${totalFixed}`);
console.log(`涉及檔案：\n  ${touchedFiles.join('\n  ')}`);
console.log(APPLY ? '模式：APPLY（已修改檔案）' : '模式：dry-run（未修改任何檔案）');
