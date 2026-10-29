import fs from 'node:fs';
import OpenCC from 'opencc-js';

const REPO = '/home/henry/.gx10/xiaofa/workspace/Transcriptions';
const cc = OpenCC.Converter({ from: 'cn', to: 'twp' });

const raw = JSON.parse(fs.readFileSync(`${REPO}/reviews/evidence/sanzhuyaodao/playlist-01/raw_asr.json`, 'utf8'));
const cand = JSON.parse(fs.readFileSync(`${REPO}/courses/三主要道/sessions/session_01/candidate.json`, 'utf8'));

const strip = (t) => t.replace(/[\s，、。．.,；;：:！!？?（）()「」『』《》—…\-]/g, '');
const rNorm = raw.segments.map((s) => strip(cc(s.text)));
const cNorm = cand.segments.map((s) => strip(cc(s.rawText ?? s.text)));

// 1) 找出 candidate 每句所屬的「合併單位」：相同 (start,end) 的連續句群
const units = [];
for (let i = 0; i < cand.segments.length; i += 1) {
  const s = cand.segments[i];
  const last = units[units.length - 1];
  if (last && Math.abs(last.start - s.start) < 0.001 && Math.abs(last.end - s.end) < 0.001) {
    last.idx.push(i);
  } else {
    units.push({ start: s.start, end: s.end, idx: [i] });
  }
}
console.log('merged units:', units.length, ' candidate sentences:', cand.segments.length);

// 2) 對每個合併單位，用其所有句子的文字串接去 raw 中找出涵蓋該單位的 raw 片段區間
//    策略：raw 片段依時間排序；對每個單位找「時間落在 [start,end] 內」的 raw 片段
const out = new Array(cand.segments.length).fill(null);
let fallbackCount = 0;
let interpolated = 0;
let exactCount = 0;

for (const unit of units) {
  const inRange = raw.segments
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.start >= unit.start - 0.05 && s.end <= unit.end + 0.05);

  const unitText = strip(cc(unit.idx.map((i) => cand.segments[i].rawText ?? cand.segments[i].text).join('')));
  const rangeText = strip(cc(inRange.map(({ s }) => s.text).join('')));

  const canMatch = rangeText.length > 0 && unitText.length > 0 && rangeText.includes(unitText);

  if (canMatch && inRange.length === unit.idx.length) {
    // 完全對應：每句一個 raw 片段
    unit.idx.forEach((ci, k) => {
      out[ci] = { start: inRange[k].s.start, end: inRange[k].s.end, rawAsrSegmentId: inRange[k].s.id, timeSource: 'raw-asr-segment' };
    });
    exactCount += unit.idx.length;
    continue;
  }

  // 內插：依字元比例分配到 raw 片段
  if (inRange.length > 0 && unitText.length > 0) {
    let cursor = 0;
    const totalChars = unitText.length;
    unit.idx.forEach((ci, k) => {
      const share = cNorm[ci].length;
      const fracStart = cursor / totalChars;
      cursor += share;
      const fracEnd = cursor / totalChars;
      const pick = Math.min(inRange.length - 1, Math.floor(fracStart * inRange.length));
      const seg = inRange[pick].s;
      out[ci] = {
        start: seg.start + (seg.end - seg.start) * fracStart,
        end: seg.start + (seg.end - seg.start) * fracEnd,
        rawAsrSegmentId: seg.id,
        timeSource: 'raw-asr-interpolated',
      };
      interpolated += 1;
    });
    continue;
  }

  // 完全沒有對應 raw：沿用合併單位時間，依比例切分
  const n = unit.idx.length;
  unit.idx.forEach((ci, k) => {
    const s = unit.start + ((unit.end - unit.start) * k) / n;
    const e = unit.start + ((unit.end - unit.start) * (k + 1)) / n;
    out[ci] = { start: s, end: e, rawAsrSegmentId: null, timeSource: 'merged-unit-interpolated' };
    fallbackCount += 1;
  });
}

// 3) Clamp：消除相鄰重疊
let adjusted = 0;
for (let i = 1; i < out.length; i += 1) {
  const prev = out[i - 1]; const cur = out[i];
  if (cur.start < prev.end - 0.001) {
    const ns = prev.end;
    const ne = Math.max(cur.end, ns + 0.01);
    adjusted += 1;
    cur.start = ns; cur.end = ne;
    cur.timeSource += '+clamped';
  }
  if (cur.end <= cur.start) cur.end = cur.start + 0.01;
}

let overlaps = 0;
for (let i = 1; i < out.length; i += 1) if (out[i].start < out[i - 1].end - 0.001) overlaps += 1;

const srcCounts = {};
for (const s of out) srcCounts[s.timeSource] = (srcCounts[s.timeSource] ?? 0) + 1;
console.log('timeSource:', JSON.stringify(srcCounts, null, 1));
console.log('adjusted:', adjusted, 'remaining overlaps:', overlaps);
console.log('exact:', exactCount, 'interpolated:', interpolated, 'fallback:', fallbackCount);
console.log('first 8:', JSON.stringify(out.slice(0, 8).map((s) => [s.start, s.end, s.rawAsrSegmentId])));
const last = out[out.length - 1];
console.log('last:', last.start, last.end);

const segs = cand.segments.map((s, i) => ({ ...s, ...out[i] }));
fs.writeFileSync('/tmp/szyd/candidate_with_times.json', JSON.stringify({ ...cand, segments: segs }, null, 2));
console.log('WROTE /tmp/szyd/candidate_with_times.json');
