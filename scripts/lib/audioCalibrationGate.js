import * as OpenCC from 'opencc-js';
const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });
const normalized = text => toSimplified(String(text ?? '').normalize('NFKC')).replace(/[^\p{L}\p{N}]/gu, '');
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
  if (candidate.humanListened !== false) fail('listening-claim');
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
  if (candidate.engine?.name !== 'faster-whisper' || candidate.engine?.revision !== evidence?.model || candidate.engine?.version !== evidence?.fasterWhisperVersion || candidate.audio?.duration !== evidence?.duration) fail('acoustic-engine');
  const words = (evidence?.segments ?? []).flatMap(s => s.words ?? []);
  if (!words.length || words.some((w,i) => typeof w.word !== 'string' || !w.word.trim() || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < 0 || w.end < w.start || w.end > evidence.duration || (i && w.start < words[i-1].start))) fail('acoustic-words');
  for (const item of candidate.items ?? []) {
    const e = item.evidence;
    const first = words[e?.firstWord], last = words[e?.lastWord];
    if (e?.artifactSha256 !== evidenceDigest || !Number.isInteger(e?.firstWord) || !Number.isInteger(e?.lastWord) || e.firstWord > e.lastWord || !first || !last) { fail('acoustic-reference', item.id); continue; }
    if (Math.abs(first.start - item.start) > 0.001 || Math.abs(last.end - item.end) > 0.001) fail('acoustic-boundary', item.id);
    if (![e.unmatchedPrefix,e.unmatchedSuffix,e.matchedCharacters,e.totalCharacters].every(n=>Number.isInteger(n)&&n>=0) || e.unmatchedPrefix > 2 || e.unmatchedSuffix > 2 || item.risks?.length) fail('acoustic-risk', item.id);
    const target=[...normalized(item.text)], acoustic=[...normalized(words.slice(e.firstWord,e.lastWord+1).map(w=>w.word).join(''))];
    if (!target.length || acoustic.length > target.length*3+20) { fail('acoustic-text',item.id); continue; }
    // Independent LCS replay of actual words; candidate coverage is not trusted.
    const dp=Array.from({length:target.length+1},()=>new Uint32Array(acoustic.length+1));
    for(let i=1;i<=target.length;i++) for(let j=1;j<=acoustic.length;j++) dp[i][j]=target[i-1]===acoustic[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
    let i=target.length,j=acoustic.length; const matched=[];
    while(i&&j) { if(target[i-1]===acoustic[j-1]) {matched.push(i-1);i--;j--;} else if(dp[i-1][j]>=dp[i][j-1]) i--; else j--; }
    matched.reverse();
    if (e.totalCharacters!==target.length || e.matchedCharacters>matched.length || matched.length/target.length<0.75 || !matched.length || matched[0]>2 || target.length-1-matched.at(-1)>2) fail('acoustic-text',item.id);
  }
  return { ok: errors.length === 0, errors };
}

export function auditAudioIdentity(candidate, identities, identityDigest) {
  const record = Array.isArray(identities) ? identities.find(r=>r.videoId===candidate.videoId) : null;
  const valid = HASH.test(identityDigest ?? '') && candidate.audio?.identityEvidenceSha256===identityDigest
    && record?.runtimeAudioSha256===candidate.audio?.sha256
    && HASH.test(record?.officialAudioSha256 ?? '')
    && record?.officialLinkPresentInVideoDescription===true
    && Number.isFinite(record?.youtubeDuration) && Math.abs(record.youtubeDuration-candidate.audio.duration)<1
    && Array.isArray(record?.checks) && record.checks.length>=5
    && record.checks.every(c=>Number.isFinite(c.seconds)&&Number.isFinite(c.lagSeconds)&&Number.isFinite(c.correlation)&&c.correlation>=0.9&&c.correlation<=1&&Math.abs(c.lagSeconds)<=0.1)
    && new Set(record.checks.map(c=>c.seconds)).size===record.checks.length
    && Math.max(...record.checks.map(c=>c.seconds))-Math.min(...record.checks.map(c=>c.seconds))>candidate.audio.duration*0.8;
  return {ok:!!valid,errors:valid?[]:[{code:'audio-identity-evidence'}]};
}
