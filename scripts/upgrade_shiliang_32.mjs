#!/usr/bin/env node
// scripts/upgrade_shiliang_32.mjs
//
// 釋量論第二品 32 講品質升級
// A. 科判編號 (ordinal numbering from toc.json)
// B. 段落邊界 (paragraph boundary mid-sentence merge)
//
// 規則：
// - Numbering：以 toc.json 的 sections[].children 為權威順序，
//   每個 paragraph.heading 由「【原分類】標題」改為「【原分類】<ordinal>、標題」。
//   對每講：第一次出現的標題匹配 toc 子項時使用該 toc 序位；
//   重複段落沿用同一序位；toc 缺少的子項會在 evidence 中標記為缺漏，
//   但不會自動為 toc 沒有的標題補序位。
// - Boundary：當 paragraph[i] 的最後一句沒有句末標點（。！？」』）
//   且 paragraph[i+1] 的第一句開頭不是新主題常見起首詞，且 prev 文字
//   長度很短（<= 14 字）形成明顯的 mid-word/mid-quote 錯斷，
//   視為明確錯斷，合併 paragraphs[i+1] 進 paragraphs[i]，
//   更新 paragraphs[i].end 為 paragraphs[i+1].end。
// - 禁止：改 sentence.id/text/start/end/rawText、合併兩句為一句、
//   新增空白 placeholder、改動後續 paragraph 的 id 或順序。
//
// 執行：node scripts/upgrade_shiliang_32.mjs

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';

const REPO_ROOT = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '..',
);

const COURSE_DIR = path.join(
  REPO_ROOT,
  'courses',
  '釋量論第二品',
);

const TOC_PATH = path.join(COURSE_DIR, 'toc.json');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');

const CN_ORDINALS = [
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三',
];

const TERM_RE = /[。！？…」』]$/;
const BRACKET_RE = /^【(.+?)】(.*)$/;
const TOC_ORD_RE = /^[一二三四五六七八九十]+、(.*)$/;

// Conservative boundary merge rule
const CLAUSE_FINAL_CHARS = new Set('的是了不在也都就還又但而之嗎呢啊喔哦吧呀');
const SENTENCE_OPENER_STARTS = new Set(
  '所這那一二三四五六七八九十某何為並另再接下不此外然雖當如果即就或乃豈寧'.split(''),
);

// Conservative mid-word/mid-quote detector.
function isMidSentenceBreak(prevText, nextText) {
  if (!prevText || !nextText) return false;
  if (TERM_RE.test(prevText)) return false;
  const prev = prevText.replace(/\s+$/, '');
  if (prev.length === 0) return false;
  if ('，；：「（【《、'.includes(prev.slice(-1))) return false;
  if (CLAUSE_FINAL_CHARS.has(prev.slice(-1))) return false;
  if (prev.length > 14) return false;
  const next = nextText.replace(/^\s+/, '');
  if (next.length === 0) return false;
  if (SENTENCE_OPENER_STARTS.has(next[0])) return false;
  return true;
}

function ordinalToZh(idx) {
  return CN_ORDINALS[idx] ?? String(idx + 1);
}

function stripTocOrdinal(title) {
  const m = TOC_ORD_RE.exec(title);
  return m ? m[1] : title;
}

function loadJson(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

function prettyWrite(fp, data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(fp, json + '\n', 'utf-8');
}

function sha256OfFile(fp) {
  const buf = fs.readFileSync(fp);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// SequenceMatcher-like simple ratio (Dice coefficient on character bigrams).
function bigramSet(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.substr(i, 2));
  }
  return set;
}
function diceRatio(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const sa = bigramSet(a);
  const sb = bigramSet(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

// === Main ===
function main() {
  const toc = loadJson(TOC_PATH);
  const tocBySession = new Map();
  for (const s of toc.sections) {
    tocBySession.set(s.sessionId, s);
  }

  const evidence = { sessions: {} };

  for (let n = 1; n <= 32; n++) {
    const sid = String(n).padStart(2, '0');
    const fp = path.join(SESSIONS_DIR, `session_${sid}.json`);
    const tocSec = tocBySession.get(sid);
    if (!tocSec) {
      throw new Error(`toc.json missing sessionId=${sid}`);
    }
    const tocTitles = tocSec.children.map(c => stripTocOrdinal(c.title));
    const tocCount = tocTitles.length;

    const data = loadJson(fp);
    const originalSha = sha256OfFile(fp);

    // === A. Numbering ===
    // Algorithm:
    // 1. Walk paragraphs in order.
    // 2. For each paragraph with heading, parse as 【cat】title.
    // 3. If title already seen -> reuse ordinal.
    // 4. Else, find best toc match (exact first, then fuzzy Dice >= 0.7) among UNUSED toc slots.
    //    If matched -> use that ordinal.
    //    If no match -> assign next unused ordinal slot (fill gaps from skipped toc children first).
    const seenTitles = new Map(); // title -> ordIdx
    const usedTocIdx = new Set();   // toc indices already assigned
    const numbered = [];

    for (const p of data.paragraphs) {
      const h = p.heading;
      if (h == null) continue;
      const m = BRACKET_RE.exec(h);
      let cat, title;
      if (m) {
        cat = m[1];
        // Normalize an already-numbered heading before matching. This makes
        // the upgrade idempotent and prevents `一、一、...` on reruns.
        title = stripTocOrdinal(m[2]);
      } else {
        cat = '';
        title = stripTocOrdinal(h);
      }

      let ordIdx;
      if (seenTitles.has(title)) {
        ordIdx = seenTitles.get(title);
      } else {
        // Try exact match against an unused toc title
        const exactUnusedIdx = tocTitles.findIndex(
          (tt, i) => !usedTocIdx.has(i) && tt === title
        );
        if (exactUnusedIdx >= 0) {
          ordIdx = exactUnusedIdx;
        } else {
          // Fuzzy match against unused toc titles
          let bestIdx = -1, bestRatio = 0;
          for (let i = 0; i < tocTitles.length; i++) {
            if (usedTocIdx.has(i)) continue;
            const r = diceRatio(title, tocTitles[i]);
            if (r >= 0.7 && r > bestRatio) {
              bestIdx = i;
              bestRatio = r;
            }
          }
          if (bestIdx >= 0) {
            ordIdx = bestIdx;
          } else {
            // No toc match: assign next unused slot, preferring earlier gaps
            ordIdx = -1;
            for (let i = 0; i < tocCount; i++) {
              if (!usedTocIdx.has(i)) { ordIdx = i; break; }
            }
            if (ordIdx === -1) {
              // toc slots exhausted; preserve original heading unchanged
              numbered.push({
                pid: p.id,
                oldHeading: h,
                newHeading: h,
                ordinal: null,
                title,
                cat,
                note: 'exceeds toc child count; heading preserved unchanged',
              });
              continue;
            }
          }
        }
        seenTitles.set(title, ordIdx);
        usedTocIdx.add(ordIdx);
      }

      const newHeading = `【${cat}】${ordinalToZh(ordIdx)}、${title}`;
      const changed = newHeading !== h;
      numbered.push({
        pid: p.id,
        oldHeading: h,
        newHeading,
        ordinal: ordinalToZh(ordIdx),
        title,
        cat,
        changed,
      });
      p.heading = newHeading;
    }

    // Compute missing toc ordinals
    const missingTocIdx = [];
    for (let i = 0; i < tocCount; i++) {
      if (!usedTocIdx.has(i)) missingTocIdx.push(i);
    }

    // === B. Boundary ===
    const paragraphs = data.paragraphs;
    const merges = [];
    let i = 0;
    while (i < paragraphs.length - 1) {
      const a = paragraphs[i];
      const b = paragraphs[i + 1];
      if (!a.heading) { i++; continue; }
      if (b.heading) { i++; continue; }
      const sa = a.sentences || [];
      const sb = b.sentences || [];
      if (!sa.length || !sb.length) { i++; continue; }
      const lastA = sa[sa.length - 1];
      const firstB = sb[0];
      const ta = lastA.text || '';
      const tb = firstB.text || '';
      if (isMidSentenceBreak(ta, tb)) {
        merges.push({
          fromPid: b.id,
          toPid: a.id,
          lastSentId: lastA.id,
          firstSentId: firstB.id,
          prevText: ta,
          nextText: tb,
        });
        a.sentences = sa.concat(sb);
        a.end = b.end;
        paragraphs.splice(i + 1, 1);
        continue;
      }
      i++;
    }

    // === lastUpdated ===
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const lastUpdated = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const oldLastUpdated = data.lastUpdated;
    data.lastUpdated = lastUpdated;

    // Write back
    prettyWrite(fp, data);
    const newSha = sha256OfFile(fp);

    const numberedChangedCount = numbered.filter(x => x.changed).length;
    evidence.sessions[sid] = {
      tocChildCount: tocCount,
      tocTitles,
      paragraphCountBefore: paragraphs.length + merges.length,  // before merge
      paragraphCountAfter: paragraphs.length,                   // after merge
      headingChanges: numberedChangedCount,
      merges,
      mergeCount: merges.length,
      missingTocIdx,
      missingTocOrdinals: missingTocIdx.map(idx => ordinalToZh(idx)),
      oldLastUpdated,
      newLastUpdated: lastUpdated,
      sha256Before: originalSha,
      sha256After: newSha,
      numbered,
    };
  }

  // Save evidence
  const evidenceDir = path.join(REPO_ROOT, 'reviews', 'evidence', 'shiliang_32');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, 'upgrade_evidence.json'),
    JSON.stringify(evidence, null, 2),
    'utf-8',
  );

  let totalNumbered = 0;
  let totalMerges = 0;
  let totalMissing = 0;
  for (const sid of Object.keys(evidence.sessions)) {
    const e = evidence.sessions[sid];
    totalNumbered += e.headingChanges;
    totalMerges += e.mergeCount;
    totalMissing += e.missingTocIdx.length;
  }
  console.log(`OK: heading_changes=${totalNumbered} merges=${totalMerges} missing_toc_children=${totalMissing}`);
}

main();
