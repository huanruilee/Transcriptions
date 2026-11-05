import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 研讀講記 HTML 契約測試
//
// 背景：PR #345（釋量論第二品 30/31 講研讀講記）CI 全綠，但存在兩個實質缺陷，
// 現有 npm test 完全抓不到：
//   缺陷 1 —— 研讀講記 md 少寫段落，導致 verbatim 原話抽屜未渲染（30 講缺 p_75–p_78、
//              31 講缺 p_82–p_92，合計 15 段 / 56 句原話不見於網頁）
//   缺陷 2 —— <audio src=""> 空來源且無 YouTube iframe fallback，播放器無聲
//
// 本檔把「CI 全綠」與「可合併」之間的落差結構化：讓上述兩類缺陷直接讓 npm test 失敗。
//
// 範圍界定（重要，避免誤報）：
//   repo 內研讀講記 HTML 有三種模板世代，必須分辨：
//     1. DRAWER 世代 —— 正文含 class 含 verbatim-drawer 的元素，原話以 drawer-p_N 抽屜呈現
//     2. DETAILS 世代 —— 原話以 inline <details> 呈現，無 drawer-p_N id
//     3. PLAIN 世代 —— 無原話對照層
//   判斷世代時必須排除 <style>/<script> 區塊：多數頁面都含共用的 verbatim-drawer
//   樣式與開合函式，只看字串會把「無抽屜的純文字講記」誤判為 DRAWER 世代。
//   本檔的涵蓋率斷言只套用於 DRAWER 世代（有實體抽屜元素者）。
//
// 驗證基準（2026-11-06 實測）：
//   main 537cfec：40 份 study-guide HTML，(B) 0 違規；(A) 套用範圍 4 檔全 100% 通過
//   PR #345 fd8fb6a：(B) 2 檔違規（30/31 講空 src）；(A) 30 講缺 4 段、31 講缺 11 段
//
// 已知覆蓋缺口（誠實揭露，非缺陷）：
//   courses/2025釋量論第二品大組共學 與 courses/入中論善顯密意疏 的多數講次使用
//   DRAWER 渲染器，但其原話並未存成 courses/<course>/verbatim/verbatim_*.json，
//   而是內嵌於 HTML。因此涵蓋率斷言無法對它們建立「來源對照」，
//   這類課程目前僅受「空抽屜」與「音訊來源」兩條斷言保護。
//   要補齊需先統一各課程的原話來源格式，屬資料結構層工作，不在本測試範圍。
//   （2026-11-06 實測：所有 drawer-p_N 皆為靜態 HTML，非 JS 動態生成，
//     故 bodyOnly() 移除 style/script 不會造成漏判。）

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const COURSES_DIR = path.join(REPO_ROOT, 'courses');

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

function listVerbatimJson() {
  const out = [];
  for (const course of fs.readdirSync(COURSES_DIR)) {
    const dir = path.join(COURSES_DIR, course, 'verbatim');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (/^verbatim_.*\.json$/.test(file)) {
        out.push({ course, file, abs: path.join(dir, file) });
      }
    }
  }
  return out.sort((a, b) => a.abs.localeCompare(b.abs));
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

test('研讀講記 HTML：音訊來源非空，或存在 YouTube iframe fallback', () => {
  const files = listStudyGuideHtml();
  assert.ok(files.length > 0, '找不到任何研讀講記 HTML，契約測試將淪為空轉');
  const violations = [];
  for (const f of files) {
    const html = fs.readFileSync(f.abs, 'utf8');
    const body = bodyOnly(html);
    const audioSrcs = [...body.matchAll(/<audio[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
    const sourceSrcs = [...body.matchAll(/<source[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
    // 空字串、空白、以及 "#"（佔位而無實體音檔）皆視為無效來源。
    const invalid = [...audioSrcs, ...sourceSrcs].filter(
      (s) => s.trim() === '' || s.trim() === '#',
    );
    const hasYoutubeFallback = body.includes('youtube.com/embed');
    // 頁面完全沒有 <audio> 元素時，只靠 YouTube iframe 播放是合法設計，不算缺陷。
    // 但一旦頁面放了 <audio> 卻給了無效來源，就是缺陷 —— YouTube fallback 不應為
    // 壞掉的 audio 元素背書（讀者按播放只會得到空白播放器）。
    if (invalid.length > 0) {
      violations.push(
        `${f.rel}: 無效音訊來源 ${invalid.length} 個（${invalid.map((s) => JSON.stringify(s)).join(', ')}）` +
          `${hasYoutubeFallback ? '，雖有 YouTube fallback 仍為缺陷' : '，且無 YouTube fallback'}`,
      );
    }
  }
  assert.deepEqual(
    violations,
    [],
    `以下研讀講記存在無效音訊來源（讀者聽不到音檔）：\n${violations.join('\n')}`,
  );
});

test('研讀講記 HTML：原話抽屜涵蓋率 100%（DRAWER 世代）', () => {
  const checked = [];
  const violations = [];
  for (const vb of listVerbatimJson()) {
    const data = JSON.parse(fs.readFileSync(vb.abs, 'utf8'));
    const paragraphIds = Object.keys(data.paragraphs ?? {});
    if (paragraphIds.length === 0) continue;
    const sessionId =
      data.sessionId ?? vb.file.replace(/^verbatim_/, '').replace(/\.json$/, '');
    const htmlRel = path.join(
      'courses',
      vb.course,
      'publications',
      `lecture_${sessionId}_study_guide.html`,
    );
    const htmlAbs = path.join(REPO_ROOT, htmlRel);
    if (!fs.existsSync(htmlAbs)) continue; // 無對應研讀講記頁面者不適用本斷言
    const html = fs.readFileSync(htmlAbs, 'utf8');
    // 只有 DRAWER 世代才以 drawer-p_N 綁定段落；DETAILS 世代編號慣例不同，不套用。
    if (!isDrawerGeneration(html)) continue;
    const body = bodyOnly(html);
    const drawers = new Set([...body.matchAll(/drawer-(p_\d+)/g)].map((m) => m[1]));
    const missing = paragraphIds.filter((id) => !drawers.has(id));
    checked.push(`${vb.course}/${sessionId}`);
    if (missing.length > 0) {
      const missingSentences = missing.reduce(
        (sum, id) => sum + (data.paragraphs[id]?.length ?? 0),
        0,
      );
      violations.push(
        `${htmlRel}: verbatim 段落 ${paragraphIds.length} 段，抽屜 ${drawers.size} 個，` +
          `未渲染 ${missing.length} 段 / ${missingSentences} 句（${missing.join(', ')}）`,
      );
    }
  }
  assert.ok(
    checked.length > 0,
    '沒有任何研讀講記進入涵蓋率檢查，契約測試將淪為空轉（請確認 DRAWER 世代判斷條件是否失效）',
  );
  assert.deepEqual(
    violations,
    [],
    `以下研讀講記的原話抽屜未 100% 涵蓋 verbatim 段落（讀者看不到部分原話）：\n${violations.join('\n')}`,
  );
});

test('研讀講記 HTML：DRAWER 世代的每個原話抽屜都有內容', () => {
  const checked = [];
  const violations = [];
  for (const f of listStudyGuideHtml()) {
    const html = fs.readFileSync(f.abs, 'utf8');
    if (!isDrawerGeneration(html)) continue;
    const body = bodyOnly(html);
    // 取每個抽屜元素開頭的片段，確認不是空抽屜（有 id 但沒渲染出原話）。
    const drawers = [...body.matchAll(/<[^>]*class="[^"]*\bverbatim-drawer\b[^"]*"[^>]*>([\s\S]{0,600})/g)];
    if (drawers.length === 0) continue;
    const empty = drawers
      .map((m, i) => ({ i, head: m[1] }))
      .filter((d) => !/[一-鿿]/.test(d.head))
      .map((d) => `抽屜 #${d.i}`);
    checked.push(f.rel);
    if (empty.length > 0) {
      violations.push(`${f.rel}: ${empty.length} 個抽屜沒有原話內容（${empty.join(', ')}）`);
    }
  }
  assert.ok(
    checked.length > 0,
    '沒有任何 DRAWER 世代研讀講記進入抽屜內容檢查，契約測試將淪為空轉',
  );
  assert.deepEqual(
    violations,
    [],
    `以下研讀講記存在沒有內容的空抽屜（讀者點開是空白）：\n${violations.join('\n')}`,
  );
});
