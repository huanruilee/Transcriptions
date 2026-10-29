import fs from 'node:fs';
import OpenCC from 'opencc-js';

const REPO = '/home/henry/.gx10/xiaofa/workspace/Transcriptions';
const cc = OpenCC.Converter({ from: 'cn', to: 'twp' });

const raw = JSON.parse(fs.readFileSync(`${REPO}/reviews/evidence/sanzhuyaodao/playlist-01/raw_asr.json`, 'utf8'));
const cand = JSON.parse(fs.readFileSync(`${REPO}/courses/三主要道/sessions/session_01/candidate.json`, 'utf8'));

const strip = (t) => t.replace(/[\s，、。．.,；;：:！!？?（）()「」『』《》—…\-]/g, '');
const rNorm = raw.segments.map((s) => strip(cc(s.text)));
const cNorm = cand.segments.map((s) => strip(cc(s.rawText ?? s.text)));

// 把 raw 片段文字串成一個大字串，並記錄每個字元屬於哪個 raw 片段
let rJoined = '';
const rOwner = [];
raw.segments.forEach((s, i) => {
  const t = rNorm[i];
  for (let k = 0; k < t.length; k += 1) { rJoined += t[k]; rOwner.push(i); }
});

// 把 candidate 句文字串成一個大字串
let cJoined = '';
const cOwner = [];
cand.segments.forEach((s, i) => {
  const t = cNorm[i];
  for (let k = 0; k < t.length; k += 1) { cJoined += t[k]; cOwner.push(i); }
});

console.log('raw chars:', rJoined.length, ' cand chars:', cJoined.length);

// SequenceMatcher: 找出 equal 區塊 → 建立 cand 句 → raw 片段的映射
const sm = new (await import('node:util')).TextEncoder; // placeholder
