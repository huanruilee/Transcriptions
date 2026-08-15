// 27B 逐字稿品管測試
// 預設為 OPT-IN — 不在 `npm test` 跑（27B 草稿尚未校正到品管標準）
// 啟用方式：TRANSCRIPTIONS_RUN_QUALITY=1 npm test
// 或單跑：  npm run test:quality
//
// 規則：terminology / punctuation / structure / timestamp

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 預設跳過整套測試，除非顯式啟用
// 啟用：TRANSCRIPTIONS_RUN_QUALITY=1 npm test
const QUALITY_ENABLED = process.env.TRANSCRIPTIONS_RUN_QUALITY === '1';

// 支援 SESSION_PATH 環境變數覆蓋（用於比較 v1/v2）
const SESSION_PATH = process.env.SESSION_PATH
  ? path.resolve(process.env.SESSION_PATH)
  : path.join(__dirname, '../courses/入中論善顯密意疏/sessions/session_27B.json');

// ===== 1. 禁用詞檢查（ASR 錯字不能再出現）=====
const FORBIDDEN_TERMS = {
  '世俗地': '應為「世俗諦」',
  '望见': '應為「望見」',
  '聖意地': '應為「勝義諦」',
  '圣意地': '應為「勝義諦」',
  '聖一地': '應為「勝義諦」',
  '圣一地': '應為「勝義諦」',
  '圣义地': '應為「勝義諦」',
  '圣与地': '應為「勝義諦」',
  '聖義地': '應為「勝義諦」',
  '聖與地': '應為「勝義諦」',
  '二帝': '應為「二諦」',
  '四肢低': '應為「世俗諦」',
  '身意低': '應為「勝義諦」',
  '身識低': '應為「勝義諦」',
  '四书': '應為「世俗諦」',
  '二体型': '應為「二體性」',
  '二體型': '應為「二體性」',
  '二题性': '應為「二諦性」',
  '主佛': '應為「諸佛」',
  '吴敏': '應為「無明」',
  '政治': '應為「正智」',
  '演义针': '應為「如意珠」',
  '飞吻': '應為「非聞」',
  '讲点': '應為「講到」',
  '反复': '應為「反覆」（簡轉繁未做）',
  '明眼': '應為「明現」',
  '五不能降': '應為「無不能降」',
  '圣一四祖': '應為「勝義世俗」',
  '有二体': '應為「有二體」',
  '博弈': '應為「部派」',
  '二显': '應為「二顯」',
  '正義': '應為「正智」',
  '剑法': '應為「見法」',
  '消文字': '應為「消文」',
  '补不起': '應為「補不起」',
  '尽量的补': '應為「盡量地補」',
  '不见得': '應為「不見得」',
  '非说雅': '應為「非說有」',
  '一体官代': '應為「一體觀待」',
  '一生一圣人': '應為「一性一聖人」',
  '分为二帝': '應為「分為二諦」',
  '一体跟一体': '應為「一體跟異體」',
  '一體跟一體': '應為「一體跟異體」',
};

// ===== 2. 必用術語（soft metric，記錄但不阻擋）=====
const REQUIRED_TERMS = ['勝義諦', '世俗諦', '二諦', '無明', '正智'];

// ===== 3. 標點密度 =====
const PUNCT_PATTERN = /[。？！，：；、]/;

function loadSession() {
  if (!fs.existsSync(SESSION_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
}

function getAllText(session) {
  const texts = [];
  for (const p of session.paragraphs || []) {
    for (const s of p.sentences || []) {
      texts.push(s.text);
    }
  }
  return texts;
}

function getAllSentences(session) {
  const sents = [];
  for (const p of session.paragraphs || []) {
    for (const s of p.sentences || []) {
      sents.push({ ...s, paragraphTitle: p.title });
    }
  }
  return sents;
}

// ===== 測試套件 =====
// 預設 skip（等 27B 校正完成）；啟用：TRANSCRIPTIONS_RUN_QUALITY=1 npm test
const qualityTest = QUALITY_ENABLED ? test : test.skip;
qualityTest('27B 逐字稿品管測試', async (t) => {
  const session = loadSession();

  await t.test('session_27B.json 存在且結構正確', () => {
    assert.ok(session, 'session_27B.json 不存在');
    assert.ok(session.paragraphs, '沒有 paragraphs');
    assert.ok(Array.isArray(session.paragraphs), 'paragraphs 不是陣列');
    assert.ok(session.paragraphs.length > 0, 'paragraphs 是空的');
  });

  await t.test('1. 禁用詞檢查（hard fail）', () => {
    if (!session) return;
    const allText = getAllText(session).join('\n');
    const found = [];
    for (const [term, hint] of Object.entries(FORBIDDEN_TERMS)) {
      const count = (allText.match(new RegExp(term, 'g')) || []).length;
      if (count > 0) {
        found.push(`  - 「${term}」${hint}（${count} 次）`);
      }
    }
    if (found.length > 0) {
      throw new Error(`發現 ${found.length} 個禁用詞：\n${found.join('\n')}`);
    }
  });

  await t.test('2. 必用術語（soft metric）', () => {
    if (!session) return;
    const allText = getAllText(session).join('\n');
    const stats = {};
    for (const term of REQUIRED_TERMS) {
      const count = (allText.match(new RegExp(term, 'g')) || []).length;
      stats[term] = count;
    }
    console.log(`  必用術語統計：`, stats);
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    assert.ok(total > 0, '核心術語未出現');
  });

  await t.test('3. 標點密度（hard fail）', () => {
    if (!session) return;
    const sents = getAllSentences(session);
    const noPunct = sents.filter(s => !PUNCT_PATTERN.test(s.text));
    if (noPunct.length > 0) {
      const examples = noPunct.slice(0, 3).map(s => `  - [${s.start}s] ${s.text.slice(0, 40)}`).join('\n');
      throw new Error(`${noPunct.length}/${sents.length} 句無標點：\n${examples}`);
    }
  });

  await t.test('4. 段落長度（soft metric）', () => {
    if (!session) return;
    const issues = [];
    const stats = [];
    for (const p of session.paragraphs) {
      const len = (p.sentences || []).reduce((acc, s) => acc + s.text.length, 0);
      stats.push({ title: p.title, len });
      if (len < 100) issues.push(`[${p.title}] 過短 (${len} 字)`);
      if (len > 500) issues.push(`[${p.title}] 過長 (${len} 字)`);
    }
    console.log(`  段落統計：`, stats);
    if (issues.length > 0) {
      console.warn(`  段落長度警告：\n${issues.join('\n')}`);
    }
    // soft metric，不 throw
  });

  await t.test('5. 時間戳連續（hard fail）', () => {
    if (!session) return;
    const sents = getAllSentences(session);
    const issues = [];
    let prev = null;
    for (const s of sents) {
      if (typeof s.start !== 'number' || typeof s.end !== 'number') {
        issues.push(`[${s.start}] 時間戳格式錯`);
        continue;
      }
      if (s.end <= s.start) {
        issues.push(`[${s.start}s] end <= start (${s.start}->${s.end})`);
      }
      if (prev && s.start < prev.end) {
        issues.push(`[${s.start}s] 與上一句重疊 (prev end ${prev.end})`);
      }
      prev = s;
    }
    if (issues.length > 0) {
      throw new Error(`時間戳問題：\n${issues.slice(0, 5).join('\n')}`);
    }
  });

  await t.test('6. 語意段落標題（hard fail）', () => {
    if (!session) return;
    const noTitle = session.paragraphs.filter(p => !p.title || p.title.trim() === '');
    if (noTitle.length > 0) {
      throw new Error(`${noTitle.length}/${session.paragraphs.length} 段無標題`);
    }
  });

  // ===== AGY 建議的新規則（佛法專業層面）=====

  await t.test('7. 段落標題佔位符檢查（hard fail）', () => {
    if (!session) return;
    const placeholder = session.paragraphs.filter(p => /^【?第\d+段】?$/.test((p.title || '').trim()));
    if (placeholder.length > 0) {
      throw new Error(`${placeholder.length} 段標題是佔位符（第X段）：\n${placeholder.map(p => `  - ${p.title}`).join('\n')}`);
    }
  });

  await t.test('8. 系統/模型殘留過濾（hard fail）', () => {
    if (!session) return;
    const allText = getAllText(session).join('\n');
    const metaPatterns = [
      /^好的，以下是校正後的逐字稿/,
      /請您提供需要校正的逐字稿內容/,
      /^這是一份/,
      /^好的，請您提供/,
    ];
    const found = [];
    for (const re of metaPatterns) {
      if (re.test(allText)) {
        found.push(`  - 匹配 ${re}`);
      }
    }
    if (found.length > 0) {
      throw new Error(`發現 LLM 系統殘留：\n${found.join('\n')}`);
    }
  });

  await t.test('9. 佛學同音錯字字典（hard fail）', () => {
    if (!session) return;
    const allText = getAllText(session).join('\n');
    const homophone = {
      '一切種子': '應為「一切種智」（佛陀的遍知）',
      '壞毛病': '應為「幻馬」（魔術師幻術譬喻）',
      '換象、換馬': '應為「幻象、幻馬」',
      '換馬': '應為「幻馬」',
      '換象': '應為「幻象」',
      '平直四屬地': '應為「瓶子是世俗諦」',
      '菩提心四類': '應為《菩提心釋》',
      '演繹避障': '應為「無明翳障」',
      '前忍道': '應為「前人」（前代師長）',
      '聖亦非非會盡': '應為「勝義非慧境」',
      '聖亦非會盡': '應為「勝義非慧境」',
      '有二諦的會': '應為「有二現的慧」',
      '會盡聖意': '應為「勝義非慧境」',
      '將坐十尊': '應為「諸佛世尊」',
      '紫梭梭': '應為「自許的勝義」或「自性」',
      '叔弟': '應為「世俗諦」或「勝義諦」',
      '生一地': '應為「勝義諦」',
      '生於地': '應為「勝義諦」',
      '自性自責': '應為「自性自許」',
      '人見（人無我）爭議': '應為「能見真義理智」',
    };
    const found = [];
    for (const [term, hint] of Object.entries(homophone)) {
      const count = (allText.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (count > 0) {
        found.push(`  - 「${term}」${hint}（${count} 次）`);
      }
    }
    if (found.length > 0) {
      throw new Error(`發現 ${found.length} 個佛學同音錯字：\n${found.join('\n')}`);
    }
  });

  await t.test('10. 應成派禁忌術語檢驗（hard fail）', () => {
    if (!session) return;
    const allText = getAllText(session).join('\n');
    // 應成派不許自證分：出現「自證」必須前有「破/非/無」
    const selfProof = [];
    const re = /[^。！？\n]*自證[^。！？\n]*/g;
    let m;
    while ((m = re.exec(allText)) !== null) {
      const ctx = m[0];
      // 檢查前 5 字是否有否定詞
      const before = ctx.slice(0, 5);
      if (!/(破|非|無|不|遮|簡)/.test(before)) {
        selfProof.push(`  - ${ctx.slice(0, 40)}`);
      }
    }
    if (selfProof.length > 0) {
      throw new Error(`應成派不許自證分，發現正向安立：\n${selfProof.join('\n')}`);
    }
  });

  await t.test('11. 經典引文專有名詞比對（hard fail）', () => {
    if (!session) return;
    const allText = getAllText(session).join('\n');
    const canonical = {
      '《父子相見會》': '父子相見會',
      '《入行論》': '入行論',
      '《菩提心釋》': '菩提心釋',
      '月稱論師': '月稱',
      '佛護論師': '佛護',
      '寂天菩薩': '寂天',
      '清辨論師': '清辨',
      '宗喀巴大師': '宗喀巴',
    };
    const found = [];
    for (const [correct, wrong] of Object.entries(canonical)) {
      // 檢查正確術語是否出現（若完全沒出現，可能被錯寫）
      if (!allText.includes(correct)) {
        found.push(`  - 未出現「${correct}」（可能被錯寫）`);
      }
    }
    if (found.length > 0) {
      throw new Error(`經典引文專有名詞缺失：\n${found.join('\n')}`);
    }
  });
});
