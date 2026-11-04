#!/usr/bin/env node
// 驗證：批次改字的三項品質守門
//   1. 句數不變（未誤刪／誤加句）
//   2. 非標點字元完全未變（以 (paragraph_index, sentence_index) 對齊比對）
//   3. 「殘句未被誤加逗號數 = 0」
//   4. digest 雙演算法正確重算

import fs from 'node:fs';
import path from 'node:path';
// 直接使用 pipeline 官方的 computeSourceDigest，避免重複實作走樣
import { computeSourceDigest } from './content_overview_pipeline.mjs';

const ROOT = '/home/henry/.gx10/xiaofa/workdirs/regress-main';
const BACKUP = '/home/henry/.gx10/xiaofa/workdirs/backups/fix-comma-period-20261104';
const FILES = ['session_09A', 'session_99A'];
const COURSE = '入中論善顯密意疏';

// 標點集合（含半形與全形）
const PUNCT = /[，。！？；：、,.!?;:"'()（）「」『』《》〈〉—…～·]/g;

const stripPunct = (s) => s.replace(PUNCT, '');

// 官方 computeSourceDigest 直接由 pipeline 匯入（見上方 import）
// 句子清單仍需自行 flatten 以做逐句對齊比對（非標點字元守門）
function flattenSentences(transcript) {
  const out = [];
  for (const p of transcript.paragraphs || []) {
    for (const s of p.sentences || []) {
      out.push({ id: s.id, text: s.text, heading: p.heading });
    }
  }
  return out;
}

let fail = 0;
const report = (ok, msg) => {
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${msg}`);
  if (!ok) fail++;
};

for (const file of FILES) {
  const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'courses', COURSE, 'sessions', `${file}.json`), 'utf8'));
  const old = JSON.parse(fs.readFileSync(path.join(BACKUP, `${file}.json`), 'utf8'));

  console.log(`\n=== ${file} ===`);

  // 1. 句數
  const cn = flattenSentences(cur).length;
  const on = flattenSentences(old).length;
  report(cn === on, `句數不變（old=${on} new=${cn}）`);

  // 2. 非標點字元逐句對齊比對
  const cs = flattenSentences(cur);
  const os = flattenSentences(old);
  let nonPunctDiff = 0;
  let textChanged = 0;
  const samples = [];
  for (let i = 0; i < Math.min(cs.length, os.length); i++) {
    if (cs[i].text !== os[i].text) {
      textChanged++;
      if (stripPunct(cs[i].text) !== stripPunct(os[i].text)) {
        nonPunctDiff++;
        if (samples.length < 3) samples.push({ i, old: os[i].text.slice(-14), cur: cs[i].text.slice(-14) });
      }
    }
    // id / heading 不可變
    if (cs[i].id !== os[i].id || cs[i].heading !== os[i].heading) {
      nonPunctDiff++;
    }
  }
  report(nonPunctDiff === 0, `非標點字元未變（差異 ${nonPunctDiff} 處；實際改字 ${textChanged} 句）`);
  samples.forEach((s) => console.log(`        #${s.i}: …${s.old} → …${s.cur}`));

  // 3. 殘句未被誤加逗號：句尾不得出現「逗號+句號」
  let redundant = 0;
  for (const s of cs) {
    if (/[,，]。$/.test(s.text || '')) redundant++;
  }
  report(redundant === 0, `殘留「逗號+句號」結尾 = ${redundant}（應為 0）`);

  // 3b. 未誤加句號（原本句尾有逗號的，修改後仍應有逗號）
  let lostComma = 0;
  for (let i = 0; i < Math.min(cs.length, os.length); i++) {
    const o = os[i].text || '';
    const c = cs[i].text || '';
    if (/[,，]。$/.test(o) && !/[,，]$/.test(c)) lostComma++;
  }
  report(lostComma === 0, `未誤刪句尾逗號（${lostComma} 處）`);

  // 4. digest 重算
  const d = computeSourceDigest(cur);
  const stored = cur.contentOverview?.sourceDigest;
  report(d === stored, `contentOverview.sourceDigest 已同步重算\n        stored=${stored}\n        actual=${d}`);

  // 5. start/end 數值字面格式未漂移（2026-11-04 新增）
  //    JSON.stringify 整檔重新序列化會把 0.0 → 0、207.0 → 207，
  //    造成 52 行非標點漂移。此守門比對「原始 JSON 文字」而非解析後數值。
  const oldRaw = fs.readFileSync(path.join(BACKUP, `${file}.json`), 'utf8');
  const newRaw = fs.readFileSync(path.join(ROOT, 'courses', COURSE, 'sessions', `${file}.json`), 'utf8');
  const numRe = /"(?:start|end)":\s*([0-9.]+)/g;
  const oldNums = oldRaw.match(numRe) || [];
  const newNums = newRaw.match(numRe) || [];
  report(
    oldNums.length === newNums.length && oldNums.every((v, i) => v === newNums[i]),
    `start/end 數值字面格式未漂移（old=${oldNums.length} new=${newNums.length}；逐項字面相同）`
  );

  // 6. 原始 JSON 文字除 text / sourceDigest / quote 欄位外完全不變（最嚴格守門）
  //    sourceDigest 依法必須隨 text 變動而重算；
  //    quote 是 contentOverview 內 AI 生成的來源句逐字快照，
  //    須隨來源句標點修正同步（紅線 6 保護的是 reviews/evidence/** 人工審閱證據，不含此處）。
  const stripTextValues = (s) =>
    s
      .replace(/("text":\s*")(?:[^"\\]|\\.)*(")/g, '$1__TEXT__$2')
      .replace(/("sourceDigest":\s*")[^"]*(")/g, '$1__DIGEST__$2')
      .replace(/("quote":\s*")(?:[^"\\]|\\.)*(")/g, '$1__QUOTE__$2');
  report(
    stripTextValues(oldRaw) === stripTextValues(newRaw),
    '除 text / sourceDigest / quote 欄位外，原始 JSON 位元組完全未變'
  );
}

console.log(`\n${fail === 0 ? '全部通過' : `有 ${fail} 項未通過`}`);
process.exit(fail === 0 ? 0 : 1);
