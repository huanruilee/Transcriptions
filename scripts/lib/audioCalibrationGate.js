/** Structural release gate; acoustic evidence remains machine evidence, never human listening. */
const HASH = /^sha256:[a-f0-9]{64}$/;
const characters = text => [...String(text ?? '').replace(/[^\p{L}\p{N}]/gu, '')].length;
const compressed = item => characters(item.text) >= 12 && (item.end - item.start <= 0.51 || characters(item.text) / (item.end - item.start) > 12);
export function auditAudioCalibration(source, candidate, expectedSourceDigest) {
  const sentences = source.paragraphs.flatMap(p => p.sentences);
  const suspicious = sentences.filter(compressed).map(s => s.id);
  const errors = [];
  const fail = (code, id) => errors.push({ code, ...(id ? { id } : {}) });
  if (!candidate || candidate.schema !== 'audio-calibration/v1') {
    fail('missing-calibration');
    return { ok: false, errors, suspicious };
  }
  if (candidate.sourceDigest !== expectedSourceDigest) fail('source-mismatch');
  if (candidate.videoId !== source.youtubeVideoId) fail('video-mismatch');
  const audio = candidate.audio;
  if (!audio?.identityVerified || !HASH.test(audio.sha256 ?? '') || !Number.isFinite(audio.duration) || audio.duration <= 0 || !Number.isFinite(audio.videoOffsetSeconds)) fail('audio-identity');
  if (!candidate.engine?.name || !candidate.engine?.revision) fail('engine-missing');
  const items = candidate.items ?? [];
  if (items.length !== sentences.length || new Set(items.map(s=>s.id)).size !== items.length) fail('coverage');
  items.forEach((item,index) => {
    const original = sentences[index];
    if (!original || original.id !== item.id) fail('coverage', item.id);
    if (original?.text !== item.text) fail('text-mismatch', item.id);
    if (item.status !== 'aligned') fail('unresolved', item.id);
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end <= item.start || item.end > audio?.duration || (index && item.start < items[index-1].start)) fail('invalid-time', item.id);
    if (compressed(item)) fail('implausible-duration', item.id);
    const e = item.evidence;
    if (!e || !HASH.test(e.artifactSha256 ?? '')) fail('evidence-missing', item.id);
    if (!e || !Number.isFinite(e.start) || !Number.isFinite(e.end) || Math.abs(item.start-e.start)>0.001 || Math.abs(item.end-e.end)>0.001) fail('evidence-boundary', item.id);
    if (!e || !Number.isFinite(e.matchedCharacters) || !Number.isFinite(e.totalCharacters) || e.totalCharacters <= 0 || e.matchedCharacters/e.totalCharacters < 0.75 || e.matchedCharacters > e.totalCharacters) fail('weak-match', item.id);
  });
  return { ok: errors.length === 0, errors, suspicious };
}

/** Replays the boundary references against the actual hashed ASR output, not self-reported numbers. */
export function auditAcousticEvidence(candidate, evidence, evidenceDigest) {
  const errors = [];
  const fail = (code, id) => errors.push({ code, ...(id ? { id } : {}) });
  if (!HASH.test(evidenceDigest ?? '') || candidate.audio?.sha256 !== evidence?.audioSha256 || evidence?.wordTimestamps !== true) fail('acoustic-identity');
  const words = (evidence?.segments ?? []).flatMap(s => s.words ?? []);
  for (const item of candidate.items ?? []) {
    const e = item.evidence;
    const first = words[e?.firstWord], last = words[e?.lastWord];
    if (e?.artifactSha256 !== evidenceDigest || !Number.isInteger(e?.firstWord) || !Number.isInteger(e?.lastWord) || e.firstWord > e.lastWord || !first || !last) { fail('acoustic-reference', item.id); continue; }
    if (Math.abs(first.start - item.start) > 0.001 || Math.abs(last.end - item.end) > 0.001) fail('acoustic-boundary', item.id);
    if (e.unmatchedPrefix > 2 || e.unmatchedSuffix > 2 || item.risks?.length) fail('acoustic-risk', item.id);
  }
  return { ok: errors.length === 0, errors };
}
