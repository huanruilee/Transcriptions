/**
 * tests/unit/proofreadingQualityGates.test.js
 * Verification of Automated Proofreading Workflow Improvements:
 * 1. Outline Scaffolding & Letter Recovery (戌一, 明於何世俗)
 * 2. Doctrinal Term Phonetic Correction (增益, 障蔽, 自性)
 * 3. Holy Citation & Root Text Grounding (能仁說名/說為, 楞伽經引文)
 * 4. OpenCC Defensive Filter (無明了 protection)
 * 5. Batch pipeline configuration checks in batch_convert_all.py
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');

test('Proofreading Quality Gate: Outline & Doctrinal Rules in Pipeline', (t) => {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'batch_convert_all.py');
  assert.ok(existsSync(scriptPath), 'batch_convert_all.py must exist');
  const content = readFileSync(scriptPath, 'utf8');

  // 1. Outline Scaffolding
  assert.match(content, /outline_context\s*=/, 'Pipeline must build outline context');
  assert.match(content, /當前講次宗喀巴大師科判綱目/, 'Prompt must inject outline headings');

  // 2. Glossary pre-masking
  assert.match(content, /物\[意一\]嗎.*戌一嗎/, 'Must map 物意/物一 -> 戌一');
  assert.match(content, /民\[語语\]何世俗.*明於何世俗/, 'Must map 民語 -> 明於');
  assert.match(content, /真意.*增益/, 'Must map 真意 -> 增益');
  assert.match(content, /障\[必畢\]為體.*障蔽為體/, 'Must map 障必為體 -> 障蔽為體');
  assert.match(content, /來人所\[為名\].*能仁說為/, 'Must map 來人所為/名 -> 能仁說為');
  assert.match(content, /無\[信信\]而迷亂.*無性而迷亂/, 'Must map 無信而迷亂 -> 無性而迷亂');
  assert.match(content, /\[虛虚\]為真世俗.*許為真世俗/, 'Must map 虛為真世俗 -> 許為真世俗');
  assert.match(content, /影像自行空.*影像自性空/, 'Must map 影像自行空 -> 影像自性空');

  // 3. OpenCC Defensive Filter
  assert.match(content, /\.replace\("無明瞭", "無明了"\)/, 'Must defend 無明了 from OpenCC over-conversion');
});

test('Proofreading Quality Gate: Session 30B Text Purity and Conformance', (t) => {
  const sessionPath = path.join(PROJECT_ROOT, 'courses', '入中論善顯密意疏', 'sessions', 'session_30B.json');
  assert.ok(existsSync(sessionPath), 'session_30B.json must exist');
  const session = JSON.parse(readFileSync(sessionPath, 'utf8'));

  const allText = session.paragraphs.flatMap(p => p.sentences.map(s => s.text)).join(' ');

  // Verified corrections must exist in session_30B text
  assert.ok(allText.includes('這個是戌一嗎'), 'Must contain "這個是戌一嗎" (corrected from 物意)');
  assert.ok(allText.includes('明於何世俗前為諦'), 'Must contain "明於何世俗前為諦" (corrected from 民語/名言)');
  assert.ok(allText.includes('障蔽'), 'Must contain "障蔽" (corrected from 藏幣/藏自性)');
  assert.ok(allText.includes('增益為有自性'), 'Must contain "增益為有自性" (corrected from 真意為有自信)');
  assert.ok(allText.includes('能仁說名世俗諦') || allText.includes('能仁說為世俗諦'), 'Must contain "能仁說名/為世俗諦" (corrected from 來人所為)');
  assert.ok(allText.includes('無性而迷亂，許為真世俗'), 'Must contain "無性而迷亂，許為真世俗" (corrected from 無信而迷亂虛為真世俗)');
  assert.ok(allText.includes('無明了'), 'Must contain "無明了" (defended against 無明瞭)');

  // Corruptions must NOT exist
  assert.ok(!allText.includes('這個是物意嗎'), 'Must not contain "這個是物意嗎"');
  assert.ok(!allText.includes('民語何世俗'), 'Must not contain "民語何世俗"');
  assert.ok(!allText.includes('真意為有自信'), 'Must not contain "真意為有自信"');
  assert.ok(!allText.includes('來人所為世間'), 'Must not contain "來人所為世間"');
  assert.ok(!allText.includes('無明瞭'), 'Must not contain "無明瞭"');
});

test('Proofreading Quality Gate: Session 31B Text Purity and Conformance', (t) => {
  const sessionPath = path.join(PROJECT_ROOT, 'courses', '入中論善顯密意疏', 'sessions', 'session_31B.json');
  assert.ok(existsSync(sessionPath), 'session_31B.json must exist');
  const session = JSON.parse(readFileSync(sessionPath, 'utf8'));

  const allText = session.paragraphs.flatMap(p => p.sentences.map(s => s.text)).join(' ');
  const headings = session.paragraphs.map(p => p.heading || '').join(' ');

  // Verified corrections must exist in session_31B text
  assert.ok(allText.includes('名言識'), 'Must contain "名言識" (corrected from 明眼識)');
  assert.ok(allText.includes('染污無明'), 'Must contain "染污無明" (corrected from 佔物無明)');
  assert.ok(allText.includes('十二緣起'), 'Must contain "十二緣起" (corrected from 十二元緊)');
  assert.ok(allText.includes('有支所攝'), 'Must contain "有支所攝" (corrected from 有之所設)');
  assert.ok(allText.includes('能立太無關係'), 'Must contain "能立太無關係" (corrected from 女兒太無關係)');
  assert.ok(allText.includes('瓶衣等'), 'Must contain "瓶衣等" (corrected from 憑子老/憑衣等)');
  assert.ok(allText.includes('清淨地菩薩'), 'Must contain "清淨地菩薩" (corrected from 精進地菩薩)');

  // Heading must not contain residual errors
  assert.ok(headings.includes('名言識前非諦'), 'Heading must contain "名言識前非諦"');
  assert.ok(!headings.includes('明眼識'), 'Heading must not contain "明眼識"');

  // Corruptions must NOT exist
  assert.ok(!allText.includes('明眼識'), 'Must not contain "明眼識"');
  assert.ok(!allText.includes('佔物無明'), 'Must not contain "佔物無明"');
  assert.ok(!allText.includes('十二元緊'), 'Must not contain "十二元緊"');
  assert.ok(!allText.includes('有之所設'), 'Must not contain "有之所設"');
  assert.ok(!allText.includes('女兒太無關係'), 'Must not contain "女兒太無關係"');
});

test('Proofreading Quality Gate: Session 32A Text Purity and Review Markers', () => {
  const session32APath = path.join(__dirname, '../../courses/入中論善顯密意疏/sessions/session_32A.json');
  assert.ok(existsSync(session32APath), 'Session 32A file must exist');

  const session = JSON.parse(readFileSync(session32APath, 'utf8'));
  let allText = '';
  let reviewNeededCount = 0;

  for (const p of session.paragraphs) {
    for (const s of p.sentences) {
      allText += s.text + ' ';
      if (s.reviewNeeded) {
        reviewNeededCount++;
        assert.ok(s.uncertainty && s.uncertainty.length > 0, 'Uncertainty reason must be non-empty when reviewNeeded is true');
      }
    }
  }

  // Must not contain known ASR errors
  assert.ok(!allText.includes('皮活沙'), 'Must not contain "皮活沙" (should be 毘婆沙)');
  assert.ok(!allText.includes('皮革沙'), 'Must not contain "皮革沙" (should be 毘婆沙)');
  assert.ok(!allText.includes('撒家眼見'), 'Must not contain "撒家眼見" (should be 薩迦耶見)');
  assert.ok(!allText.includes('長一自在我空'), 'Must not contain "長一自在我空" (should be 常一自在我空)');
  assert.ok(!allText.includes('生文跟獨久'), 'Must not contain "生文跟獨久" (should be 聲聞跟獨覺)');
  assert.ok(!allText.includes('十有空'), 'Must not contain "十有空" (should be 實有空)');
  assert.ok(!allText.includes('三聖 五道'), 'Must not contain "三聖 五道" (should be 三乘 五道)');
  assert.ok(!allText.includes('人回的根本'), 'Must not contain "人回的根本" (should be 輪迴的根本)');
  assert.ok(!allText.includes('二字的第一個'), 'Must not contain "二字的第一個" (should be 十二支的第一個)');

  // Must have uncertainty review markers for web UI verification
  assert.ok(reviewNeededCount > 0, `Must have marked uncertain sentences for web UI review (found ${reviewNeededCount})`);
});

