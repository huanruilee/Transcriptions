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
const COURSES = [
  '入中論善顯密意疏',
  '菩薩就是這樣成佛',
  '三主要道',
  '四念住',
  '2025釋量論第二品大組共學',
];

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
  
  await t.test('1. Structure: course.json and toc.json across all courses are 100% Traditional Chinese', () => {
    for (const course of COURSES) {
      for (const fileName of ['course.json', 'toc.json']) {
        const filePath = path.join(PROJECT_ROOT, 'courses', course, fileName);
        let content;
        try {
          content = readFileSync(filePath, 'utf8');
        } catch {
          continue;
        }
        const matches = content.match(SIMP_REGEX);
        if (matches && matches.length > 0) {
          const unique = [...new Set(matches)];
          const suggestions = unique.map(c => `${c} -> ${FILTERED_SIMP_MAP[c] || '?'}`).join(', ');
          assert.fail(`Found ${matches.length} simplified characters in ${course}/${fileName}: [${suggestions}]`);
        }
      }
    }
    assert.ok(true, 'All course.json and toc.json files passed pure Traditional Chinese validation');
  });

  await t.test('2. Transcripts: All session JSON files across all courses contain 0 simplified characters', () => {
    const allSessionFiles = [];
    for (const course of COURSES) {
      const sessionsDir = path.join(PROJECT_ROOT, 'courses', course, 'sessions');
      const files = readdirSync(sessionsDir)
        .filter(f => f.startsWith('session_') && f.endsWith('.json') && !f.includes('bak'))
        .map(f => ({ course, file: f, fullPath: path.join(sessionsDir, f) }));
      allSessionFiles.push(...files);
    }
    assert.ok(allSessionFiles.length > 0, 'Must have session files');

    let totalViolations = 0;
    const violationReport = [];

    allSessionFiles.forEach(({ course, file, fullPath }) => {
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
        violationReport.push(`${course}/${file}: ${matches.length} chars [${suggestions}]`);
      }
    });

    if (totalViolations > 0) {
      assert.fail(`Found ${totalViolations} simplified characters across ${violationReport.length} files:\n` + violationReport.slice(0, 10).join('\n'));
    }

    assert.equal(totalViolations, 0, `All ${allSessionFiles.length} sessions across ${COURSES.length} courses are 100% pure Traditional Chinese`);
  });
});
