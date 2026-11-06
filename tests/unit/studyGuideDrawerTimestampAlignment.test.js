import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

// 研讀講記 HTML 契約測試：原話抽屜與正文段落的時間錨點對齊
//
// 背景：PR #347 的 studyGuideVerbatimCoverage.test.js 已能攔截「verbatim 段落
// 沒被渲染成抽屜」（缺段/缺句）。但它**無法**攔截另一類缺陷：
//
//   缺陷 —— 抽屜掛錯原話段（索引錯位）
//     renderer 以段落序號配對（md 段 N → verbatim p_N），但研讀講記係重新分段
//     之研讀文本，與課堂原話的段落切分並非一一對應。於是抽屜仍在、id 也對，
//     涵蓋率斷言全數通過，但讀者點開抽屜看到的是**別段**的原話。
//     PR #345（釋量論第二品 30/31 講）實測即此情形：30 講 74%、31 講 80%
//     的段落掛錯原話段，另缺 15 段 / 56 句原話未渲染。
//
// 本檔以「時間戳自洽」偵測錯位：每個抽屜內第一句原話的音軌時間，應與其
// 對應正文段落的時間錨點相當。錯位愈大，時間差愈大。
//
// 為何不比較 md 段數？（避免誤傷）
//   1. 非抽屜型原話產物（inline <details> 型，如入中論 01/38A）沒有 drawer-p_N
//      抽屜，也沒有對應的逐字稿段落序列。比較 md 段數會把它們誤判為缺陷。
//      → 本檔只作用於 DRAWER 世代（正文含實體 .verbatim-drawer 元素者）。
//   2. 原話內嵌於 HTML、沒有 courses/<course>/verbatim/verbatim_*.json 的課程
//      （如 2025釋量論第二品大組共學 7 檔），無法從 json 建立來源對照。
//      → 本檔改以「HTML 內部時間戳自洽」為準，不依賴任何外部 json，
//      故這些檔案反而**受惠於**本保護（過往無任何契約測試涵蓋它們）。
//
// 容差 60 秒的依據（2026-11-06 實測）：
//   main (537cfec)：全部 11 份 DRAWER 世代研讀講記、210 個抽屜，最大 delta
//   26.35 秒（2025大組共學 lecture_27B drawer-p_11），0 個超過 60 秒 → 0 誤傷。
//   PR #345 head (6fa707d)：364 個可比對抽屜中 86 個超過 60 秒
//   （30 講 37/73、31 講 49/81），最大 delta 726.92 秒（約 12 分鐘）→ 可攔截。
//   故 60 秒落在「main 全過、錯位必失敗」的區間，且遠離 main 的 26.35 秒上界。

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COURSES_DIR = path.join(REPO_ROOT, 'courses');
const TOLERANCE_SECONDS = 60;

function listStudyGuideHtml() {
  const out = [];
  for (const course of fs.readdirSync(COURSES_DIR)) {
    const pub = path.join(COURSES_DIR, course, 'publications');
    if (!fs.existsSync(pub)) continue;
    for (const file of fs.readdirSync(pub)) {
      if (/^lecture_.*_study_guide\.html$/.test(file)) {
        out.push({
          course,
          file,
          abs: path.join(pub, file),
          rel: path.join('courses', course, 'publications', file),
        });
      }
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

// 移除 <style> / <script> 區塊，只留正文，避免共用樣式與函式污染世代判斷。
function bodyOnly(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
}

// 是否為 DRAWER 世代：正文中有 class 含 verbatim-drawer 的實體元素。
function isDrawerGeneration(html) {
  return /<[^>]*class="[^"]*\bverbatim-drawer\b[^"]*"/.test(bodyOnly(html));
}

function parseBody(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyOnly(html)}</body></html>`);
  return dom.window.document.body;
}

// 只認真實抽屜元素（<div id="drawer-p_N" class="...verbatim-drawer...">），
// 不認 data-target / toggleVerbatimDrawer() 之類的字串參照。
function realDrawerElements(body) {
  return [...body.querySelectorAll('.verbatim-drawer')].filter((el) => {
    const id = el.getAttribute('id') ?? '';
    return /^drawer-p_\d+$/.test(id);
  });
}

// 取出元素上承載的音軌秒數。
// 來源依序：playAt(秒) → data-seek / data-start → 「mm:ss」文字時間戳。
function secondsOf(el) {
  if (!el) return null;
  const raw = [
    el.getAttribute?.('onclick') ?? '',
    el.getAttribute?.('data-seek') ?? '',
    el.getAttribute?.('data-start') ?? '',
    el.textContent ?? '',
  ].join(' ');
  const playAt = raw.match(/playAt\(\s*(\d+(?:\.\d+)?)/);
  if (playAt) return parseFloat(playAt[1]);
  const dataAttr = raw.match(/data-(?:seek|start)="(\d+(?:\.\d+)?)/);
  if (dataAttr) return parseFloat(dataAttr[1]);
  const clock = raw.match(/(\d{1,2}):(\d{2})/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  return null;
}

// 找出某抽屜所對應正文段落的時間錨點（.ts-btn）。
// 抽屜與正文段落是 .para-group 內的兄弟節點，故取同組所有 .ts-btn 的最小值。
function paragraphAnchorSeconds(drawer) {
  const group = drawer.closest('.para-group') ?? drawer.parentElement;
  if (!group) return null;
  const seconds = [...group.querySelectorAll('.ts-btn')]
    .map(secondsOf)
    .filter((v) => v !== null);
  return seconds.length ? Math.min(...seconds) : null;
}

test('研讀講記 HTML：原話抽屜的音軌時間須與正文段落時間錨點對齊（DRAWER 世代）', () => {
  const checked = [];
  const violations = [];
  for (const f of listStudyGuideHtml()) {
    const html = fs.readFileSync(f.abs, 'utf8');
    if (!isDrawerGeneration(html)) continue;
    const body = parseBody(html);
    const drawers = realDrawerElements(body);
    if (!drawers.length) continue;
    let fileChecked = 0;
    for (const drawer of drawers) {
      const items = [...drawer.querySelectorAll('.v-item')];
      if (!items.length) continue;
      const itemSeconds = items.map(secondsOf).filter((v) => v !== null);
      if (!itemSeconds.length) continue;
      const paragraphSeconds = paragraphAnchorSeconds(drawer);
      if (paragraphSeconds === null) continue;
      fileChecked++;
      const delta = Math.abs(Math.min(...itemSeconds) - paragraphSeconds);
      if (delta > TOLERANCE_SECONDS) {
        violations.push(
          `${f.rel}: ${drawer.getAttribute('id')} 抽屜首句原話時間與段落時間差 ` +
            `${delta.toFixed(1)} 秒（> ${TOLERANCE_SECONDS} 秒），該抽屜掛錯原話段`,
        );
      }
    }
    if (fileChecked > 0) checked.push(`${f.rel}（${fileChecked} 抽屜）`);
  }

  assert.ok(
    checked.length > 0,
    '沒有任何研讀講記進入時間對齊檢查，契約測試將淪為空轉（請確認 DRAWER 世代判斷條件是否失效）',
  );
  assert.deepEqual(
    violations,
    [],
    `以下研讀講記的原話抽屜與正文段落時間錨點不一致（抽屜可能掛錯原話段）：\n${violations.join('\n')}`,
  );
});
