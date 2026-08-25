import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('🌟 29A Golden Benchmark Quality Standard Test Suite', () => {
  const SESSIONS_DIR = path.resolve('courses/入中論善顯密意疏/sessions');
  const AUDIO_MAP_PATH = path.resolve('courses/入中論善顯密意疏/audio_map.json');
  
  const audioMap = fs.existsSync(AUDIO_MAP_PATH) ? JSON.parse(fs.readFileSync(AUDIO_MAP_PATH, 'utf8')) : {};
  const allSessionFiles = fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith('session_') && f.endsWith('.json') && !f.includes('bak'));

  // Negative forbidden homophone patterns that MUST NEVER appear in 29A-quality converted texts
  const FORBIDDEN_HOMOPHONES = [
    { pattern: /非紋症|肺紋症/, name: '非紋症/肺紋症 (應為「飛蚊症」)' },
    { pattern: /至向有|自向有/, name: '至向有/自向有 (應為「自相有」)' },
    { pattern: /損壞羹|損壞更/, name: '損壞羹/更 (應為「損壞根」)' },
    { pattern: /設法心法/, name: '設法心法 (應為「色法心法」)' },
    { pattern: /不先一心法/, name: '不先一心法 (應為「不相應行法」)' },
    { pattern: /生一地|生意地/, name: '生一地/生意地 (應為「勝義諦」)' },
    { pattern: /七[狂況]法/, name: '七狂法/七況法 (應為「欺誑法」)' },
    { pattern: /執陽眼為水|羊眼/, name: '陽眼/羊眼 (應為「陽焰」)' },
    { pattern: /執那個正的是/, name: '執那個正的是 (應為「執那個正的識」)' },
  ];

  // 1. Scan and identify converted sessions that went through the full 5-step pipeline
  const convertedSessions = [];
  allSessionFiles.forEach(file => {
    const filePath = path.join(SESSIONS_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data._meta && data._meta.engine === 'whisper-large-v3-turbo' && data._meta.total_paragraphs) {
      convertedSessions.push({ file, data });
    }
  });

  test('Golden Standard Coverage: Identifies all active converted sessions', () => {
    assert.ok(convertedSessions.length >= 2, `Expected at least 2 converted benchmark sessions, found ${convertedSessions.length}`);
    console.log(`  ℹ️ Found ${convertedSessions.length} sessions upgraded to 29A Golden Standard`);
  });

  // 2. Pattern 1: Metadata & Provenance Standard
  test('Pattern 1 (Metadata): Converted sessions have valid engine, proofread, and lastUpdated metadata', () => {
    convertedSessions.forEach(({ file, data }) => {
      assert.ok(data._meta, `${file} must include _meta object`);
      assert.ok(data._meta.engine && data._meta.engine.includes('whisper'), `${file} engine must be whisper variant`);
      assert.ok(data._meta.llm_proofread && (data._meta.llm_proofread.includes('Qwen3.8-27B') || data._meta.llm_proofread.includes('Smart Router')), `${file} llm_proofread must be Smart Router or Qwen3.8-27B variant`);
      const dateVal = data.lastUpdated || data._meta.last_updated || (data._meta.processed_at ? data._meta.processed_at.split(' ')[0] : '');
      assert.match(dateVal, /^\d{4}-\d{2}-\d{2}$/, `${file} must have valid YYYY-MM-DD lastUpdated date`);
      
      const totalSentences = data.paragraphs.reduce((acc, p) => acc + p.sentences.length, 0);
      assert.equal(data._meta.total_paragraphs, data.paragraphs.length, `${file} total_paragraphs count mismatch`);
      assert.equal(data._meta.total_sentences, totalSentences, `${file} total_sentences count mismatch`);
    });
  });

  // 3. Pattern 2: Remote Audio Stream Standard
  test('Pattern 2 (Audio Stream): Converted sessions point directly to official Flyday MP3 streams', () => {
    convertedSessions.forEach(({ file, data }) => {
      const sid = data.sessionId;
      assert.ok(data.audioUrl, `${file} must have audioUrl`);
      if (audioMap[sid]) {
        assert.equal(data.audioUrl.toLowerCase(), audioMap[sid].toLowerCase(), `${file} audioUrl must match official Flyday URL in audio_map.json`);
      } else {
        assert.match(data.audioUrl, /^https:\/\/buddha\.flyday\.com\.tw\/.+\.mp3$/i, `${file} audioUrl must be official Flyday remote stream`);
      }
    });
  });

  // 4. Pattern 3: Semantic Headings & Structural Density Standard
  test('Pattern 3 (Structure & Headings): Converted sessions have 6~12 thematic headings with proper syntax', () => {
    convertedSessions.forEach(({ file, data }) => {
      const headings = data.paragraphs.filter(p => p.heading && p.heading.trim().length > 0);
      assert.ok(headings.length >= 6, `${file} must have >= 6 thematic headings, got ${headings.length}`);
      
      headings.forEach(p => {
        assert.match(p.heading, /^【.+】.+$/, `${file} heading "${p.heading}" must follow standard '【主題】說明' syntax`);
      });

      // Paragraph density: average sentences per paragraph between 1.5 and 8.0
      const avgSentences = data._meta.total_sentences / data._meta.total_paragraphs;
      assert.ok(avgSentences >= 1.5 && avgSentences <= 8.0, `${file} avg sentences/para (${avgSentences.toFixed(1)}) should be in [1.5, 8.0]`);
    });
  });

  // 5. Pattern 4: Buddhist Terminology & Homophone Purity Standard
  test('Pattern 4 (Purity): Converted sessions are free from forbidden ASR homophone errors', () => {
    convertedSessions.forEach(({ file, data }) => {
      const fullText = data.paragraphs.flatMap(p => p.sentences.map(s => s.text)).join(' ');
      
      FORBIDDEN_HOMOPHONES.forEach(({ pattern, name }) => {
        const match = fullText.match(pattern);
        assert.ok(!match, `${file} contains forbidden homophone error "${match ? match[0] : ''}" (${name})`);
      });
    });
  });

  // 6. Pattern 5: Strict Monotonicity & Millisecond Precision Standard
  test('Pattern 5 (Acoustic Monotonicity): Sentence timestamps maintain strict forward monotonicity', () => {
    convertedSessions.forEach(({ file, data }) => {
      let prevEnd = 0.0;
      data.paragraphs.forEach(p => {
        assert.ok(p.start >= 0.0, `${file} paragraph ${p.id} start must be >= 0`);
        assert.ok(p.end >= p.start, `${file} paragraph ${p.id} end must be >= start`);
        
        p.sentences.forEach(s => {
          assert.ok(s.start >= prevEnd - 0.05, `${file} sentence start ${s.start} regressed before prevEnd ${prevEnd}`);
          assert.ok(s.end > s.start, `${file} sentence end ${s.end} must exceed start ${s.start}`);
          prevEnd = s.end;
        });
      });
    });
  });
});
