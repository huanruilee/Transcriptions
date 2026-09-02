/**
 * tests/unit/traditionalChinesePurity.test.js
 * Verifies that all course transcripts, metadata, titles, headings, and summaries
 * are 100% Pure Traditional Chinese (正體中文 / 繁體中文) with ZERO Simplified Chinese characters.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const SESSIONS_DIR = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/sessions');
const COURSE_JSON = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/course.json');
const TOC_JSON = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/toc.json');

// Strict Simplified-to-Traditional mapping dictionary (where Simplified != Traditional)
const STRICT_SIMP_TO_TRAD = {
  '为': '為', '这': '這', '样': '樣', '个': '個', '说': '說',
  '体': '體', '经': '經', '论': '論', '门': '門', '从': '從',
  '对': '對', '么': '麼', '后': '後', '变': '變', '实': '實',
  '证': '證', '觉': '覺', '关': '關', '开': '開', '边': '邊',
  '过': '過', '问': '問', '题': '題', '时': '時', '间': '間',
  '还': '還', '会': '會', '点': '點', '现': '現', '显': '顯',
  '义': '義', '极': '極', '胜': '勝', '广': '廣', '当': '當',
  '无': '無', '师': '師', '发': '發', '与': '與', '见': '見',
  '随': '隨', '应': '應', '处': '處', '观': '觀', '摄': '攝',
  '识': '識', '别': '別', '业': '業', '释': '釋', '难': '難',
  '车': '車', '声': '聲', '闻': '聞', '缘': '緣', '执': '執',
  '许': '許', '计': '計', '总': '總', '种': '種', '量': '量',
  '听': '聽', '讲': '講', '话': '話', '觉': '覺', '导': '導',
  '读': '讀', '记': '記', '诵': '誦', '传': '傳', '承': '承',
  '菩': '菩', '萨': '薩', '罗': '羅', '蜜': '蜜', '多': '多',
  '佛': '佛', '智': '智', '慧': '慧', '辩': '辯', '难': '難',
  '净': '淨', '胜': '勝', '谛': '諦', '俗': '俗', '义': '義'
};

// Filter out any identical entries (e.g. 佛 == 佛)
const FILTERED_SIMP_MAP = Object.fromEntries(
  Object.entries(STRICT_SIMP_TO_TRAD).filter(([simp, trad]) => simp !== trad)
);

const SIMP_CHARS_SET = new Set(Object.keys(FILTERED_SIMP_MAP));
const SIMP_REGEX = new RegExp(`[${Object.keys(FILTERED_SIMP_MAP).join('')}]`, 'g');

test('🏮 Traditional Chinese Purity Test Suite (繁體正體中文無簡體字檢驗)', async (t) => {
  
  await t.test('1. Structure: course.json and toc.json are 100% Traditional Chinese', () => {
    [COURSE_JSON, TOC_JSON].forEach(filePath => {
      const content = readFileSync(filePath, 'utf8');
      const matches = content.match(SIMP_REGEX);
      if (matches && matches.length > 0) {
        const unique = [...new Set(matches)];
        const suggestions = unique.map(c => `${c} -> ${FILTERED_SIMP_MAP[c] || '?'}`).join(', ');
        assert.fail(`Found ${matches.length} simplified characters in ${path.basename(filePath)}: [${suggestions}]`);
      }
      assert.ok(true, `${path.basename(filePath)} passed pure Traditional Chinese validation`);
    });
  });

  await t.test('2. Transcripts: All converted session JSON files contain 0 simplified characters', () => {
    const sessionFiles = readdirSync(SESSIONS_DIR).filter(f => f.startsWith('session_') && f.endsWith('.json'));
    assert.ok(sessionFiles.length > 0, 'Must have converted session files');

    let totalViolations = 0;
    const violationReport = [];

    sessionFiles.forEach(file => {
      const fullPath = path.join(SESSIONS_DIR, file);
      const data = JSON.parse(readFileSync(fullPath, 'utf8'));
      const publicText = [];
      function collect(value, key = '') {
        if (typeof value === 'string') {
          if (key !== 'rawText') publicText.push(value);
          return;
        }
        if (Array.isArray(value)) return value.forEach(item => collect(item, key));
        if (value && typeof value === 'object') {
          Object.entries(value).forEach(([childKey, childValue]) => collect(childValue, childKey));
        }
      }
      collect(data);
      const matches = publicText.join('\n').match(SIMP_REGEX);

      if (matches && matches.length > 0) {
        totalViolations += matches.length;
        const unique = [...new Set(matches)];
        const suggestions = unique.map(c => `${c} -> ${FILTERED_SIMP_MAP[c] || '?'}`).join(', ');
        violationReport.push(`${file}: ${matches.length} chars [${suggestions}]`);
      }
    });

    if (totalViolations > 0) {
      assert.fail(`Found ${totalViolations} simplified characters across ${violationReport.length} files:\n` + violationReport.slice(0, 10).join('\n'));
    }

    assert.equal(totalViolations, 0, `All ${sessionFiles.length} sessions are 100% pure Traditional Chinese`);
  });
});
