import { createHash } from 'node:crypto';

const READER_NOTICE = '待閱校版：來源基準為既有機器校對稿；新 ASR 僅供輔助核對，尚未人工完整校訂。疑義請配合原音核對。';
const OFFICIAL_AUDIO_HOST = 'buddha.flyday.com.tw';

function fail(message) { throw new Error(`38A faithful reader: ${message}`); }
function clone(value) { return structuredClone(value); }
function hash(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function parseSource(sourceBytes) {
  const bytes = Buffer.isBuffer(sourceBytes) ? sourceBytes : Buffer.from(sourceBytes);
  let source;
  try { source = JSON.parse(bytes.toString('utf8')); } catch { fail('sourceBytes must contain valid JSON'); }
  if (source?.sessionId !== '38A') fail('expected sessionId 38A');
  if (!Array.isArray(source.paragraphs)) fail('source paragraphs are required');
  return { source, bytes };
}
function validatePlan(plan, sourceDigest) {
  if (!plan || typeof plan !== 'object') fail('plan is required');
  if (plan.sourceDigest !== sourceDigest) fail('stale or mismatched sourceDigest');
  if (typeof plan.processedAt !== 'string' || !plan.processedAt.trim()) fail('processedAt is required');
  if (!Array.isArray(plan.corrections ?? [])) fail('corrections must be an array');
  if (!Array.isArray(plan.pending ?? [])) fail('pending must be an array');
  if (!Array.isArray(plan.headingCorrections ?? [])) fail('headingCorrections must be an array');
  return {
    corrections: plan.corrections ?? [], pending: plan.pending ?? [],
    headingCorrections: plan.headingCorrections ?? [],
  };
}
function indexSource(source) {
  const paragraphs = new Map();
  const sentences = new Map();
  for (const paragraph of source.paragraphs) {
    if (!paragraph || typeof paragraph.id !== 'string' || paragraphs.has(paragraph.id)) fail('paragraph IDs must be unique strings');
    paragraphs.set(paragraph.id, paragraph);
    if (!Array.isArray(paragraph.sentences)) fail(`sentences missing for ${paragraph.id}`);
    paragraph.sentences.forEach((sentence, index) => {
      const locator = `${paragraph.id}:${index}`;
      sentences.set(locator, { paragraph, sentence, index });
    });
  }
  return { paragraphs, sentences };
}
function validateLocator(locator, sentenceIndex, field) {
  if (typeof locator !== 'string' || !sentenceIndex.has(locator)) fail(`${field} references unknown locator ${String(locator)}`);
}
function occurrenceSpans(text, needle) {
  if (!needle) return [];
  const spans = [];
  let offset = 0;
  while ((offset = text.indexOf(needle, offset)) !== -1) {
    spans.push({ start: offset, end: offset + needle.length });
    offset += needle.length;
  }
  return spans;
}
function validateAudioUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('audioUrl must be a valid HTTPS URL'); }
  if (url.protocol !== 'https:' || url.hostname !== OFFICIAL_AUDIO_HOST || url.port || url.username || url.password) fail('audioUrl must use the official HTTPS audio host');
  return url.href;
}

export function build38A(sourceBytes, plan) {
  const { source, bytes } = parseSource(sourceBytes);
  const sourceDigest = hash(bytes);
  const { corrections, pending, headingCorrections } = validatePlan(plan, sourceDigest);
  const { paragraphs, sentences } = indexSource(source);
  const spansByLocator = new Map();
  const corrected = new Map();
  const ledger = [];

  for (const edit of corrections) {
    validateLocator(edit?.locator, sentences, 'correction');
    const { sentence } = sentences.get(edit.locator);
    if (typeof sentence.text !== 'string') fail(`source text missing at ${edit.locator}`);
    if (typeof edit.from !== 'string' || typeof edit.to !== 'string' || edit.from === edit.to) fail(`invalid from/to at ${edit.locator}`);
    if (edit.to === '' && !(edit.kind === 'metadata-extraction' && /^\[REVIEW:[\s\S]*\]$/.test(edit.from))) fail(`empty replacement requires explicit whole-block metadata-extraction at ${edit.locator}`);
    const matches = occurrenceSpans(sentence.text, edit.from);
    if (!Number.isInteger(edit.count) || edit.count < 1 || matches.length !== edit.count) fail(`count mismatch at ${edit.locator}`);
    if (typeof edit.basis !== 'string' || !edit.basis.trim()) fail(`basis required at ${edit.locator}`);
    const occupied = spansByLocator.get(edit.locator) ?? [];
    for (const match of matches) {
      if (occupied.some((span) => match.start < span.end && span.start < match.end)) fail(`overlapping source spans at ${edit.locator}`);
      occupied.push({ ...match, from: edit.from, to: edit.to, basis: edit.basis, kind: edit.kind ?? 'text-correction' });
      ledger.push({ locator: edit.locator, before: edit.from, after: edit.to, count: 1, basis: edit.basis, kind: edit.kind ?? 'text-correction', sourceDigest, humanListened: false, sourceSpan: { start: match.start, end: match.end } });
    }
    spansByLocator.set(edit.locator, occupied);
  }

  const pendingLocators = new Set();
  for (const item of pending) {
    validateLocator(item?.locator, sentences, 'pending item');
    if (pendingLocators.has(item.locator)) fail(`duplicate pending locator ${item.locator}`);
    if (typeof item.reason !== 'string' || !item.reason.trim()) fail(`pending reason required at ${item.locator}`);
    pendingLocators.add(item.locator);
  }

  const headingIds = new Set();
  for (const edit of headingCorrections) {
    const paragraph = paragraphs.get(edit?.paragraphId);
    if (!paragraph) fail(`heading correction references unknown paragraph ${String(edit?.paragraphId)}`);
    if (headingIds.has(edit.paragraphId)) fail(`duplicate heading correction ${edit.paragraphId}`);
    headingIds.add(edit.paragraphId);
    if (typeof paragraph.heading !== 'string' || paragraph.heading !== edit.from || typeof edit.to !== 'string' || !edit.to.trim() || edit.to === edit.from) fail(`invalid heading correction ${edit.paragraphId}`);
    if (typeof edit.basis !== 'string' || !edit.basis.trim()) fail(`heading basis required at ${edit.paragraphId}`);
    ledger.push({ locator: `${edit.paragraphId}:heading`, before: edit.from, after: edit.to, count: 1, basis: edit.basis, kind: 'heading-correction', sourceDigest, humanListened: false });
  }

  const session = clone(source);
  session.lastUpdated = plan.processedAt;
  session._meta = { ...(session._meta ?? {}), processed_at: plan.processedAt, last_updated: plan.processedAt, sourceDigest };
  session.transcriptPublicationState = 'review-ready';
  session.qualityReview = {
    readerNotice: `待閱校版：${READER_NOTICE.replace(/^待閱校版：/, '')}`,
    verbatimLabel: '待閱校・尚未人工聽核',
    reviewPage: 'lecture_38A_quality_review.html',
    humanAudioAcceptance: false,
    sourceDigest,
    processedAt: plan.processedAt,
    pendingItems: pending.map((item) => ({ locator: item.locator, reason: item.reason })),
  };
  for (const item of pending) {
    const { paragraph, index } = sentences.get(item.locator);
    const sentence = session.paragraphs.find((candidate) => candidate.id === paragraph.id).sentences[index];
    sentence.reviewNeeded = true;
    if (typeof sentence.uncertainty !== 'string' || !sentence.uncertainty.trim()) sentence.uncertainty = item.reason;
  }
  for (const [locator, sourceSpans] of spansByLocator) {
    const { sentence } = sentences.get(locator);
    let value = sentence.text;
    for (const span of [...sourceSpans].sort((left, right) => right.start - left.start)) {
      value = `${value.slice(0, span.start)}${span.to}${value.slice(span.end)}`;
    }
    corrected.set(locator, value);
  }
  // Apply after all source spans have been resolved against immutable source text.
  for (const paragraph of session.paragraphs) {
    paragraph.sentences.forEach((sentence, index) => {
      const locator = `${paragraph.id}:${index}`;
      if (corrected.has(locator)) {
        if (!Object.hasOwn(sentence, 'rawText')) sentence.rawText = sentences.get(locator).sentence.text;
        sentence.text = corrected.get(locator);
      }
    });
  }
  for (const edit of headingCorrections) {
    session.paragraphs.find((paragraph) => paragraph.id === edit.paragraphId).heading = edit.to;
  }

  const verbatimParagraphs = {};
  for (const paragraph of session.paragraphs) {
    verbatimParagraphs[paragraph.id] = paragraph.sentences.map((sentence, index) => {
      const locator = `${paragraph.id}:${index}`;
      const original = source.paragraphs.find((item) => item.id === paragraph.id).sentences[index];
      const result = { ...clone(original), text: corrected.get(locator) ?? original.text, id: original.id ?? `${paragraph.id.replace('_', '')}-s${index + 1}`, sourceLocator: locator, rawText: original.rawText ?? original.text };
      return result;
    });
  }
  const verbatim = {
    sessionId: '38A', paragraphs: verbatimParagraphs,
    status: 'published-pending-reading', humanListened: false, sourceDigest,
  };
  if (plan.overview !== undefined) session.contentOverview = clone(plan.overview);
  return { session, verbatim, ledger, sourceSnapshot: clone(source) };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function escapeMarkdown(value) {
  return escapeHtml(value).replace(/([\\`*_{}\[\]()#+\-.!|>~])/g, '\\$1');
}
function markdownDestination(value) {
  return value.replace(/[\[\]()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
function timecode(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
}
function flattened(result) {
  const { session, verbatim } = result ?? {};
  if (session?.sessionId !== '38A' || verbatim?.sessionId !== '38A') fail('render requires a built 38A result');
  const audioUrl = validateAudioUrl(session.audioUrl);
  const rows = [];
  for (const paragraph of session.paragraphs) {
    const items = verbatim.paragraphs[paragraph.id];
    if (!Array.isArray(items) || items.length !== paragraph.sentences.length) fail(`verbatim coverage mismatch at ${paragraph.id}`);
    items.forEach((sentence, index) => rows.push({ paragraph, sentence, index, text: sentence.text }));
  }
  return { audioUrl, rows };
}
function rowLocator(row) { return row.sentence.sourceLocator; }
function warnings() { return `${READER_NOTICE}\n\n待閱校・尚未人工聽核。`; }

export function text38A(result) {
  const { rows } = flattened(result);
  const pending = new Map((result.session.qualityReview.pendingItems ?? []).map((item) => [item.locator, item.reason]));
  const output = [warnings(), ''];
  let previous = null;
  for (const row of rows) {
    if (row.paragraph.id !== previous) {
      output.push(`\n${row.paragraph.id}${row.paragraph.heading ? ` ${row.paragraph.heading}` : ''}`);
      previous = row.paragraph.id;
    }
    const at = Number(row.sentence.start ?? row.paragraph.start ?? 0);
    const locator = rowLocator(row);
    output.push(`[${row.sentence.id}] [${timecode(at)}] ${row.text}${pending.has(locator) ? ` 〔待核：${pending.get(locator)}〕` : ''}`);
  }
  output.push('', warnings());
  return `${output.join('\n')}\n`;
}

export function markdown38A(result) {
  const { rows, audioUrl } = flattened(result);
  const pending = new Map((result.session.qualityReview.pendingItems ?? []).map((item) => [item.locator, item.reason]));
  const output = [`> ${warnings().replaceAll('\n', '\n> ')}`, '', `[官方原音（完整音檔）](<${markdownDestination(audioUrl)}>)`, ''];
  let previous = null;
  for (const row of rows) {
    if (row.paragraph.id !== previous) {
      output.push(`\n### ${escapeMarkdown(row.paragraph.id)}${row.paragraph.heading ? ` ${escapeMarkdown(row.paragraph.heading)}` : ''}`);
      previous = row.paragraph.id;
    }
    const locator = rowLocator(row);
    const at = Number(row.sentence.start ?? row.paragraph.start ?? 0);
    const pendingNote = pending.has(locator) ? ` · 待核：${escapeMarkdown(pending.get(locator))}` : '';
    output.push(`- **${escapeMarkdown(row.sentence.id)}** 校訂候選：${escapeMarkdown(row.text)}  \n  原有辨識文字：${escapeMarkdown(row.sentence.rawText ?? row.text)} · [原音 ${timecode(at)}](<${markdownDestination(audioUrl)}#t=${at}>) · 定位 ${escapeMarkdown(locator)}${pendingNote}`);
  }
  output.push('', `> ${warnings().replaceAll('\n', '\n> ')}`);
  return `${output.join('\n')}\n`;
}

export function render38A(result) {
  const { rows, audioUrl } = flattened(result);
  const pending = new Map((result.session.qualityReview.pendingItems ?? []).map((item) => [item.locator, item.reason]));
  const cards = rows.map((row) => {
    const locator = rowLocator(row);
    const at = Number(row.sentence.start ?? row.paragraph.start ?? 0);
    const sourceText = row.sentence.rawText ?? row.text;
    return `<article id="${escapeHtml(locator)}"><h2>${escapeHtml(row.sentence.id)}${pending.has(locator) ? ' · 待核對' : ''}</h2>${row.paragraph.heading ? `<p>${escapeHtml(row.paragraph.heading)}</p>` : ''}<p><strong>校訂候選：</strong>${escapeHtml(row.text)}</p><details><summary>查看原有辨識文字</summary><p>${escapeHtml(sourceText)}</p></details><p><a href="${escapeHtml(audioUrl)}#t=${encodeURIComponent(at)}">官方原音 ${timecode(at)}</a> · 定位 ${escapeHtml(locator)}</p>${pending.has(locator) ? `<p>待核：${escapeHtml(pending.get(locator))}</p>` : ''}</article>`;
  }).join('\n');
  const safeTextLiteral = JSON.stringify(text38A(result)).replaceAll('<', '\\u003c');
  const script = `document.getElementById('download-txt').addEventListener('click',()=>{const text=${safeTextLiteral};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.download='lecture_38A_verbatim.txt';a.click();URL.revokeObjectURL(a.href);});`;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>38A 忠實原話待閱校版</title><style>body{font:18px/1.8 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#25312c;overflow-wrap:anywhere}header,footer{border:2px solid #9b5c00;background:#fff5df;padding:1rem}article{border-top:1px solid #bbb;padding:1rem 0}h2{font-size:1.05rem}audio{width:100%;max-width:100%}a{overflow-wrap:anywhere;color:#285f4a}button{font:inherit;padding:.5rem}</style></head><body><header><h1>38A 忠實原話閱讀版</h1><p>${escapeHtml(warnings())}</p><p>來源：既有機器校對稿 · ${rows.length} 句 · ${escapeHtml(result.session._meta.sourceDigest)}</p></header><p><a href="${escapeHtml(audioUrl)}">開啟官方完整音檔</a></p><audio controls preload="none" src="${escapeHtml(audioUrl)}">瀏覽器不支援音訊播放。<a href="${escapeHtml(audioUrl)}">官方完整音檔</a></audio><p><button id="download-txt" type="button">下載忠實原話 TXT</button></p>${cards}<footer><p>${escapeHtml(warnings())}</p></footer><script>${script}</script></body></html>`;
}
