#!/usr/bin/env node
/**
 * Stage 3 / Stage 4 runner for the 金剛經 1999 course (no base text).
 *
 * Uses the repository's own workflow modules so the result matches the
 * canonical pipeline:
 *   scripts/lib/fluentPolishAudit.js
 *     - consolidateFillersAndFragments   (Stage 3: 口語冗詞 / 碎句合併)
 *     - cleanSessionTypography            (確定性用字修正)
 *     - ensureParagraphPunctuation        (Stage 3: 出版級臺灣正體標點)
 *   scripts/lib/paragraphLayoutPlanner.js
 *     - mergeParagraphsByLayout           (Stage 4: 150~350 字自然段)
 *     - assignSectionHeadingsWithLlm      (Stage 4: 編號義理小標)
 *
 * The local GX10 OpenAI-compatible endpoint is used for punctuation/headings so
 * no external provider quota is consumed.
 *
 * Usage: node scripts/run_stage34_jjj.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  consolidateFillersAndFragments,
  cleanSessionTypography,
  ensureParagraphPunctuation,
} from './lib/fluentPolishAudit.js';
import {
  mergeParagraphsByLayout,
  assignSectionHeadingsWithLlm,
} from './lib/paragraphLayoutPlanner.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE_DIR = path.join(REPO, 'courses/金剛般若波羅蜜經');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const ENDPOINT = process.env.JJJ_LLM_ENDPOINT || 'http://100.113.144.100:18765/v1';
const MODEL = process.env.JJJ_LLM_MODEL || 'qwen3.8-flash-next-iq3_s';

const cjkLen = (t) => String(t || '').replace(/[^\p{Script=Han}]/gu, '').length;
const endsTerminal = (t) => /[。！？…」』）]$/.test(String(t || '').trim());

async function main() {
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => /^session_\d+\.json$/.test(f)).sort();
  for (const file of files) {
    const abs = path.join(SESSIONS_DIR, file);
    let session = JSON.parse(fs.readFileSync(abs, 'utf8'));

    // --- Stage 3: 口語冗詞清除 + 碎句合併 ---
    const consolidated = consolidateFillersAndFragments(session, { maxMergedChars: 38 });
    session = cleanSessionTypography(consolidated.session);

    // --- Stage 4: 段落重組（先於標點，讓標點模型看到完整語塊）---
    session = mergeParagraphsByLayout(session, { minChars: 160, maxChars: 340 });

    // --- Stage 3: 出版級標點（僅處理有 >=26 字無標點長串的段落）---
    let fixed = 0;
    try {
      const punctResult = await ensureParagraphPunctuation({
        session,
        endpoint: ENDPOINT,
        model: MODEL,
        apiKey: process.env.JJJ_LLM_KEY || '',
        timeoutMs: 300000,
      });
      session = punctResult.session;
      fixed = punctResult.fixedCount ?? 0;
    } catch (error) {
      console.error(`  punctuation failed: ${error.message}`);
    }

    // --- Stage 4: 編號義理小標 ---
    try {
      session = await assignSectionHeadingsWithLlm({
        session,
        endpoint: ENDPOINT,
        model: MODEL,
        apiKey: process.env.JJJ_LLM_KEY || '',
        timeoutMs: 180000,
      });
    } catch (error) {
      console.error(`  headings failed: ${error.message}`);
    }

    // --- 段落 id / heading 編號正規化 ---
    // The LLM assigns a heading to every paragraph; consecutive paragraphs with
    // the same heading belong to one section, so the number only advances when
    // the heading text actually changes.
    let headingSeq = 0;
    let currentHeading = null;
    session.paragraphs.forEach((p, index) => {
      p.id = `para-${String(index + 1).padStart(3, '0')}`;
      const raw = String(p.heading || '').trim();
      const bare = raw.replace(/^\d+\.\s*/, '');
      if (bare && bare !== currentHeading) {
        headingSeq += 1;
        currentHeading = bare;
      }
      p.heading = currentHeading ? `${headingSeq}. ${currentHeading}` : null;
    });

    // --- 指標 ---
    const sentences = session.paragraphs.flatMap((p) => p.sentences || []);
    const noPunct = sentences.filter((s) => !endsTerminal(s.text)).length;
    const tiny = sentences.filter((s) => cjkLen(s.text) <= 3).length;
    const paraChars = session.paragraphs.map((p) => cjkLen((p.sentences || []).map((s) => s.text).join('')));
    const overMax = paraChars.filter((n) => n > 350).length;
    const underMin = paraChars.filter((n) => n < 100).length;
    const residual = sentences.filter((s) => /^(呃|嗯|啊|喔|欸)+[。，,.\s]*$/.test(s.text.trim())).length;

    session._meta = {
      ...(session._meta || {}),
      stage34Runner: 'scripts/run_stage34_jjj.mjs (fluentPolishAudit + paragraphLayoutPlanner)',
      stage34Endpoint: ENDPOINT,
      stage34Model: MODEL,
      punctuationSentencesFixed: fixed,
      paragraphs: session.paragraphs.length,
      sentences: sentences.length,
    };

    fs.writeFileSync(abs, JSON.stringify(session, null, 1));
    console.log(
      `${file}: ${sentences.length} sents, ${session.paragraphs.length} paras, ` +
      `noPunct=${((100 * noPunct) / Math.max(sentences.length, 1)).toFixed(1)}% ` +
      `tiny=${((100 * tiny) / Math.max(sentences.length, 1)).toFixed(2)}% ` +
      `residual=${residual} overMax=${overMax} underMin=${underMin} punctFixed=${fixed} headings=${headingSeq}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
