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
import {
  TRADITIONAL_CHINESE_PURITY_PROFILE,
  findTraditionalChinesePurityViolations,
} from '../../scripts/lib/transcriptQualityPolicy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const SESSIONS_DIR = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/sessions');
const COURSE_JSON = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/course.json');
const TOC_JSON = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/toc.json');

test('🏮 Traditional Chinese Purity Test Suite (繁體正體中文無簡體字檢驗)', async (t) => {
  
  await t.test('1. Structure: course.json and toc.json are 100% Traditional Chinese', () => {
    [COURSE_JSON, TOC_JSON].forEach(filePath => {
      const content = readFileSync(filePath, 'utf8');
      const matches = findTraditionalChinesePurityViolations(content);
      if (matches && matches.length > 0) {
        const unique = [...new Set(matches)];
        const suggestions = unique.map(c => `${c} -> ${TRADITIONAL_CHINESE_PURITY_PROFILE.simpToTrad[c] || '?'}`).join(', ');
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
      const matches = findTraditionalChinesePurityViolations(publicText.join('\n'));

      if (matches && matches.length > 0) {
        totalViolations += matches.length;
        const unique = [...new Set(matches)];
        const suggestions = unique.map(c => `${c} -> ${TRADITIONAL_CHINESE_PURITY_PROFILE.simpToTrad[c] || '?'}`).join(', ');
        violationReport.push(`${file}: ${matches.length} chars [${suggestions}]`);
      }
    });

    if (totalViolations > 0) {
      assert.fail(`Found ${totalViolations} simplified characters across ${violationReport.length} files:\n` + violationReport.slice(0, 10).join('\n'));
    }

    assert.equal(totalViolations, 0, `All ${sessionFiles.length} sessions are 100% pure Traditional Chinese`);
  });
});
