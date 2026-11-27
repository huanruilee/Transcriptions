#!/usr/bin/env node
/**
 * scripts/check_session_dates.mjs
 *
 * 讀者頁的「🕒 最後校正更新」直接顯示 session JSON 的 `lastUpdated`
 * （src/App.vue）。改了逐字稿內容卻忘了蓋日期，頁面就會宣稱比實際更舊的
 * 校正日——TESTING.md 已把這種情況列為人工驗收 FAIL，但先前沒有任何程式
 * 或 CI 檢查，2026-11-27 的 29上重切句就是這樣漏掉的。
 *
 * 這個檢查把「內容有變 ⇒ 日期要蓋到當次提交」變成可執行規則：
 * 對每一個被本次改動的 session JSON，`lastUpdated` 的日期不得早於最後一次
 * 改到該檔的 commit 日期（git log -1 --format=%ad --date=short -- <file>）。
 *
 * 用法：
 *   node scripts/check_session_dates.mjs --files <a.json> <b.json>   # CI / 本機
 *   node scripts/check_session_dates.mjs --all                       # 全庫（僅報告）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATE_RE = /^(\d{4}-\d{2}-\d{2})/;

export function dateOf(value) {
  const match = String(value ?? '').match(DATE_RE);
  return match ? match[1] : null;
}

/** 純函式：回傳違規清單（不碰 git，方便測試）。 */
export function evaluateFreshness({ file, lastUpdated, lastCommitDate }) {
  const updated = dateOf(lastUpdated);
  if (!updated) {
    return [{ file, code: 'MISSING_LAST_UPDATED', detail: `lastUpdated=${JSON.stringify(lastUpdated ?? null)}` }];
  }
  if (!lastCommitDate) return [];
  if (updated < lastCommitDate) {
    return [{
      file,
      code: 'STALE_LAST_UPDATED',
      detail: `lastUpdated=${updated} 早於最後改檔 commit ${lastCommitDate}（讀者頁會顯示過舊的校正日期）`,
    }];
  }
  return [];
}

export function lastCommitDateFor(file, root = ROOT) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%ad', '--date=short', '--', file], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

export function checkFiles(files, root = ROOT) {
  const violations = [];
  const checked = [];
  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.join(root, file);
    if (!fs.existsSync(abs)) continue;
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    const session = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const commitDate = lastCommitDateFor(rel, root);
    checked.push({ file: rel, lastUpdated: session.lastUpdated ?? null, lastCommitDate: commitDate });
    violations.push(...evaluateFreshness({ file: rel, lastUpdated: session.lastUpdated, lastCommitDate: commitDate }));
  }
  return { checked, violations };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let files = [];
  if (args.includes('--all')) {
    const out = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files', 'courses/*/sessions/session_*.json'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    files = out.split('\n').filter(Boolean);
  } else if (args.includes('--files')) {
    files = args.slice(args.indexOf('--files') + 1).filter((a) => !a.startsWith('--'));
  }
  if (files.length === 0) {
    console.error('Usage: node scripts/check_session_dates.mjs --files <session.json...> | --all');
    process.exit(2);
  }
  const reportOnly = args.includes('--all');
  const { checked, violations } = checkFiles(files);
  console.log(JSON.stringify({ checked: checked.length, violations: violations.length, detail: violations }, null, 1));
  if (!reportOnly && violations.length > 0) {
    console.error(`STALE_SESSION_DATE: ${violations.map((v) => `${v.file} ${v.code}`).join(', ')}`);
    process.exit(1);
  }
}
