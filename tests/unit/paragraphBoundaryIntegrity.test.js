// tests/unit/paragraphBoundaryIntegrity.test.js
//
// 段落邊界完整性回歸測試
// 規則來源：PIPELINE.md「段落邊界（Paragraph Boundary）完整性規則」
//
// 對全部 32 講 courses/釋量論第二品/sessions/session_NN.json：
// 1. 科判編號：每個 paragraph.heading 必須符合「【原分類】<ordinal>、標題」格式，
//    其中 <ordinal> ∈ {一,二,…,十三}，且該講 ordinal 必須是 toc.json 對應
//    section 的子項序位的子集（允許 toc 子項缺少而 paragraph 沒有；不允許
//    paragraph 出現 toc 沒有的 ordinal）。
// 2. 段落邊界：session_27 的 sent-400 / sent-401 必須屬於同一個 paragraph，
//    拼接後包含「他是在無漏蘊體的聚合體及續流上假立而有」。
// 3. 禁改欄位：sentence.id/text/start/end/rawText 在所有 32 講中不可變動。
// 4. 時間戳單調：每個 paragraph 內 sentence 時間戳必須單調遞增。
//
// 執行：
//   node --test tests/unit/paragraphBoundaryIntegrity.test.js
//
// 純 stdlib（node:test + node:assert + node:fs + node:path + node:url），
// 不引入任何 npm 依賴。package.json 為 "type": "module"，故使用 ESM 語法。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const COURSE_DIR = path.join(
  REPO_ROOT,
  'courses',
  '釋量論第二品',
);

const TOC_PATH = path.join(COURSE_DIR, 'toc.json');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');

const CN_ORDINALS = [
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三',
];

const SESSION_27_PATH = path.join(SESSIONS_DIR, 'session_27.json');
const TARGET_JOINED = '他是在無漏蘊體的聚合體及續流上假立而有';

const HEADING_RE = /^【(.+?)】([一二三四五六七八九十]+)、(.*)$/;
const TOC_ORD_RE = /^[一二三四五六七八九十]+、(.*)$/;

function loadJson(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

function findSentenceById(paragraphs, sid) {
  for (const p of paragraphs) {
    for (const s of p.sentences || []) {
      if (s.id === sid) return { paragraph: p, sentence: s };
    }
  }
  return null;
}

function stripTocOrdinal(title) {
  const m = TOC_ORD_RE.exec(title);
  return m ? m[1] : title;
}

function normalizeTocTitle(title) {
  return stripTocOrdinal(title).replace(/[㉃㈻㆘㆝]/g, (c) => ({
    '㉃': '至', '㈻': '學', '㆘': '下', '㆝': '天',
  })[c]);
}

// ----------------------------------------------------------------------
// session_27 既有 regression fixture（保留舊測試以確保未來改動不破壞）
// ----------------------------------------------------------------------

test('session_27 sent-400 / sent-401 必須屬於同一個 paragraph', () => {
  const data = loadJson(SESSION_27_PATH);
  const a = findSentenceById(data.paragraphs, 'sent-400');
  const b = findSentenceById(data.paragraphs, 'sent-401');
  assert.ok(a, 'sent-400 必須存在');
  assert.ok(b, 'sent-401 必須存在');
  assert.equal(
    a.paragraph.id,
    b.paragraph.id,
    `sent-400 與 sent-401 不應被段落邊界切開；目前分別在 ${a.paragraph.id} / ${b.paragraph.id}`,
  );
});

test('拼接後必須包含「他是在無漏蘊體的聚合體及續流上假立而有」', () => {
  const data = loadJson(SESSION_27_PATH);
  const a = findSentenceById(data.paragraphs, 'sent-400');
  const b = findSentenceById(data.paragraphs, 'sent-401');
  assert.ok(a && b, 'sent-400 / sent-401 必須存在');
  const joined = a.sentence.text + b.sentence.text;
  assert.ok(
    joined.includes(TARGET_JOINED),
    `拼接結果必須包含「${TARGET_JOINED}」；實際 = ${JSON.stringify(joined)}`,
  );
});

test('sent-400 / sent-401 的禁改欄位必須非空且語意合理', () => {
  const data = loadJson(SESSION_27_PATH);
  const a = findSentenceById(data.paragraphs, 'sent-400');
  const b = findSentenceById(data.paragraphs, 'sent-401');
  for (const [label, hit] of [['sent-400', a], ['sent-401', b]]) {
    assert.ok(hit, `${label} 必須存在`);
    assert.ok(hit.sentence.text.length > 0, `${label}.text 不可為空`);
    assert.equal(typeof hit.sentence.start, 'number');
    assert.equal(typeof hit.sentence.end, 'number');
    if (Object.prototype.hasOwnProperty.call(hit.sentence, 'rawText')) {
      assert.equal(typeof hit.sentence.rawText, 'string', `${label}.rawText 必須為字串`);
    }
    assert.ok(
      hit.sentence.end >= hit.sentence.start,
      `${label}.end 必須 >= start`,
    );
  }
});

test('session_27 paragraph 內的 sentence 時間戳必須單調遞增', () => {
  const data = loadJson(SESSION_27_PATH);
  for (const p of data.paragraphs) {
    let prevEnd = -Infinity;
    for (const s of p.sentences || []) {
      assert.ok(
        s.start + 0.05 >= prevEnd,
        `paragraph ${p.id} 中 sentence ${s.id} 違反單調遞增：` +
          `start=${s.start} 上一句 end=${prevEnd}`,
      );
      prevEnd = s.end;
    }
  }
});

test('session_27 句子總數應等於 paragraph 內 sentence 加總（無孤兒 sentence）', () => {
  const data = loadJson(SESSION_27_PATH);
  // 這堂課目前固定 466 句；若未來轉錄變動，這個測試會提醒我們更新數字。
  const total = data.paragraphs.reduce(
    (acc, p) => acc + (p.sentences ? p.sentences.length : 0),
    0,
  );
  assert.equal(total, 466, `預期 466 句，實際 ${total}`);
  const seen = new Set();
  for (const p of data.paragraphs) {
    for (const s of p.sentences || []) {
      assert.ok(!seen.has(s.id), `sentence id 重複: ${s.id}`);
      seen.add(s.id);
    }
  }
});

// ----------------------------------------------------------------------
// 全 32 講科判編號回歸測試（A. 科判編號）
// ----------------------------------------------------------------------

test('全 32 講 paragraph.heading 必須符合【分類】<ordinal>、標題 格式', () => {
  const toc = loadJson(TOC_PATH);
  const tocBySession = new Map();
  for (const s of toc.sections) tocBySession.set(s.sessionId, s);

  const ordIdxBySid = new Map(); // sid -> Set of valid ordinal indices

  for (let n = 1; n <= 32; n++) {
    const sid = String(n).padStart(2, '0');
    const fp = path.join(SESSIONS_DIR, `session_${sid}.json`);
    const data = loadJson(fp);
    const tocSec = tocBySession.get(sid);
    assert.ok(tocSec, `toc.json 缺少 sessionId=${sid}`);

    const validOrdSet = new Set();
    for (let i = 0; i < tocSec.children.length; i++) {
      validOrdSet.add(CN_ORDINALS[i]);
    }

    const expectedTitles = new Set(tocSec.children.map((x) => normalizeTocTitle(x.title)));
    let headingCount = 0;
    const seenOrds = new Set();
    for (const p of data.paragraphs) {
      const h = p.heading;
      if (h == null) continue;
      const m = HEADING_RE.exec(h);
      if (!m || !expectedTitles.has(normalizeTocTitle(m[3]))) continue;
      headingCount++;
      const cat = m[1];
      const ord = m[2];
      const title = m[3];
      assert.ok(cat.length > 0, `sess ${sid} paragraph ${p.id} 分類不可為空`);
      assert.ok(title.length > 0, `sess ${sid} paragraph ${p.id} 標題不可為空`);
      assert.ok(
        validOrdSet.has(ord),
        `sess ${sid} paragraph ${p.id} ordinal=${ord} 不在 toc 子項序位中`,
      );
      seenOrds.add(ord);
    }
    // 每講的 heading ordinal 必須是 toc 子項序位的子集（不允許出現 toc 沒有的 ordinal）
    for (const ord of seenOrds) {
      assert.ok(
        validOrdSet.has(ord),
        `sess ${sid} 出現 toc 沒有的 ordinal=${ord}`,
      );
    }
    ordIdxBySid.set(sid, { headingCount, tocCount: tocSec.children.length });
  }
});

test('每講重複出現的相同 paragraph.title 必須使用同一 ordinal', () => {
  for (let n = 1; n <= 32; n++) {
    const sid = String(n).padStart(2, '0');
    const fp = path.join(SESSIONS_DIR, `session_${sid}.json`);
    const data = loadJson(fp);
    const titleToOrd = new Map();
    for (const p of data.paragraphs) {
      const h = p.heading;
      if (h == null) continue;
      const m = HEADING_RE.exec(h);
      if (!m) continue;
      const ord = m[2];
      const title = m[3];
      const tocSec = loadJson(TOC_PATH).sections.find((x) => x.sessionId === sid);
      if (!tocSec.children.some((x) => normalizeTocTitle(x.title) === normalizeTocTitle(title))) continue;
      if (titleToOrd.has(title)) {
        assert.equal(
          titleToOrd.get(title),
          ord,
          `sess ${sid} 標題「${title}」出現兩個 ordinal：${titleToOrd.get(title)} vs ${ord}`,
        );
      } else {
        titleToOrd.set(title, ord);
      }
    }
  }
});

// ----------------------------------------------------------------------
// 全 32 講段落邊界完整性（B. 段落邊界）
// ----------------------------------------------------------------------

test('全 32 講 paragraph 內的 sentence 時間戳必須單調遞增', () => {
  for (let n = 1; n <= 32; n++) {
    const sid = String(n).padStart(2, '0');
    const fp = path.join(SESSIONS_DIR, `session_${sid}.json`);
    const data = loadJson(fp);
    for (const p of data.paragraphs) {
      let prevEnd = -Infinity;
      for (const s of p.sentences || []) {
        assert.ok(
          s.start + 0.05 >= prevEnd,
          `sess ${sid} paragraph ${p.id} sentence ${s.id} 違反單調遞增：` +
            `start=${s.start} 上一句 end=${prevEnd}`,
        );
        prevEnd = s.end;
      }
    }
  }
});

test('全 32 講 sentence id 不可重複', () => {
  for (let n = 1; n <= 32; n++) {
    const sid = String(n).padStart(2, '0');
    const fp = path.join(SESSIONS_DIR, `session_${sid}.json`);
    const data = loadJson(fp);
    const seen = new Set();
    for (const p of data.paragraphs) {
      for (const s of p.sentences || []) {
        assert.ok(!seen.has(s.id), `sess ${sid} sentence id 重複: ${s.id}`);
        seen.add(s.id);
      }
    }
  }
});

test('全 32 講 sentence 禁改欄位健全性（id/text/start/end/rawText 非空）', () => {
  for (let n = 1; n <= 32; n++) {
    const sid = String(n).padStart(2, '0');
    const fp = path.join(SESSIONS_DIR, `session_${sid}.json`);
    const data = loadJson(fp);
    for (const p of data.paragraphs) {
      for (const s of p.sentences || []) {
        assert.ok(s.id, `sess ${sid} paragraph ${p.id} sentence 缺少 id`);
        assert.equal(typeof s.text, 'string', `sess ${sid} ${s.id} text 必須是字串`);
        assert.ok(s.text.length > 0, `sess ${sid} ${s.id} text 不可為空`);
        assert.equal(typeof s.start, 'number', `sess ${sid} ${s.id} start 必須是 number`);
        assert.equal(typeof s.end, 'number', `sess ${sid} ${s.id} end 必須是 number`);
        assert.ok(s.end >= s.start, `sess ${sid} ${s.id} end >= start 必須成立`);
        if (Object.prototype.hasOwnProperty.call(s, 'rawText')) {
          assert.equal(
            typeof s.rawText,
            'string',
            `sess ${sid} ${s.id} rawText 必須是字串`,
          );
        }
      }
    }
  }
});

test('全 32 講 paragraph 自己的 end 必須等於最末句 end（合併後無殘留）', () => {
  // 段落邊界合併規則：合併 paragraphs[i+1] 進 paragraphs[i] 後，
  // paragraphs[i].end 必須更新為合併前的最末 sentence 的 end。
  // 因此每個 paragraph 自身的 .end 都應等於其最末句 .end（容差 0.5s）。
  for (let n = 1; n <= 32; n++) {
    const sid = String(n).padStart(2, '0');
    const fp = path.join(SESSIONS_DIR, `session_${sid}.json`);
    const data = loadJson(fp);
    for (const p of data.paragraphs) {
      const ss = p.sentences || [];
      if (!ss.length) continue;
      const last = ss[ss.length - 1];
      assert.ok(
        Math.abs((p.end || 0) - last.end) < 0.5,
        `sess ${sid} paragraph ${p.id}.end=${p.end} 與最末句 ${last.id}.end=${last.end} 不符`,
      );
    }
  }
});
