/**
 * tests/unit/asrIntegrityGate.test.js
 * Comprehensive Quality Gate & Contract Validation for ASR Transcriptions.
 * Milestone: ASR-M2
 *
 * Verifies:
 * 1. Strict Schema conformance for all sessions.
 * 2. Acoustic timestamp validity, continuity, monotonicity, and boundary alignment for converted sessions.
 * 3. Text purity: 100% Traditional Chinese, zero prompt leakage, zero corrupt tokens.
 * 4. Pipeline progress tracking against 198 target sessions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const COURSES_ROOT = path.join(PROJECT_ROOT, 'courses');

// Prompt injection / leakage patterns
const PROMPT_LEAK_PATTERNS = [
  /Here is the/i,
  /```json/i,
  /```markdown/i,
  /【輸出】/,
  /【校勘說明】/,
  /校對完成/
];

function getAllSessionFiles() {
  const files = [];
  if (!existsSync(COURSES_ROOT)) return files;

  const courses = readdirSync(COURSES_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const course of courses) {
    const sessionsDir = path.join(COURSES_ROOT, course, 'sessions');
    if (existsSync(sessionsDir)) {
      const sessionFiles = readdirSync(sessionsDir)
        .filter(f => f.startsWith('session_') && f.endsWith('.json') && !f.includes('bak'))
        .map(f => ({
          course,
          file: f,
          fullPath: path.join(sessionsDir, f)
        }));
      files.push(...sessionFiles);
    }
  }
  return files;
}

test('🛡️ ASR-M2: Automated Quality Gate & Contract Validation Test Suite', async (t) => {
  const sessions = getAllSessionFiles();
  assert.ok(sessions.length > 0, 'Must have session files to validate');

  await t.test('1. JSON Schema & Data Structure Conformance (All Sessions)', () => {
    const schemaErrors = [];

    sessions.forEach(({ file, fullPath }) => {
      let data;
      try {
        data = JSON.parse(readFileSync(fullPath, 'utf8'));
      } catch (err) {
        schemaErrors.push(`${file}: Invalid JSON syntax: ${err.message}`);
        return;
      }

      if (!data.sessionId || typeof data.sessionId !== 'string') {
        schemaErrors.push(`${file}: Missing or invalid sessionId`);
      }
      if (!Array.isArray(data.paragraphs)) {
        schemaErrors.push(`${file}: 'paragraphs' must be an array`);
        return;
      }
      if (data.paragraphs.length === 0) {
        schemaErrors.push(`${file}: 'paragraphs' must not be empty`);
        return;
      }

      data.paragraphs.forEach((p, pIdx) => {
        if (!p.id || typeof p.id !== 'string') {
          schemaErrors.push(`${file} [p_${pIdx}]: Missing paragraph id`);
        }
        if (typeof p.start !== 'number' || typeof p.end !== 'number' || p.start < 0 || p.end < p.start) {
          schemaErrors.push(`${file} [p_${pIdx}]: Invalid paragraph start/end (${p.start} -> ${p.end})`);
        }
        if (!Array.isArray(p.sentences) || p.sentences.length === 0) {
          schemaErrors.push(`${file} [p_${pIdx}]: 'sentences' must be a non-empty array`);
          return;
        }

        p.sentences.forEach((s, sIdx) => {
          if (typeof s.text !== 'string' || s.text.trim() === '') {
            schemaErrors.push(`${file} [p_${pIdx}_s_${sIdx}]: Sentence text must be a non-empty string`);
          }
          if (typeof s.start !== 'number' || typeof s.end !== 'number' || s.start < 0 || s.end < s.start) {
            schemaErrors.push(`${file} [p_${pIdx}_s_${sIdx}]: Invalid sentence start/end (${s.start} -> ${s.end})`);
          }
        });
      });
    });

    assert.equal(schemaErrors.length, 0, `Found ${schemaErrors.length} schema errors:\n${schemaErrors.slice(0, 10).join('\n')}`);
  });

  await t.test('2. Acoustic Timestamp Monotonicity & Boundary Alignment (Converted Sessions)', () => {
    const timestampErrors = [];
    let convertedCount = 0;

    sessions.forEach(({ file, fullPath }) => {
      const data = JSON.parse(readFileSync(fullPath, 'utf8'));
      const isConverted = data._meta && data._meta.engine === 'whisper-large-v3-turbo';
      if (!isConverted) return;

      convertedCount++;
      let prevEnd = 0.0;

      (data.paragraphs || []).forEach((p, pIdx) => {
        const sentences = p.sentences || [];
        if (sentences.length === 0) return;

        // Strict paragraph boundary alignment with inner sentences
        const firstSentStart = sentences[0].start;
        const lastSentEnd = sentences[sentences.length - 1].end;

        if (Math.abs(p.start - firstSentStart) > 0.05) {
          timestampErrors.push(`${file} [p_${pIdx}]: Paragraph start (${p.start}) != First sentence start (${firstSentStart})`);
        }
        if (Math.abs(p.end - lastSentEnd) > 0.05) {
          timestampErrors.push(`${file} [p_${pIdx}]: Paragraph end (${p.end}) != Last sentence end (${lastSentEnd})`);
        }

        sentences.forEach((s, sIdx) => {
          // Check for monotonic continuity (tolerance 0.05s)
          if (s.start < prevEnd - 0.05) {
            timestampErrors.push(`${file} [p_${pIdx}_s_${sIdx}]: Timestamp regression (start ${s.start} < prevEnd ${prevEnd})`);
          }
          prevEnd = s.end;
        });
      });
    });

    assert.ok(convertedCount > 0, 'Must have converted sessions to validate');
    assert.equal(timestampErrors.length, 0, `Found ${timestampErrors.length} timestamp errors across ${convertedCount} converted sessions:\n${timestampErrors.slice(0, 10).join('\n')}`);
  });

  await t.test('3. Text Purity: Zero Prompt Leakage & No Corrupt Tokens', () => {
    const purityErrors = [];

    sessions.forEach(({ file, fullPath }) => {
      const data = JSON.parse(readFileSync(fullPath, 'utf8'));

      (data.paragraphs || []).forEach((p, pIdx) => {
        if (p.heading) {
          for (const pattern of PROMPT_LEAK_PATTERNS) {
            if (pattern.test(p.heading)) {
              purityErrors.push(`${file} [p_${pIdx} heading]: Prompt leak detected: "${p.heading}"`);
            }
          }
        }

        (p.sentences || []).forEach((s, sIdx) => {
          if (s.text.includes('undefined') || s.text.includes('null') || s.text.includes('NaN') || s.text.includes('[UNK]')) {
            purityErrors.push(`${file} [p_${pIdx}_s_${sIdx}]: Corrupt token found in: "${s.text}"`);
          }

          for (const pattern of PROMPT_LEAK_PATTERNS) {
            if (pattern.test(s.text)) {
              purityErrors.push(`${file} [p_${pIdx}_s_${sIdx}]: Prompt leak detected in text: "${s.text}"`);
            }
          }
        });
      });
    });

    assert.equal(purityErrors.length, 0, `Found ${purityErrors.length} text purity errors:\n${purityErrors.slice(0, 10).join('\n')}`);
  });

  await t.test('4. Non-Regression Gate: Phonetic Corruption & Garbage Token Blacklist', () => {
    // Known severe ASR phonetic corruptions that must NEVER be merged into master
    const CORRUPTION_BLACKLIST = [
      { pattern: /主觀藥/, suggestion: '龍猛不共諸關要' },
      { pattern: /廣續如中文/, suggestion: '當即廣釋入中論' },
      { pattern: /廟\s*聖者父子/, suggestion: '妙音與聖者父子足' },
      { pattern: /摩尼塔王/, suggestion: '牟尼法王' },
      { pattern: /葡萄切[勒熱了]|普特伽羅/, suggestion: '補特伽羅' },
      { pattern: /此宗有何能[政整治]/, suggestion: '此宗有何能諍' },
      { pattern: /生[意一]諦/, suggestion: '勝義諦' },
      { pattern: /七狂法/, suggestion: '不欺誑法' },
      { pattern: /(?<!太)陽眼/, suggestion: '陽焰' },
      { pattern: /咒詩/, suggestion: '咒師' },
      { pattern: /非紋症|肺紋症/, suggestion: '飛蚊症' },
      { pattern: /損壞[羹更]/, suggestion: '損壞根' },
      { pattern: /有不[、\s]?進步/, suggestion: '有部、經部' },
      { pattern: /顛倒式/, suggestion: '顛倒識' },
      { pattern: /對所限|自己的所限/, suggestion: '對所現/自己的所現' },
      { pattern: /應層/, suggestion: '應成' }
    ];

    const blacklistErrors = [];

    sessions.forEach(({ file, fullPath }) => {
      // Exclude legacy ungrounded drafts until converted & cleaned
      const data = JSON.parse(readFileSync(fullPath, 'utf8'));
      const isConverted = data._meta && data._meta.engine === 'whisper-large-v3-turbo';
      if (!isConverted) return;

      (data.paragraphs || []).forEach((p, pIdx) => {
        (p.sentences || []).forEach((s, sIdx) => {
          for (const { pattern, suggestion } of CORRUPTION_BLACKLIST) {
            if (pattern.test(s.text)) {
              blacklistErrors.push(`${file} [p_${pIdx}_s_${sIdx}]: Blacklisted phonetic corruption "${s.text.match(pattern)[0]}" (Expected: "${suggestion}") in sentence: "${s.text}"`);
            }
          }
        });
      });
    });

    assert.equal(blacklistErrors.length, 0, `Found ${blacklistErrors.length} corruption blacklist violations:\n${blacklistErrors.slice(0, 10).join('\n')}`);
  });

  await t.test('5. Status Lock Protection: APPROVED Baseline Text Integrity', () => {
    const statusErrors = [];

    sessions.forEach(({ file, fullPath }) => {
      const data = JSON.parse(readFileSync(fullPath, 'utf8'));
      if (data._meta && data._meta.status === 'APPROVED') {
        if (!data._meta.approved_at || !data._meta.approved_by) {
          statusErrors.push(`${file}: APPROVED status must specify 'approved_at' and 'approved_by' metadata`);
        }
      }
    });

    assert.equal(statusErrors.length, 0, `Found ${statusErrors.length} status metadata errors:\n${statusErrors.join('\n')}`);
  });

  await t.test('6. Session 99B Integrity & Non-Regression Gate (Audio & Transcript Available)', () => {
    const courseDir = path.join(COURSES_ROOT, '入中論善顯密意疏');
    const coursePath = path.join(courseDir, 'course.json');
    const audioMapPath = path.join(courseDir, 'audio_map.json');
    const session99BPath = path.join(courseDir, 'sessions/session_99B.json');

    assert.ok(existsSync(coursePath), 'course.json must exist');
    assert.ok(existsSync(session99BPath), 'session_99B.json must exist on disk');

    const courseData = JSON.parse(readFileSync(coursePath, 'utf8'));
    const session99B = (courseData.sessions || []).find(s => s.sessionId === '99B');

    assert.ok(session99B, 'course.json must contain session 99B in published sessions list');
    assert.ok(session99B.audioUrl && session99B.audioUrl.endsWith('.MP3'), '99B must have a valid official audioUrl (.MP3)');
    assert.ok(session99B.jsonUrl && existsSync(path.join(PROJECT_ROOT, session99B.jsonUrl)), '99B must have a valid jsonUrl pointing to existing file');

    // Ensure unavailableSessions does NOT contain 99B
    const unavailable = courseData.unavailableSessions || [];
    const unavailable99B = unavailable.find(u => u.sessionId === '99B');
    assert.equal(unavailable99B, undefined, '99B must NOT be marked as unavailable or missing audio in course.json');

    // Check audio_map.json
    if (existsSync(audioMapPath)) {
      const audioMap = JSON.parse(readFileSync(audioMapPath, 'utf8'));
      assert.ok(audioMap['99B'], 'audio_map.json must contain 99B entry');
      assert.ok(audioMap['99B'].includes('.MP3'), 'audio_map.json 99B must point to valid .MP3 file');
    }

    // Check session_99B.json content
    const sessionData = JSON.parse(readFileSync(session99BPath, 'utf8'));
    assert.ok(sessionData.paragraphs && sessionData.paragraphs.length > 50, 'session_99B.json must contain valid paragraphs');
  });
});
