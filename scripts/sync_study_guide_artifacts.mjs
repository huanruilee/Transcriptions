#!/usr/bin/env node
/**
 * sync_study_guide_artifacts.mjs
 * 將修正後的 lecture_*_study_guide.md 同步為 .txt 與 .html。
 * - .txt：使用 upgrade_study_group_course.mjs 中完全相同的 markdownToPlainText() 規則
 * - .html：呼叫 scripts/render_study_guide_html.py（上游同一支 renderer）
 * 僅處理 --files 指定的 md，避免觸及無關檔案。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = process.cwd();

function markdownToPlainText(md) {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*---\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

const args = process.argv.slice(2);
const filesIdx = args.indexOf('--files');
const mdFiles = filesIdx >= 0
  ? args[filesIdx + 1].split(',').map((f) => f.trim()).filter(Boolean)
  : [];

if (!mdFiles.length) {
  console.error('usage: node sync_study_guide_artifacts.mjs --files a.md,b.md');
  process.exit(1);
}

const pubDirs = [...new Set(mdFiles.map((f) => path.dirname(f)))];
let synced = 0;

for (const mdPath of mdFiles) {
  if (!fs.existsSync(mdPath)) {
    console.error(`skip (missing): ${mdPath}`);
    continue;
  }
  const md = fs.readFileSync(mdPath, 'utf8');
  const txtPath = mdPath.replace(/\.md$/, '.txt');
  fs.writeFileSync(txtPath, markdownToPlainText(md), 'utf8');
  synced += 1;
  console.log(`txt  <- ${path.basename(mdPath)}`);
}

// 一次渲染全部 html
const pyRes = spawnSync(
  'python3',
  ['scripts/render_study_guide_html.py', ...mdFiles],
  { cwd: REPO, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
if (pyRes.status !== 0) {
  console.error('render_study_guide_html.py FAILED:\n' + pyRes.stderr + '\n' + pyRes.stdout);
  process.exit(1);
}
console.log(pyRes.stdout.trim());
console.log(`\nOK: ${synced} md -> txt + html`);
