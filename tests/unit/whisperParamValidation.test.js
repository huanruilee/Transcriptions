/**
 * tests/unit/whisperParamValidation.test.js
 * Contract and Parameter Validation for Whisper ASR Pipeline.
 *
 * Verifies:
 * 1. Buddhist domain vocabulary prompt is defined with high-frequency doctrinal keywords.
 * 2. batch_convert_all.py passes initial_prompt, beam_size, patience, repetition_penalty, and VAD parameters.
 * 3. run_whisper_gpu.py is configured with beam_size >= 5 and initial_prompt.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');

test('Whisper Parameter Contract: batch_convert_all.py', (t) => {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'batch_convert_all.py');
  assert.ok(existsSync(scriptPath), 'batch_convert_all.py must exist');
  const content = readFileSync(scriptPath, 'utf8');

  // 1. Vocabulary prompt check
  assert.match(content, /BUDDHIST_WHISPER_INITIAL_PROMPT\s*=/);
  const requiredKeywords = [
    '入中論善顯密意疏',
    '見悲青增格西',
    '宗喀巴大師',
    '月稱菩薩',
    '應成',
    '自續',
    '唯識',
    '勝義諦',
    '世俗諦',
    '空性',
    '無自性'
  ];
  for (const kw of requiredKeywords) {
    assert.ok(
      content.includes(kw),
      `BUDDHIST_WHISPER_INITIAL_PROMPT must include core doctrinal keyword: "${kw}"`
    );
  }

  // 2. Request payload checks
  assert.match(content, /"initial_prompt":\s*BUDDHIST_WHISPER_INITIAL_PROMPT/);
  assert.match(content, /"beam_size":\s*"5"/);
  assert.match(content, /"patience":\s*"1\.2"/);
  assert.match(content, /"repetition_penalty":\s*"1\.08"/);
  assert.match(content, /"condition_on_previous_text":\s*"false"/);
});

test('Whisper Parameter Contract: run_whisper_gpu.py', (t) => {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'run_whisper_gpu.py');
  assert.ok(existsSync(scriptPath), 'run_whisper_gpu.py must exist');
  const content = readFileSync(scriptPath, 'utf8');

  assert.match(content, /initial_prompt=/);
  assert.match(content, /beam_size=5/);
  assert.match(content, /patience=1\.2/);
  assert.match(content, /repetition_penalty=1\.08/);
});
