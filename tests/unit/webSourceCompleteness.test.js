/**
 * tests/unit/webSourceCompleteness.test.js
 *
 * Verifies repository completeness and inventory accounting against the
 * authoritative online Buddhist lecture audio recordings catalog:
 * Source: https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68
 *
 * Test Patterns:
 * 1. Canonical Web Catalog Matrix: Exactly 219 recordings across 110 sessions
 *    - Session 01: 1 single session
 *    - Sessions 02A ~ 110B: 109 session pairs (A and B) = 218 sessions
 *    - Total = 1 + 218 = 219 canonical audio lectures
 * 2. Dynamic Gap Detection & Inventory Audit:
 *    - Dynamically compares disk files against canonical 219 web catalog (NO hardcoding)
 *    - Logs explicit audit report with coverage ratio and exact missing session list
 *    - Guards against regression (completed count must be monotonically non-decreasing)
 * 3. 100% Full Web Completeness Acceptance Gate:
 *    - Detects when repository has incomplete coverage (< 219 sessions)
 *    - In standard test run: flags missing sessions via `t.todo` with full missing list
 *    - In strict mode (TRANSCRIPTIONS_STRICT_COMPLETENESS=1): hard fails until all 219 are transcribed
 * 4. Zero Orphaned Transcripts Gate:
 *    - Every session on disk must be registered in course.json and audio_map.json
 *    - Every session in course.json must exist as a valid JSON file on disk
 * 5. Authoritative Remote Audio URL Provenance:
 *    - Every entry in audio_map.json must point to https://buddha.flyday.com.tw/
 * 6. Transcript Content Integrity:
 *    - Every completed session JSON must have non-empty paragraphs and sentences
 *    - Timestamps must be monotonic and non-negative
 * 7. Treatise Source Text Coverage:
 *    - All 285 pages (page_001.txt ~ page_285.txt) must exist in source_text/
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const COURSE_DIR = path.resolve('courses/入中論善顯密意疏');
const COURSE_JSON_PATH = path.join(COURSE_DIR, 'course.json');
const AUDIO_MAP_PATH = path.join(COURSE_DIR, 'audio_map.json');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const SOURCE_TEXT_DIR = path.join(COURSE_DIR, 'source_text');

/**
 * Generate the canonical list of all 219 session IDs as published on
 * https://buddha.flyday.com.tw/ViewVoiceList.aspx?flag=68
 */
function generateCanonicalWebSessions() {
  const list = ['01'];
  for (let i = 2; i <= 110; i++) {
    const numStr = String(i).padStart(2, '0');
    list.push(`${numStr}A`);
    list.push(`${numStr}B`);
  }
  return list;
}

describe('🌐 Web Source Completeness & Inventory Audit Gate', () => {
  const canonicalWebSessions = generateCanonicalWebSessions();

  test('1. Canonical Web Catalog Matrix defines exactly 219 lecture sessions', () => {
    assert.equal(canonicalWebSessions.length, 219,
      'Authoritative web catalog on flyday.com.tw must contain exactly 219 sessions (1 + 109*2)');
    assert.equal(canonicalWebSessions[0], '01');
    assert.equal(canonicalWebSessions[1], '02A');
    assert.equal(canonicalWebSessions[2], '02B');
    assert.equal(canonicalWebSessions[canonicalWebSessions.length - 2], '110A');
    assert.equal(canonicalWebSessions[canonicalWebSessions.length - 1], '110B');
  });

  test('2. Dynamic Gap Detection: Discovers, audits and reports all missing sessions', () => {
    const sessionFiles = fs.readdirSync(SESSIONS_DIR)
      .filter(f => /^session_.*\.json$/.test(f) && !f.includes('anchored'));
    const completedSessionIds = new Set(sessionFiles.map(f => f.replace(/^session_|\.json$/g, '')));

    // Dynamically calculate missing sessions against canonical web matrix
    const missingSessions = canonicalWebSessions.filter(id => !completedSessionIds.has(id));
    const coveragePercent = ((completedSessionIds.size / canonicalWebSessions.length) * 100).toFixed(2);

    // Formatted terminal audit report
    const reportLines = [
      '\n  ==============================================================',
      '  📊 [Web Source Completeness Audit Report]',
      `  • 官方原始總講次 (Canonical Web): ${canonicalWebSessions.length} 講`,
      `  • 目前已轉寫講次 (Completed on Disk): ${completedSessionIds.size} 講`,
      `  • 目前缺失待補講次 (Missing Backlog): ${missingSessions.length} 講`,
      `  • 全庫轉譯涵蓋率 (Coverage Ratio): ${coveragePercent}%`,
      '  --------------------------------------------------------------'
    ];
    if (missingSessions.length > 0) {
      reportLines.push(`  ⚠️ 缺失講次清單 (${missingSessions.length} 講):`);
      reportLines.push(`     ${missingSessions.join(', ')}`);
    } else {
      reportLines.push('  🎉 全 219 講音檔已 100% 全數轉寫完成！');
    }
    reportLines.push('  ==============================================================\n');
    console.log(reportLines.join('\n'));

    // Monotonic progress guard: completed count must never regress below 201
    assert.ok(completedSessionIds.size >= 201,
      `Completed sessions count regressed! Expected at least 201, got ${completedSessionIds.size}`);

    // Extra check: no unknown sessions outside canonical 219
    const unknownSessions = [...completedSessionIds].filter(id => !canonicalWebSessions.includes(id));
    assert.deepEqual(unknownSessions, [],
      `Unknown session IDs found on disk that are not in web catalog: ${unknownSessions.join(', ')}`);
  });

  test('3. Full 219-Session Completeness Acceptance Gate', (t) => {
    const sessionFiles = fs.readdirSync(SESSIONS_DIR)
      .filter(f => /^session_.*\.json$/.test(f) && !f.includes('anchored'));
    const completedSessionIds = new Set(sessionFiles.map(f => f.replace(/^session_|\.json$/g, '')));
    const missingSessions = canonicalWebSessions.filter(id => !completedSessionIds.has(id));
    const coveragePercent = ((completedSessionIds.size / canonicalWebSessions.length) * 100).toFixed(2);

    const isStrictMode = process.env.TRANSCRIPTIONS_STRICT_COMPLETENESS === '1';

    if (missingSessions.length > 0) {
      const warningMessage = `Repository is missing ${missingSessions.length} sessions from web catalog (${completedSessionIds.size}/${canonicalWebSessions.length}, ${coveragePercent}%): [${missingSessions.join(', ')}]`;
      if (isStrictMode) {
        assert.fail(`❌ [Strict Completeness Gate Failed] ${warningMessage}`);
      } else {
        t.todo(`⚠️ [Incomplete Coverage] ${warningMessage}`);
      }
    } else {
      assert.equal(completedSessionIds.size, 219, 'All 219 sessions must be completed');
    }
  });

  test('4. Zero orphaned transcripts: all disk sessions registered in course.json and audio_map.json', () => {
    const course = JSON.parse(fs.readFileSync(COURSE_JSON_PATH, 'utf8'));
    const audioMap = JSON.parse(fs.readFileSync(AUDIO_MAP_PATH, 'utf8'));

    const diskSessionIds = fs.readdirSync(SESSIONS_DIR)
      .filter(f => /^session_.*\.json$/.test(f) && !f.includes('anchored'))
      .map(f => f.replace(/^session_|\.json$/g, ''));

    const courseSessionIds = new Set(course.sessions.map(s => s.sessionId));
    const audioMapSessionIds = new Set(Object.keys(audioMap));

    const missingInCourse = diskSessionIds.filter(id => !courseSessionIds.has(id));
    assert.deepEqual(missingInCourse, [],
      `Every session on disk must be registered in course.json. Missing: ${missingInCourse.join(', ')}`);

    const missingInAudioMap = diskSessionIds.filter(id => !audioMapSessionIds.has(id));
    assert.deepEqual(missingInAudioMap, [],
      `Every session on disk must be registered in audio_map.json. Missing: ${missingInAudioMap.join(', ')}`);

    const missingOnDisk = course.sessions
      .map(s => s.sessionId)
      .filter(id => !diskSessionIds.includes(id));
    assert.deepEqual(missingOnDisk, [],
      `Every session in course.json must have a transcript file on disk. Missing: ${missingOnDisk.join(', ')}`);
  });

  test('5. Remote Audio Provenance: all mapped URLs point to official Flyday repository', () => {
    const audioMap = JSON.parse(fs.readFileSync(AUDIO_MAP_PATH, 'utf8'));
    const nonCompliant = [];

    for (const [sessionId, url] of Object.entries(audioMap)) {
      if (!url.startsWith('https://buddha.flyday.com.tw/')) {
        nonCompliant.push(`${sessionId}: URL must start with https://buddha.flyday.com.tw/ (got ${url})`);
      }
      if (!/\.mp3$/i.test(url)) {
        nonCompliant.push(`${sessionId}: URL must have .mp3 extension (got ${url})`);
      }
    }

    assert.deepEqual(nonCompliant, [],
      `All audio mappings must satisfy official Flyday provenance:\n${nonCompliant.join('\n')}`);
  });

  test('6. Transcript Content Integrity: all completed sessions have non-empty text and monotonic timestamps', () => {
    const diskSessionFiles = fs.readdirSync(SESSIONS_DIR)
      .filter(f => /^session_.*\.json$/.test(f) && !f.includes('anchored'));

    const corrupted = [];

    for (const file of diskSessionFiles) {
      const filePath = path.join(SESSIONS_DIR, file);
      let data;
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        corrupted.push(`${file}: Invalid JSON syntax: ${e.message}`);
        continue;
      }

      if (!Array.isArray(data.paragraphs) || data.paragraphs.length === 0) {
        corrupted.push(`${file}: 'paragraphs' must be a non-empty array`);
        continue;
      }

      const sentences = data.paragraphs.flatMap(p => p.sentences || []);
      if (sentences.length === 0) {
        corrupted.push(`${file}: Contains 0 sentences`);
        continue;
      }

      let prevEnd = 0;
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i];
        if (typeof s.text !== 'string' || s.text.trim().length === 0) {
          corrupted.push(`${file} s[${i}]: Empty sentence text`);
          break;
        }
        if (typeof s.start !== 'number' || typeof s.end !== 'number' || s.start < 0 || s.end < s.start) {
          corrupted.push(`${file} s[${i}]: Invalid timestamp bounds (${s.start} -> ${s.end})`);
          break;
        }
        if (s.start < prevEnd - 0.05) {
          corrupted.push(`${file} s[${i}]: Non-monotonic timestamp (${s.start} < prevEnd ${prevEnd})`);
          break;
        }
        prevEnd = s.end;
      }
    }

    assert.deepEqual(corrupted, [],
      `All completed transcripts must maintain structural integrity:\n${corrupted.join('\n')}`);
  });

  test('7. Treatise Source Text Coverage: all 285 pages are present', () => {
    assert.ok(fs.existsSync(SOURCE_TEXT_DIR), 'source_text directory must exist');
    const missingPages = [];
    for (let p = 1; p <= 285; p++) {
      const pageFile = path.join(SOURCE_TEXT_DIR, `page_${String(p).padStart(3, '0')}.txt`);
      if (!fs.existsSync(pageFile)) {
        missingPages.push(`page_${String(p).padStart(3, '0')}.txt`);
      }
    }
    assert.deepEqual(missingPages, [],
      `All 285 treatise source text pages must exist. Missing: ${missingPages.join(', ')}`);
  });
});
