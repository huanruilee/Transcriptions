import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build38A,render38A,markdown38A,text38A} from '../../scripts/session38a_faithful_reading.mjs';
import {validateContentOverview} from '../../scripts/content_overview_pipeline.mjs';
const dir='reviews/evidence/session38a-faithful/';
const bytes=fs.readFileSync(dir+'source-session.json'),source=JSON.parse(bytes);
const plan=JSON.parse(fs.readFileSync(dir+'plan.json'));
const digest=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
test('38A plan keeps every source object and flags partially corrected uncertainties',()=>{
 const result=build38A(bytes,plan),a=source.paragraphs.flatMap(p=>p.sentences),b=result.session.paragraphs.flatMap(p=>p.sentences);
 assert.equal(plan.sourceDigest,digest(bytes));assert.equal(b.length,657);assert.equal(result.session.paragraphs.length,329);
 for(const [i,s]of a.entries())for(const [key,value]of Object.entries(s))if(key!=='text'&&key!=='reviewNeeded'&&key!=='uncertainty')assert.deepEqual(b[i][key],value);
 for(const p of result.session.paragraphs)for(const [i,s]of p.sentences.entries()){
  const locator=`${p.id}:${i}`,original=source.paragraphs.find(x=>x.id===p.id).sentences[i];
  if(s.text!==original.text)assert.ok(result.ledger.some(e=>e.locator===locator));
  if(plan.pending.some(x=>x.locator===locator)){assert.equal(s.reviewNeeded,true);assert.ok(s.uncertainty);}
  assert.equal(result.verbatim.paragraphs[p.id][i].text,s.text);
 }
 assert.equal(result.session.paragraphs[117].sentences[0].text,source.paragraphs[117].sentences[0].text,'宗派分歧不可按教義改稿');
 assert.ok(result.session.paragraphs[117].sentences[0].reviewNeeded);
 assert.match(result.session.paragraphs[84].sentences[1].text,/如果有自性了，如果有自性的話/,'保留重複與自我修正');
 assert.doesNotMatch(result.session.paragraphs[287].heading,/迴向/);
 for(const p of result.session.paragraphs)for(const s of p.sentences)assert.doesNotMatch(s.text,/\[REVIEW:/);
});
test('38A final artifacts match the reviewed plan and disclose pending publication',()=>{
 const result=build38A(bytes,plan),base='courses/入中論善顯密意疏/';
 const published=JSON.parse(fs.readFileSync(base+'sessions/session_38A.json'));if(published.readingEdition==='study-guide'){const raw=published.paragraphs.flatMap(p=>p.verbatimSentences);assert.deepEqual(raw.map(r=>[r.text,r.start,r.end,!!r.reviewNeeded,r.uncertainty]),result.session.paragraphs.flatMap(p=>p.sentences).map(r=>[r.text,r.start,r.end,!!r.reviewNeeded,r.uncertainty]));}else assert.deepEqual(published,result.session);
 assert.deepEqual(JSON.parse(fs.readFileSync(base+'verbatim/verbatim_38A.json')),result.verbatim);
 assert.equal(fs.readFileSync(base+'publications/lecture_38A_quality_review.html','utf8'),render38A(result));
 assert.equal(fs.readFileSync(base+'publications/lecture_38A_verbatim_reading.md','utf8'),markdown38A(result));
 assert.equal(fs.readFileSync(base+'publications/lecture_38A_verbatim_reading.txt','utf8'),text38A(result));
 assert.deepEqual(validateContentOverview(result.session.contentOverview,result.session,{sourceTranscriptId:'ru-zhong-lun/session_38A'}).errors,[]);
 assert.equal(result.session.qualityReview.humanAudioAcceptance,false);
 assert.match(text38A(result),/待閱校版/);assert.match(text38A(result),/我們先休息一下吧/);
});
test('38A advisory binds actual audio and preserves anomalous raw ASR honestly',()=>{
 const audio=JSON.parse(fs.readFileSync(dir+'audio-source.json')),asrBytes=fs.readFileSync(dir+'full-asr.json'),asr=JSON.parse(asrBytes),advisory=JSON.parse(fs.readFileSync(dir+'audio-advisory.json'));
 assert.equal(audio.sourceSessionDigest,digest(bytes));assert.equal(advisory.asrDigest,digest(asrBytes));assert.equal(advisory.audioSha256,audio.sha256);
 assert.equal(advisory.totalBaselineSentences,657);assert.equal(advisory.items.length,657);assert.ok(asr.segments.length>0);
 for(const item of advisory.items){assert.equal(item.humanListened,false);assert.ok(item.asrSegmentIds.length>0);}
 const anomalous=asr.segments.filter(s=>s.end>audio.decodedDuration);
 assert.deepEqual(advisory.anomalies.filter(x=>x.reasons.includes('past-decoded-audio-end')).map(s=>s.end),anomalous.map(s=>s.end));
 assert.equal(audio.decodedDuration,audio.pcmBytes/32000);assert.ok(audio.decodedDuration>audio.headerDuration);
});
test('38A bounded tail excerpt fully decodes beyond the original MP3 header estimate',()=>{
 const base='courses/入中論善顯密意疏/publications/audio_38A_review/';
 const m=JSON.parse(fs.readFileSync(base+'manifest.json')),audio=JSON.parse(fs.readFileSync(dir+'audio-source.json')),clip=fs.readFileSync(base+m.filename);
 assert.equal(m.sha256,digest(clip));assert.equal(m.sourceSha256,audio.sha256);assert.equal(m.bytes,clip.length);
 assert.equal(m.sourceEnd,audio.decodedDuration);assert.ok(m.sourceEnd>audio.headerDuration);assert.ok(m.sourceEnd-m.sourceStart<45);
 assert.ok(clip.length<350000);assert.equal(m.humanListened,false);
 const pcm=spawnSync('ffmpeg',['-v','error','-i',base+m.filename,'-f','s16le','-ac','1','-ar','16000','pipe:1'],{maxBuffer:3*1024*1024});
 assert.equal(pcm.status,0,pcm.stderr?.toString());assert.ok(Math.abs(pcm.stdout.length/32000-(m.sourceEnd-m.sourceStart))<.002);
});
