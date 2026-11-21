#!/usr/bin/env node
/**
 * Stage 3 (補標點) — 句末標點補齊 for the 金剛經 1999 course.
 *
 * scripts/lib/fluentPolishAudit.js#ensureParagraphPunctuation only targets
 * paragraphs that contain a >=26 character unpunctuated run, so short ASR
 * fragments keep their trailing "，". The v1.6 "Minimum Reading Quality Gate"
 * requires <5% of sentences without sentence-final punctuation, so every
 * sentence must end with 。？！…」』）.
 *
 * This pass asks the local GX10 OpenAI-compatible endpoint to add
 * sentence-final punctuation ONLY. A deterministic guard rejects any proposal
 * whose CJK content differs from the source (no rewriting, no merging, no
 * deletion), so the transcript wording is never altered by this stage.
 *
 * Usage: node scripts/run_punctuate_final_jjj.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE_DIR = path.join(REPO, 'courses/金剛般若波羅蜜經');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const ENDPOINT = process.env.JJJ_LLM_ENDPOINT || 'http://100.113.144.100:18765/v1';
const MODEL = process.env.JJJ_LLM_MODEL || 'qwen3.8-flash-next-iq3_s';

const TERMINAL = /[。！？…」』）]$/;
const cjkOnly = (t) => String(t || '').replace(/[^\p{Script=Han}]/gu, '');
const strip = (t) => String(t || '').replace(/[\s，。！？、；：""''（）《》〈〉「」『』…─·,.!?;:'"()\[\]~-]/g, '');

const PROMPT = [
  '你是臺灣繁體中文出版編輯。下列每一句都是課堂口語的字幕切分，句末可能殘留「，」或沒有句末標點。',
  '你的唯一任務：為每句補上正確的句末標點。',
  '規則：',
  '1. 絕對不得增、刪、改任何字詞，只能調整標點；且**不得在句中新增標點**，只能把句末的「，」改成「。」或「？」。',
  '2. 語意完整的敘述句用「。」；疑問或反問用「？」；語氣強烈用「！」。',
  '3. 若該句在原文中是明顯未完的半句（例如下一句會接續），仍以「。」收束全句即可。',
  '4. 只輸出 JSON 物件：{"id":"修訂後文字"}，每個輸入 id 都要出現，順序一致。',
].join('\n');

async function callModel(messages, timeoutMs = 120000) {
  const url = ENDPOINT.endsWith('/chat/completions') ? ENDPOINT : `${ENDPOINT.replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 4096,
      chat_template_kwargs: { enable_thinking: false },
      messages,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : content;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in response');
  return JSON.parse(candidate.slice(start, end + 1));
}

async function main() {
  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => /^session_\d+\.json$/.test(f)).sort();
  for (const file of files) {
    const abs = path.join(SESSIONS_DIR, file);
    const session = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const paragraphs = session.paragraphs || [];

    // Collect sentences that still lack sentence-final punctuation.
    const targets = [];
    for (const p of paragraphs) {
      for (const s of p.sentences || []) {
        if (!TERMINAL.test(String(s.text || '').trim())) targets.push(s);
      }
    }

    let applied = 0;
    let rejected = 0;
    const BATCH = Number(process.env.JJJ_PUNCT_BATCH || 12);
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH);
      const payload = batch.map((s) => ({ id: s.id, text: s.text }));
      let proposals = {};
      try {
        proposals = await callModel([
          { role: 'system', content: PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ]);
      } catch (error) {
        console.error(`  batch ${i} failed: ${error.message}`);
      }
      for (const s of batch) {
        let candidate = proposals?.[s.id];
        if (typeof candidate !== 'string') {
          // fallback: retry this single sentence on its own
          try {
            const single = await callModel([
              { role: 'system', content: PROMPT },
              { role: 'user', content: JSON.stringify([{ id: s.id, text: s.text }]) },
            ]);
            candidate = single?.[s.id];
          } catch { candidate = undefined; }
        }
        if (typeof candidate !== 'string') { rejected += 1; continue; }
        const trimmed = candidate.trim();
        if (!TERMINAL.test(trimmed)) { rejected += 1; continue; }
        // guard: the character sequence must be identical (punctuation-only change)
        if (strip(trimmed) !== strip(s.text)) { rejected += 1; continue; }
        s.text = trimmed;
        applied += 1;
      }
    }

    const sentences = paragraphs.flatMap((p) => p.sentences || []);
    const noPunct = sentences.filter((s) => !TERMINAL.test(String(s.text || '').trim())).length;
    session._meta = {
      ...(session._meta || {}),
      finalPunctuationPass: 'scripts/run_punctuate_final_jjj.mjs (punctuation-only, CJK-content guard)',
      finalPunctuationEndpoint: ENDPOINT,
      finalPunctuationApplied: applied,
      finalPunctuationRejected: rejected,
    };
    fs.writeFileSync(abs, JSON.stringify(session, null, 1));
    console.log(
      `${file}: targets=${targets.length} applied=${applied} rejected=${rejected} ` +
      `noPunctNow=${((100 * noPunct) / Math.max(sentences.length, 1)).toFixed(2)}%`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
