import fs from 'node:fs';
import OpenCC from 'opencc-js';

const REPO = '/home/henry/.gx10/xiaofa/workspace/Transcriptions';
const cc = OpenCC.Converter({ from: 'cn', to: 'twp' });

const raw = JSON.parse(fs.readFileSync(`${REPO}/reviews/evidence/sanzhuyaodao/playlist-01/raw_asr.json`, 'utf8'));
const cand = JSON.parse(fs.readFileSync(`${REPO}/courses/三主要道/sessions/session_01/candidate.json`, 'utf8'));

const strip = (t) => t.replace(/[\s，、。．.,；;：:！!？?（）()「」『』《》—…\-]/g, '');

const rNorm = raw.segments.map((s) => strip(cc(s.text)));
const cNorm = cand.segments.map((s) => strip(cc(s.rawText ?? s.text)));

// 用 SequenceMatcher 式的滑動對齊：以 raw 為主序列，cand 為查詢
// 實作：對每個 cand 句，先試完全相等，再試「包含」關係，最後用相似度最佳者。
function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length;
  // 快速比對：字元 multiset 交集
  const ca = new Map();
  for (const ch of a) ca.set(ch, (ca.get(ch) ?? 0) + 1);
  let inter = 0;
  for (const ch of b) {
    const n2 = ca.get(ch) ?? 0;
    if (n2 > 0) { ca.set(ch, n2 - 1); inter += 1; }
  }
  return (2 * inter) / (m + n);
}

const exact = new Map();
rNorm.forEach((t, i) => {
  if (!exact.has(t)) exact.set(t, i);
});

const mapping = new Array(cNorm.length).fill(-1);
const unmatched = [];
const usedRaw = new Set();

// Pass 1: 完全相等，依序前進（raw 與 cand 大致同序）
let rPtr = 0;
for (let ci = 0; ci < cNorm.length; ci += 1) {
  const ct = cNorm[ci];
  if (!ct) { unmatched.push(ci); continue; }
  let found = -1;
  for (let ri = rPtr; ri < rNorm.length; ri += 1) {
    if (rNorm[ri] === ct) { found = ri; break; }
  }
  if (found < 0) {
    const hit = exact.get(ct);
    if (hit !== undefined && !usedRaw.has(hit)) found = hit;
  }
  if (found >= 0) {
    mapping[ci] = found;
    usedRaw.add(found);
    rPtr = found + 1;
  } else {
    unmatched.push(ci);
  }
}

// Pass 2: 未對上的句子，用最佳相似度配對（限制在 raw 全部）
for (const ci of unmatched) {
  const ct = cNorm[ci];
  if (!ct) continue;
  let best = -1; let bestScore = 0;
  for (let ri = 0; ri < rNorm.length; ri += 1) {
    if (usedRaw.has(ri)) continue;
    const rt = rNorm[ri];
    if (!rt) continue;
    if (Math.abs(rt.length - ct.length) > 4) continue;
    const score = similarity(ct, rt);
    if (score > bestScore) { bestScore = score; best = ri; }
  }
  if (best >= 0 && bestScore >= 0.55) {
    mapping[ci] = best;
    usedRaw.add(best);
  }
}

const stillUnmatched = [];
for (let ci = 0; ci < mapping.length; ci += 1) if (mapping[ci] < 0) stillUnmatched.push(ci);

console.log('cand sentences:', cNorm.length);
console.log('mapped:', mapping.filter((x) => x >= 0).length);
console.log('unmatched:', stillUnmatched.length);
for (const ci of stillUnmatched.slice(0, 10)) {
  console.log('  ', cand.segments[ci].id, cand.segments[ci].rawText);
}

// 產生新的時間碼：每句用其對映 raw 片段的時間；未對上的沿用原值
// Pass 3: 仍未對映者（單字／數字碎片）→ 內插到前後已對映 raw 之間的未用片段
for (let ci = 0; ci < mapping.length; ci += 1) {
  if (mapping[ci] >= 0) continue;
  let prevRi = -1;
  for (let k = ci - 1; k >= 0; k -= 1) { if (mapping[k] >= 0) { prevRi = mapping[k]; break; } }
  let nextRi = -1;
  for (let k = ci + 1; k < mapping.length; k += 1) { if (mapping[k] >= 0) { nextRi = mapping[k]; break; } }
  let candRi = -1;
  if (prevRi >= 0 && nextRi >= 0 && nextRi > prevRi + 1) {
    for (let ri = prevRi + 1; ri < nextRi; ri += 1) if (!usedRaw.has(ri)) { candRi = ri; break; }
  } else if (prevRi >= 0) {
    for (let ri = prevRi + 1; ri < rNorm.length; ri += 1) if (!usedRaw.has(ri)) { candRi = ri; break; }
  }
  if (candRi >= 0) { mapping[ci] = candRi; usedRaw.add(candRi); }
}

const out = cand.segments.map((s, ci) => {
  const ri = mapping[ci];
  if (ri < 0) return { ...s, timeSource: 'merged-unit-fallback' };
  const rs = raw.segments[ri];
  return {
    ...s,
    start: rs.start,
    end: rs.end,
    rawAsrSegmentId: rs.id,
    timeSource: 'raw-asr-segment',
  };
});

// Clamp：消除相鄰重疊，確保 start >= 上一句 end 且 start < end
let adjusted = 0;
for (let i = 1; i < out.length; i += 1) {
  const prev = out[i - 1]; const cur = out[i];
  if (cur.start < prev.end) {
    const ns = prev.end;
    const ne = Math.max(cur.end, ns + 0.01);
    if (ns !== cur.start || ne !== cur.end) adjusted += 1;
    cur.start = ns; cur.end = ne;
    if (cur.timeSource === 'raw-asr-segment') cur.timeSource = 'raw-asr-segment+clamped';
  }
}

const sourceCounts = {};
for (const s of out) sourceCounts[s.timeSource] = (sourceCounts[s.timeSource] ?? 0) + 1;
console.log('timeSource:', JSON.stringify(sourceCounts));
console.log('clamped:', adjusted);

// 驗證：相鄰句不得重疊
let overlaps = 0;
for (let i = 1; i < out.length; i += 1) {
  if (out[i].start < out[i - 1].end - 0.01) overlaps += 1;
}
console.log('adjacent overlaps:', overlaps);
console.log('first 8:', JSON.stringify(out.slice(0, 8).map((s) => [s.id, s.start, s.end, s.rawAsrSegmentId]), null, 0));

fs.writeFileSync('/tmp/szyd/candidate_with_times.json', JSON.stringify({ ...cand, segments: out }, null, 2));
console.log('WROTE /tmp/szyd/candidate_with_times.json');
