/**
 * tests/unit/acousticTimestampPurity.test.js
 * Verifies that converted sessions have genuine GPU Whisper Large-v3 acoustic timestamps
 * with natural human speech duration variance, rather than legacy synthetic uniform timestamps.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');
const SESSIONS_DIR = path.join(PROJECT_ROOT, 'courses/入中論善顯密意疏/sessions');

test('🎙️ Acoustic Timestamp Purity & Non-Uniformity Test Suite (真實聲學時間戳檢驗)', async (t) => {
  const sessionFiles = readdirSync(SESSIONS_DIR).filter(f => f.startsWith('session_') && f.endsWith('.json') && !f.includes('bak'));

  await t.test('1. Converted sessions must have authentic speech variance (stdev >= 0.35s, uniform ratio <= 0.35)', () => {
    const syntheticDetected = [];

    sessionFiles.forEach(file => {
      const fullPath = path.join(SESSIONS_DIR, file);
      const data = JSON.parse(readFileSync(fullPath, 'utf8'));

      // Check sessions claiming to be converted with whisper-large-v3-turbo
      if (data._meta && data._meta.engine === 'whisper-large-v3-turbo' && data._meta.total_paragraphs) {
        const sentences = data.paragraphs.flatMap(p => p.sentences || []);
        if (sentences.length < 10) return;

        const durations = sentences.map(s => Math.round((s.end - s.start) * 100) / 100);
        const counts = {};
        durations.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
        const maxCount = Math.max(...Object.values(counts));
        const uniformRatio = maxCount / durations.length;

        const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
        const variance = durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / durations.length;
        const stdev = Math.sqrt(variance);

        // Fail if more than 35% of sentences share the exact same duration, or stdev < 0.35
        if (uniformRatio > 0.35 || stdev < 0.35) {
          syntheticDetected.push({
            file,
            uniformRatio: `${(uniformRatio * 100).toFixed(1)}%`,
            stdev: `${stdev.toFixed(3)}s`,
            sampleDur: Object.keys(counts).find(k => counts[k] === maxCount)
          });
        }
      }
    });

    if (syntheticDetected.length > 0) {
      const report = syntheticDetected.map(s => `  - ${s.file}: uniform ratio ${s.uniformRatio} (dur: ${s.sampleDur}s), stdev: ${s.stdev}`).join('\n');
      assert.fail(`Found ${syntheticDetected.length} converted session(s) with synthetic uniform timestamps:\n${report}\nThese must be re-transcribed with GPU Whisper Large-v3.`);
    }

    assert.equal(syntheticDetected.length, 0, 'All converted sessions pass genuine acoustic timestamp validation');
  });

  await t.test('2. Sentence timestamps must be strictly monotonic (no backward time jumps)', () => {
    let regressionCount = 0;
    const errors = [];

    sessionFiles.forEach(file => {
      const fullPath = path.join(SESSIONS_DIR, file);
      const data = JSON.parse(readFileSync(fullPath, 'utf8'));
      let prevEnd = 0.0;

      (data.paragraphs || []).forEach(p => {
        (p.sentences || []).forEach(s => {
          if (s.start < prevEnd - 0.05) {
            regressionCount++;
            errors.push(`${file} [sentence: "${s.text.slice(0, 10)}..."]: start ${s.start} < prevEnd ${prevEnd}`);
          }
          prevEnd = s.end;
        });
      });
    });

    assert.equal(regressionCount, 0, `Found ${regressionCount} timestamp regressions:\n${errors.slice(0, 5).join('\n')}`);
  });
});
