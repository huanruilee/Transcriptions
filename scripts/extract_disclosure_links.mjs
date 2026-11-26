// 為單一 session 的 discussionQuestions 補上結構化「法師開示深連結」。
// 來源兩種：
//   1) source_outlines/<NN>.json 的 mappings[].evidence 內「法師開示：起–訖（<sid> <q-id>）｜https://…&t=<秒>」
//      → kind: 'segment'（開示區間，含起訖秒數）
//   2) 該題 teacherSummary.items 的 [▶ mm:ss] 時間錨
//      → kind: 'summary-anchor'
// 影片 id：優先取 mapping.outlineRef.videoId，其次 session._meta.sourceUrl。
import fs from 'node:fs';

const [, , sessionPath, outlinePath] = process.argv;
if (!sessionPath || !outlinePath) {
  console.error('usage: node extract_disclosure_links.mjs <session.json> <outline.json>');
  process.exit(1);
}

const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
const outline = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const fallbackVideoId = session.youtubeVideoId
  || (session._meta?.sourceUrl || '').match(/v=([\w-]{6,})/)?.[1]
  || null;

function toSeconds(ts) {
  if (!ts) return null;
  const parts = String(ts).split(':').map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function fmt(ts) {
  const s = toSeconds(ts);
  if (s == null) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function youTubeUrl(videoId, seconds) {
  return `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
}

// --- 1. 從 outline evidence 抽開示區間 ---
const EVIDENCE_RE = /法師開示：([\d:]+)–([\d:]+)（(\S+)\s+(q-[\w-]+)）｜(https:\/\/\S+)/g;
const segmentsByQuestion = new Map(); // q-id -> [{...}]
for (const mapping of outline.mappings || []) {
  const evidence = String(mapping.evidence || '');
  const videoId = mapping.outlineRef?.videoId || fallbackVideoId;
  let match;
  EVIDENCE_RE.lastIndex = 0;
  while ((match = EVIDENCE_RE.exec(evidence))) {
    const [, startTs, endTs, sid, qid, url] = match;
    const seconds = toSeconds(startTs);
    const endSeconds = toSeconds(endTs);
    if (seconds == null || !videoId) continue;
    const urlSeconds = Number(url.match(/[?&]t=(\d+)s?/)?.[1]);
    const list = segmentsByQuestion.get(qid) || [];
    list.push({
      kind: 'segment',
      label: `法師開示 ${startTs}–${endTs}`,
      title: `跳至 YouTube 法師開示區間（${startTs}–${endTs}）`,
      seconds: Number.isFinite(urlSeconds) ? urlSeconds : seconds,
      endSeconds,
      'mm:ss': fmt(startTs),
      url: youTubeUrl(videoId, Number.isFinite(urlSeconds) ? urlSeconds : seconds),
      source: `${outline.sourceId}#${mapping.sourceQuestionNo}`,
    });
    segmentsByQuestion.set(qid, list);
  }
}

// --- 2. 題目 teacherSummary 的時間錨 ---
const ANCHOR_RE = /\[▶\s*([\d:]{4,8})\]/;
const anchorsByQuestion = new Map();
for (const question of session.discussionQuestions || []) {
  const videoId = fallbackVideoId;
  const items = question.teacherSummary?.items || [];
  const anchors = [];
  for (const item of items) {
    const match = String(item).match(ANCHOR_RE);
    if (!match) continue;
    const seconds = toSeconds(match[1]);
    if (seconds == null || !videoId) continue;
    anchors.push({
      kind: 'summary-anchor',
      label: `重聽 ${match[1]}`,
      title: `跳至 YouTube 對應時刻（${match[1]}）`,
      seconds,
      'mm:ss': fmt(match[1]),
      url: youTubeUrl(videoId, seconds),
    });
  }
  anchorsByQuestion.set(question.id, anchors);
}

// --- 合併、排序、寫回 ---
let added = 0;
for (const question of session.discussionQuestions || []) {
  const segments = segmentsByQuestion.get(question.id) || [];
  const anchors = anchorsByQuestion.get(question.id) || [];
  const merged = [...segments, ...anchors]
    .sort((a, b) => a.seconds - b.seconds)
    .filter((link, index, all) => all.findIndex((o) => o.seconds === link.seconds) === index);
  if (merged.length) {
    question.disclosureLinks = merged;
    added += merged.length;
  }
}

fs.writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
console.log(`OK questions=${session.discussionQuestions?.length ?? 0} links=${added}`);
for (const question of session.discussionQuestions || []) {
  const links = question.disclosureLinks || [];
  console.log(`  ${question.id} segments=${links.filter((l) => l.kind === 'segment').length} anchors=${links.filter((l) => l.kind === 'summary-anchor').length}`);
}
