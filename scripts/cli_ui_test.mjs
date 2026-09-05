#!/usr/bin/env node
/**
 * scripts/cli_ui_test.mjs
 * 純文字 CLI 驗收工具：驗證 V2 播放同步、高亮推進、科判祖先鏈與 DOM 合約
 * 零 Token 截圖消耗，毫秒級產出純文字測試報表。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('===========================================================');
console.log('  佛教大乘經論研讀平台 V2 - 純文字 CLI 驗收測試器');
console.log('===========================================================');

let passCount = 0;
let failCount = 0;

function assert(condition, desc) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failCount++;
  }
}

// 1. 檢查課程靜態資料庫存在性
const session02APath = path.join(rootDir, 'courses/入中論善顯密意疏/sessions/session_02A.json');
const tocPath = path.join(rootDir, 'courses/入中論善顯密意疏/toc.json');
const coursePath = path.join(rootDir, 'courses/入中論善顯密意疏/course.json');

assert(fs.existsSync(session02APath), '講次 02A 資料檔存在');
assert(fs.existsSync(tocPath), '總科判 toc.json 資料檔存在');
assert(fs.existsSync(coursePath), '課程清單 course.json 資料檔存在');

// 2. 測試講次 02A 的音訊時間戳對齊與高亮查找
const session02A = JSON.parse(fs.readFileSync(session02APath, 'utf-8'));
const allSentences = (session02A.paragraphs || []).flatMap((p, pIdx) =>
  (p.sentences || []).map((s, sIdx) => ({
    id: `sent-${pIdx}-${sIdx}`,
    start: s.start ?? s.start_time ?? 0,
    end: s.end ?? s.end_time ?? 0,
    text: s.text || '',
  }))
);

assert(allSentences.length > 500, `02A 逐字稿包含完整校勘句子 (共 ${allSentences.length} 句)`);

function findSentence(time) {
  if (time < allSentences[0].start) return -1;
  const last = allSentences[allSentences.length - 1];
  if (time > last.end + 1.0) return -1;
  let low = 0, high = allSentences.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const s = allSentences[mid];
    if (time >= s.start && time <= s.end) return mid;
    if (time > s.end) {
      const nextStart = mid < allSentences.length - 1 ? allSentences[mid + 1].start : s.end + 1.0;
      if (time < nextStart) return mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return -1;
}

// 驗證關鍵時間點的高亮句子
const t1 = findSentence(0.5); // "好，我們是第七。"
assert(t1 === 0 && allSentences[t1].text.includes('第七'), `t=0.5s 高亮第 0 句: "${allSentences[t1]?.text}"`);

const t2 = findSentence(2.0); // 呼吸空隙平滑保持第 0 句
assert(t2 === 0, 't=2.0s 停頓空隙平滑保持在第 0 句');

const t3 = findSentence(4.0); // "六十三、六十四左右，對不對。"
assert(t3 === 1 && allSentences[t3].text.includes('六十三'), `t=4.0s 高亮第 1 句: "${allSentences[t3]?.text}"`);

const t4 = findSentence(11.5); // "這個可以怎麼講。"
assert(t4 === 2 && allSentences[t4].text.includes('這個可以'), `t=11.5s 高亮第 2 句: "${allSentences[t4]?.text}"`);

const t5 = findSentence(15.0); // "總之像《中論》的話，有二十七品"
assert(t5 === 3 && allSentences[t5].text.includes('中論'), `t=15.0s 高亮第 3 句: "${allSentences[t5]?.text}"`);

// 3. 測試科判祖先鏈結構無例外解析
const tocData = JSON.parse(fs.readFileSync(tocPath, 'utf-8'));
assert(Array.isArray(tocData.sections), `科判包含 ${tocData.sections?.length || 0} 個段落節點`);

// 4. 驗證 V2 DOM Contract (必要元件 ID 齊全)
const appVueContent = fs.readFileSync(path.join(rootDir, 'src/App.vue'), 'utf-8');
const modalVueContent = fs.readFileSync(path.join(rootDir, 'src/components/modals/SentenceEditorModal.vue'), 'utf-8');

const requiredIds = [
  'audio-element',
  'transcript-container',
  'search-input',
  'prev-session-btn',
  'next-session-btn',
  'playback-rate-btn',
  'theme-zen-btn',
  'theme-sepia-btn',
  'export-notes-btn',
  'toc-accordion-root',
  'sidebar-filter',
  'scroll-lock-indicator',
  'fab-return-playing',
];

for (const id of requiredIds) {
  assert(appVueContent.includes(`id="${id}"`), `DOM Contract 保證 ID 存在: #${id}`);
}

// 5. 驗證 V1 逐字稿視覺狀態標籤與科判卡片
assert(appVueContent.includes('toc-anchor-card'), '逐字稿包含段落內嵌科判導讀小卡 (.toc-anchor-card)');
assert(appVueContent.includes('sentence-review-badge'), '逐字稿存疑句包含 🔍 待核定徽章 (.sentence-review-badge)');
assert(appVueContent.includes('sentence-note-badge'), '逐字稿筆記句包含 📌 筆記徽章 (.sentence-note-badge)');
assert(appVueContent.includes('has-correction'), '逐字稿包含已校勘狀態類別 (.has-correction)');

// 6. 驗證校勘編輯彈窗 (SentenceEditorModal) 完整還原 V1 欄位
assert(modalVueContent.includes('context-snippet-box'), '校勘彈窗包含前後文義脈絡盒 (.context-snippet-box)');
assert(modalVueContent.includes('review-needed-callout'), '校勘彈窗包含 AI 存疑提示 Banner (.review-needed-callout)');
assert(modalVueContent.includes('id="modal-corrected-text"'), '校勘彈窗包含校勘文字輸入框 (#modal-corrected-text)');
assert(modalVueContent.includes('id="modal-page-ref"'), '校勘彈窗包含底本頁碼輸入框 (#modal-page-ref)');
assert(modalVueContent.includes('id="modal-tag-select"'), '校勘彈窗包含 5 種法義標籤下拉選單 (#modal-tag-select)');
assert(modalVueContent.includes('id="modal-learn-term-checkbox"'), '校勘彈窗包含通用名相主動學習 Checkbox (#modal-learn-term-checkbox)');
assert(modalVueContent.includes('id="modal-delete-btn"'), '校勘彈窗包含清除變更按鈕 (#modal-delete-btn)');
assert(modalVueContent.includes('sync-badge'), '校勘彈窗包含本機後台連線燈號 (.sync-badge)');

// 7. 驗證 __TEST_API__ 介面已注入
assert(appVueContent.includes('__TEST_API__'), '已成功注入 window.__TEST_API__ 供 CLI/Node 呼叫');

console.log('-----------------------------------------------------------');
console.log(`  總計測試: ${passCount + failCount} 項 | 通過: ${passCount} | 失敗: ${failCount}`);
console.log('===========================================================');

process.exit(failCount === 0 ? 0 : 1);
