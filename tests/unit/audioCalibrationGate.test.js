import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditAudioCalibration } from '../../scripts/lib/audioCalibrationGate.js';

const source = { youtubeVideoId: 'video', paragraphs: [{ sentences: [{ id: 's1', text: '這是一段需要真實音訊對齊的測試句子', start: 10, end: 10.5 }] }] };
const make = () => ({ schema: 'audio-calibration/v1', sourceDigest: 'sha256:source', videoId: 'video', audio: { sha256: `sha256:${'a'.repeat(64)}`, duration: 30, videoOffsetSeconds: 0, identityVerified: true }, engine: { name: 'faster-whisper', revision: 'fixed', version: '1' }, humanListened: false, items: [{ id: 's1', text: source.paragraphs[0].sentences[0].text, start: 10, end: 17, status: 'aligned', evidence: { start: 10, end: 17, matchedCharacters: 18, totalCharacters: 18, artifactSha256: `sha256:${'b'.repeat(64)}` } }] });
const audit = c => auditAudioCalibration(source, c, 'sha256:source');
test('accepts evidence-bound full sentence coverage without claiming human listening', () => assert.equal(audit(make()).ok, true));
test('rejects mechanically monotonic but compressed long sentence', () => { const c=make(); c.items[0].end=10.5; c.items[0].evidence.end=10.5; assert.ok(audit(c).errors.some(e=>e.code==='implausible-duration')); });
for (const [name, mutate, code] of [
  ['stale source', c=>c.sourceDigest='old', 'source-mismatch'],
  ['wrong video', c=>c.videoId='other', 'video-mismatch'],
  ['unverified audio origin', c=>c.audio.identityVerified=false, 'audio-identity'],
  ['missing audio hash', c=>delete c.audio.sha256, 'audio-identity'],
  ['missing sentence', c=>c.items=[], 'coverage'],
  ['changed approved text', c=>c.items[0].text='改寫', 'text-mismatch'],
  ['unresolved alignment', c=>c.items[0].status='review', 'unresolved'],
  ['timestamp outside acoustic evidence', c=>c.items[0].start=9, 'evidence-boundary'],
  ['weak acoustic match', c=>c.items[0].evidence.matchedCharacters=3, 'weak-match'],
  ['missing evidence digest', c=>delete c.items[0].evidence.artifactSha256, 'evidence-missing'],
  ['beyond audio end', c=>c.items[0].end=31, 'invalid-time'],
]) test(`rejects ${name}`, ()=>{ const c=make(); mutate(c); assert.ok(audit(c).errors.some(e=>e.code===code)); });
test('legacy 30/31 cannot be called calibrated just because timestamps are monotonic', () => {
  for (const id of [30,31]) {
    const s=JSON.parse(readFileSync(`courses/釋量論第二品/sessions/session_${id}.json`));
    const result=auditAudioCalibration(s, null, 'legacy');
    assert.equal(result.ok,false);
    assert.ok(result.suspicious.length>0, `session ${id} must expose compressed long sentences`);
  }
});

test('replays boundaries from actual acoustic words rather than trusting declared evidence', async () => {
  const { auditAcousticEvidence } = await import('../../scripts/lib/audioCalibrationGate.js');
  const c=make(); Object.assign(c.items[0].evidence,{firstWord:0,lastWord:1,unmatchedPrefix:0,unmatchedSuffix:0});
  const evidence={audioSha256:c.audio.sha256,wordTimestamps:true,duration:30,model:'fixed',fasterWhisperVersion:'1',segments:[{words:[{word:'這是一段需要真實',start:10,end:12},{word:'音訊對齊的測試句子',start:12,end:17}]}]};
  c.items[0].evidence.totalCharacters=17;c.items[0].evidence.matchedCharacters=17;
  const sha=c.items[0].evidence.artifactSha256;
  assert.equal(auditAcousticEvidence(c,evidence,sha).ok,true);
  c.items[0].start=9; c.items[0].evidence.start=9;
  assert.ok(auditAcousticEvidence(c,evidence,sha).errors.some(e=>e.code==='acoustic-boundary'));
  assert.ok(auditAcousticEvidence(c,evidence,`sha256:${'c'.repeat(64)}`).errors.some(e=>e.code==='acoustic-reference'));
  evidence.audioSha256='wrong';
  assert.ok(auditAcousticEvidence(c,evidence,sha).errors.some(e=>e.code==='acoustic-identity'));
});

test('rejects forged coverage even when hashed acoustic words have matching timestamps', async()=>{
  const {auditAcousticEvidence}=await import('../../scripts/lib/audioCalibrationGate.js');
  const c=make();Object.assign(c.items[0].evidence,{firstWord:0,lastWord:1,unmatchedPrefix:0,unmatchedSuffix:0});
  const e={audioSha256:c.audio.sha256,wordTimestamps:true,duration:30,model:'fixed',fasterWhisperVersion:'1',segments:[{words:[{word:'完全無關內容',start:10,end:12},{word:'沒有對應正文',start:12,end:17}]}]};
  assert.equal(auditAcousticEvidence(c,e,c.items[0].evidence.artifactSha256).ok,false);
  e.segments[0].words=[{}];c.items[0].evidence.lastWord=0;
  assert.equal(auditAcousticEvidence(c,e,c.items[0].evidence.artifactSha256).ok,false);
});

test('rejects identity boolean unless bound to matching full-span audio evidence',async()=>{
  const {auditAudioIdentity}=await import('../../scripts/lib/audioCalibrationGate.js');
  const c=make(), sha=`sha256:${'d'.repeat(64)}`; c.audio.duration=60;
  const records=[{videoId:'video',runtimeAudioSha256:c.audio.sha256,officialAudioSha256:sha,officialLinkPresentInVideoDescription:true,youtubeDuration:60,checks:[1,15,30,45,52].map(seconds=>({seconds,lagSeconds:0,correlation:.99}))}];
  assert.equal(auditAudioIdentity(c,records,sha).ok,false);
  c.audio.identityEvidenceSha256=sha;
  assert.equal(auditAudioIdentity(c,records,sha).ok,true);
  c.audio.videoOffsetSeconds=20;assert.equal(auditAudioIdentity(c,records,sha).ok,false);c.audio.videoOffsetSeconds=0;
  const realChecks=records[0].checks;records[0].checks=[-500,-400,-300,-200,-100].map(seconds=>({seconds,lagSeconds:0,correlation:1}));assert.equal(auditAudioIdentity(c,records,sha).ok,false);records[0].checks=realChecks;
  records[0].runtimeAudioSha256='wrong';
  assert.equal(auditAudioIdentity(c,records,sha).ok,false);
});
test('rejects wrong model declarations and unsupported human listening claims',async()=>{
  const {auditAcousticEvidence}=await import('../../scripts/lib/audioCalibrationGate.js');
  const c=make();c.humanListened=true;
  assert.ok(audit(c).errors.some(e=>e.code==='listening-claim'));
  assert.ok(auditAcousticEvidence(c,{audioSha256:c.audio.sha256,wordTimestamps:true,model:'different',duration:30,segments:[]},c.items[0].evidence.artifactSha256).errors.some(e=>e.code==='acoustic-engine'));
});

test('rejects unrelated surrounding words used to hide compressed true speech',async()=>{
  const {auditAcousticEvidence}=await import('../../scripts/lib/audioCalibrationGate.js');
  const c=make(); c.audio.duration=130; c.items[0].end=117;
  Object.assign(c.items[0].evidence,{firstWord:0,lastWord:2,end:117,totalCharacters:17,matchedCharacters:17,unmatchedPrefix:0,unmatchedSuffix:0});
  const e={audioSha256:c.audio.sha256,wordTimestamps:true,duration:130,model:'fixed',fasterWhisperVersion:'1',segments:[{words:[{word:'無關前文',start:10,end:12},{word:c.items[0].text,start:100,end:100.5},{word:'無關後文',start:115,end:117}]}]};
  assert.equal(audit(c).ok,true);
  assert.equal(auditAcousticEvidence(c,e,c.items[0].evidence.artifactSha256).ok,false);
});

test('rejects two repeated sentences claiming the same acoustic occurrence',async()=>{
  const {auditAcousticEvidence}=await import('../../scripts/lib/audioCalibrationGate.js');
  const c=make();Object.assign(c.items[0].evidence,{firstWord:0,lastWord:0,totalCharacters:17,matchedCharacters:17,unmatchedPrefix:0,unmatchedSuffix:0});
  c.items.push({...structuredClone(c.items[0]),id:'s2'});
  const e={audioSha256:c.audio.sha256,wordTimestamps:true,duration:30,model:'fixed',fasterWhisperVersion:'1',segments:[{words:[{word:c.items[0].text,start:10,end:17}]}]};
  assert.equal(auditAcousticEvidence(c,e,c.items[0].evidence.artifactSha256).ok,false);
});
