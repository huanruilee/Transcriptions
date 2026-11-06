import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

// 研讀講記 HTML 契約測試
//
// 背景：PR #345（釋量論第二品 30/31 講研讀講記）CI 全綠，但存在實質缺陷，
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
// 實作改版（2026-11-06，Codex review 2 項 P2 finding 成立後修正）：
//   原版以 regex 在整份 body 上掃字串，產生兩處 false-negative：
//     (A) /drawer-(p_\d+)/g 會同時命中「實體抽屜 id」、data-target="drawer-p_N"、
//         toggleVerbatimDrawer('drawer-p_N') 等「按鈕參照」。當實體抽屜的 id 被破壞
//         （或整個抽屜被刪除）而按鈕參照仍在時，該段仍被算成「有涵蓋」，缺陷不可見。
//     (B) 空抽屜斷言取抽屜開頭 600 字元並檢查是否含中文；但每個抽屜的固定表頭
//         （💬 課堂原話對照…）必含中文，故即使 .v-item 原話全被刪光，斷言仍恆真。
//   改版以 JSDOM 解析（repo 既有慣例，見 tests/unit/tocRemediation.test.js），
//   直接取真實元素與其子元素，不受字串參照或固定表頭干擾。
//   改版同時修掉 Codex 指出的第三項 false-negative（600 字元視窗溢出到下一個抽屜）。
//
// 驗證基準（2026-11-06 實測）：
//   main 537cfec：40 份 study-guide HTML，(B) 0 違規；(A) 套用範圍 4 檔全 100% 通過
//   PR #345 6fa707d（缺陷 2 已修、缺陷 1 未修的版本）：
//     (B) 通過 —— 該版已改走 YouTube iframe 分支，空 src 已消失
//     (A) 失敗 —— 30 講缺 p_75–p_78、31 講缺 p_82–p_92（15 段 / 56 句原話仍未渲染）
//   （早先的 fd8fb6a 版兩條皆失敗；本檔在該版與 6fa707d 版皆能正確分辨。）
//   負向驗證（2026-11-06 實測）：刻意破壞抽屜 id / 刪光 .v-item 後，改版會失敗，
//   舊版不會 —— 證明本版確實具備偵測能力，而非只是「看起來較嚴格」。
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

// 解析正文為 DOM。回傳 null 表示無可解析正文。
function parseBody(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyOnly(html)}</body></html>`);
  return dom.window.document.body;
}

// 是否為 DRAWER 世代：正文中有 class 含 verbatim-drawer 的實體元素。
function isDrawerGeneration(html) {
  return /<[^>]*class="[^"]*\bverbatim-drawer\b[^"]*"/.test(bodyOnly(html));
}

// 取真實抽屜元素（<div id="drawer-p_N" class="...verbatim-drawer...">）。
// 只認 id 屬性值，不認 data-target / toggleVerbatimDrawer() 等字串參照。
function realDrawerElements(body) {
  return [...body.querySelectorAll('.verbatim-drawer')].filter((el) => {
    const id = el.getAttribute('id') ?? '';
    return /^drawer-p_\d+$/.test(id);
  });
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
    const body = parseBody(html);
    // 只計「真實抽屜元素」的 id。若抽屜元素被刪除或 id 被破壞，該段落即視為未渲染，
    // 不會被按鈕上的 data-target / toggleVerbatimDrawer() 字串參照蒙混帶過。
    const drawers = new Set(realDrawerElements(body).map((el) => el.getAttribute('id').slice('drawer-'.length)));
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

test('研讀講記 HTML：DRAWER 世代的每個原話抽屜都有原話內容', () => {
  const checked = [];
  const violations = [];
  for (const f of listStudyGuideHtml()) {
    const html = fs.readFileSync(f.abs, 'utf8');
    if (!isDrawerGeneration(html)) continue;
    const body = parseBody(html);
    const drawers = realDrawerElements(body);
    if (drawers.length === 0) continue;
    // 逐抽屜檢查「實際原話條目」（.v-item 內的 .v-txt），而非表頭文字。
    // 舊版取開頭 600 字元檢查中文字，因固定表頭必含中文而恆真，缺陷不可見。
    const empty = drawers
      .map((el) => {
        const items = [...el.querySelectorAll('.v-item')];
        const texts = items
          .map((it) => (it.querySelector('.v-txt')?.textContent ?? '').replace(/\s+/g, ' ').trim())
          .filter((t) => t.length > 0);
        return { id: el.getAttribute('id'), items: items.length, texts };
      })
      .filter((d) => d.items === 0 || d.texts.length === 0 || !d.texts.some((t) => /[一-鿿]/.test(t)))
      .map((d) => `${d.id}（.v-item ${d.items} 筆）`);
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
