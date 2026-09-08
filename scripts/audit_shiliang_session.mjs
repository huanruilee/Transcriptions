#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sid = process.argv[2] || '27';
const course = '釋量論第二品';
const sessionPath = path.join(root, 'courses', course, 'sessions', `session_${sid}.json`);
const officialPath = path.join(root, 'courses', course, 'source_text', `session_${sid}_official_raw.txt`);
const versesPath = path.join(root, 'courses', course, 'source_text', 'pramana_chapter2_root_verses.txt');
const outDir = path.join(root, 'reviews', 'evidence', `shiliang_${sid}`);
fs.mkdirSync(outDir, { recursive: true });

const read = p => fs.readFileSync(p, 'utf8');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const normalize = s => s
  .replace(/[\u000c\r\n\t ]/g, '')
  .replace(/[「」『』“”‘’]/g, '')
  .replace(/[，。！？；：、,.!?;:]/g, '')
  .replace(/[（()）【】《》〈〉]/g, '');

const session = JSON.parse(read(sessionPath));
const paragraphs = session.paragraphs || [];
const sentences = paragraphs.flatMap(p => p.sentences || []);
const official = read(officialPath);
const verseLines = read(versesPath).split(/\n/)
  .map(x => x.trim()).filter(x => /^\d{2}\s+/.test(x))
  .map(x => { const m = x.match(/^(\d{2})\s+(.+)$/); return { id: Number(m[1]), text: m[2] }; });

const officialNorm = normalize(official);
let cursor = 0;
const sentenceResults = [];
for (const s of sentences) {
  const n = normalize(s.text || '');
  const pos = n ? officialNorm.indexOf(n, cursor) : -1;
  sentenceResults.push({ id: s.id, start: s.start, end: s.end, text: s.text, officialMatch: pos >= 0, officialOffset: pos });
  if (pos >= 0) cursor = pos + n.length;
}

const paragraphResults = paragraphs.map((p, i) => {
  const txt = (p.sentences || []).map(s => s.text || '').join('');
  const n = normalize(txt);
  const pos = n ? officialNorm.indexOf(n) : -1;
  const first = p.sentences?.[0]; const last = p.sentences?.at(-1);
  return { index: i + 1, id: p.id, heading: p.heading || null, sentenceCount: p.sentences?.length || 0,
    start: p.start, end: p.end, firstSentence: first?.id, lastSentence: last?.id,
    officialContiguousMatch: pos >= 0, officialOffset: pos };
});

const verseCandidates = [];
for (const s of sentences) {
  const n = normalize(s.text || '');
  if (!n || n.length < 8) continue;
  for (const v of verseLines) {
    const vn = normalize(v.text);
    if (n.includes(vn) || vn.includes(n) || (n.length >= 12 && vn.includes(n.slice(0, Math.min(24, n.length))))) {
      verseCandidates.push({ sentenceId: s.id, start: s.start, end: s.end, verseId: v.id, transcript: s.text, rootVerse: v.text, match: n === vn ? 'exact-normalized' : 'contains/fuzzy' });
    }
  }
}

const report = {
  schema: 'shiliang-session-audit/v1', sessionId: sid, course,
  status: 'DETERMINISTIC_REVIEW_PENDING_AUDIO_AND_SEMANTIC_REVIEW',
  generatedAt: new Date().toISOString(),
  inputs: { session: path.relative(root, sessionPath), officialRaw: path.relative(root, officialPath), rootVerses: path.relative(root, versesPath),
    sha256: { session: sha256(sessionPath), officialRaw: sha256(officialPath), rootVerses: sha256(versesPath) } },
  counts: { paragraphs: paragraphs.length, sentences: sentences.length, headings: paragraphs.filter(p => p.heading).length,
    sentenceOfficialMatches: sentenceResults.filter(x => x.officialMatch).length, sentenceOfficialMisses: sentenceResults.filter(x => !x.officialMatch).length,
    paragraphOfficialMatches: paragraphResults.filter(x => x.officialContiguousMatch).length, paragraphOfficialMisses: paragraphResults.filter(x => !x.officialContiguousMatch).length,
    verseCandidates: verseCandidates.length },
  invariants: { timestampsMonotonic: sentences.every((s, i) => i === 0 || Number(s.start) >= Number(sentences[i-1].end) - 0.05),
    paragraphBoundsConsistent: paragraphs.every(p => p.sentences?.length && Math.abs(p.start - p.sentences[0].start) < 0.06 && Math.abs(p.end - p.sentences.at(-1).end) < 0.06),
    officialSequentialCoverage: sentenceResults.every(x => x.officialMatch) },
  sentenceResults, paragraphResults, verseCandidates,
  unresolved: { audioVerification: 'REQUIRED', semanticParagraphReview: 'REQUIRED', verseHumanConfirmation: verseCandidates.length ? 'REQUIRED' : 'NONE' }
};
fs.writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify(report, null, 2) + '\n');
const summary = `# 《釋量論第二品》第 ${sid} 講確定性審計\n\n- 狀態：${report.status}\n- 句數／段數／標題：${sentences.length}／${paragraphs.length}／${report.counts.headings}\n- 官方文字逐句命中：${report.counts.sentenceOfficialMatches}/${sentences.length}\n- 官方文字段落連續命中：${report.counts.paragraphOfficialMatches}/${paragraphs.length}\n- 時間戳單調：${report.invariants.timestampsMonotonic ? 'PASS' : 'FAIL'}\n- 段落時間邊界一致：${report.invariants.paragraphBoundsConsistent ? 'PASS' : 'FAIL'}\n- 偈頌候選：${verseCandidates.length}\n- 尚未證明：音檔核對、語意分段、偈頌人工確認\n\n詳細結果：\`audit.json\`。\n`;
fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
console.log(JSON.stringify({ sessionId: sid, status: report.status, counts: report.counts, invariants: report.invariants, evidence: path.relative(root, outDir) }));
