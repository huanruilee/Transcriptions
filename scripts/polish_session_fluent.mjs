#!/usr/bin/env node
/**
 * scripts/polish_session_fluent.mjs
 *
 * 依據《釋量論·成量品 32-1.pdf》範本標準，執行：
 * 1. 補齊漏字＋標點修正＋精簡口語冗詞（含防跨句搬字、防誤刪實義詞安全閘門）
 * 2. 可選 --re-layout：將段落合併為 150～350 字自然段，並加上「1. 小標」「2. 小標」
 * 3. 可選 --markdown=<path>：輸出書面閱讀版 Markdown 預覽
 * 4. 僅在明確傳入 --apply 時才寫回 --source JSON
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyPolishProposals,
  generateFluentPolishProposals,
} from './lib/fluentPolishAudit.js';
import {
  assignSectionHeadingsWithLlm,
  mergeParagraphsByLayout,
  renderReadableMarkdown,
} from './lib/paragraphLayoutPlanner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const eq = arg.indexOf('=');
    if (eq === -1) return [arg, 'true'];
    return [arg.slice(0, eq), arg.slice(eq + 1)];
  }),
);

const sourceArg = args.get('--source');
if (!sourceArg) {
  console.error('用法: node scripts/polish_session_fluent.mjs --source=<session.json> [--audit=<audit.json>] [--re-layout] [--markdown=<out.md>] [--output=<diff.json>] [--apply]');
  process.exit(1);
}

const sourcePath = path.resolve(ROOT, sourceArg);
const auditArg = args.get('--audit');
const auditReport = auditArg ? JSON.parse(readFileSync(path.resolve(ROOT, auditArg), 'utf8')) : null;
const endpoint = args.get('--llm-endpoint') || process.env.LLM_ENDPOINT || 'http://100.113.144.100:18765/v1';
const model = args.get('--llm-model') || process.env.LLM_MODEL || 'nvidia/Qwen3.8-27B-NVFP4';
const apiKey = args.get('--llm-api-key') || process.env.LLM_API_KEY || '';
const outputArg = args.get('--output');
const outputPath = outputArg ? path.resolve(ROOT, outputArg) : null;
const markdownArg = args.get('--markdown');
const markdownPath = markdownArg ? path.resolve(ROOT, markdownArg) : null;
const reLayout = args.get('--re-layout') === 'true';
const shouldApply = args.get('--apply') === 'true';

const session = JSON.parse(readFileSync(sourcePath, 'utf8'));
console.log(`正在產生「流暢講記版」修訂提案 (${model} @ ${endpoint})...`);

const { proposals, blockedByGuard } = await generateFluentPolishProposals({
  session,
  auditReport,
  endpoint,
  model,
  apiKey,
});

const categoryCounts = {};
for (const p of proposals) {
  for (const cat of p.categories) {
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }
}

console.log(`=== 流暢講記版修訂預覽 ===`);
console.log(`檔案: ${path.relative(ROOT, sourcePath)}`);
console.log(`通過安全閘門提案: ${proposals.length} 句 | 安全閘門攔截: ${blockedByGuard.length} 句`);
console.log(`類別統計: ${JSON.stringify(categoryCounts)}`);

for (const b of blockedByGuard.slice(0, 10)) {
  console.log(`  [攔截 ${b.sentenceId}] (${b.guardReason}) 原: ${b.originalText} -> 擬改: ${b.proposedText}`);
}

let formattedSession = applyPolishProposals(session, proposals);
if (reLayout) {
  console.log(`正在依範本規格重組自然段（160～340 字）並產生編號小標...`);
  formattedSession = mergeParagraphsByLayout(formattedSession, {
    minChars: 160,
    maxChars: 340,
    preserveExistingHeadings: false,
  });
  formattedSession = await assignSectionHeadingsWithLlm({
    session: formattedSession,
    endpoint,
    model,
    apiKey,
  });
  const headingCount = (formattedSession.paragraphs ?? []).filter((p) => p.heading).length;
  console.log(`段落重組完成：共 ${formattedSession.paragraphs.length} 個自然段，${headingCount} 個編號小標`);
}

if (outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify({
      source: path.relative(ROOT, sourcePath),
      sessionId: session.sessionId ?? null,
      title: session.title ?? null,
      model,
      totalProposals: proposals.length,
      blockedCount: blockedByGuard.length,
      categoryCounts,
      proposals,
      blockedByGuard,
    }, null, 2)}\n`,
    'utf8',
  );
  console.log(`已輸出 diff 預覽報告至: ${path.relative(ROOT, outputPath)}`);
}

if (markdownPath) {
  mkdirSync(path.dirname(markdownPath), { recursive: true });
  writeFileSync(markdownPath, renderReadableMarkdown(formattedSession), 'utf8');
  console.log(`已輸出閱讀版 Markdown 預覽至: ${path.relative(ROOT, markdownPath)}`);
}

if (shouldApply) {
  writeFileSync(sourcePath, `${JSON.stringify(formattedSession, null, 2)}\n`, 'utf8');
  console.log(`已將修訂與排版寫回 ${path.relative(ROOT, sourcePath)}`);
}
