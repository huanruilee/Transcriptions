import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateContentOverview} from '../../scripts/content_overview_pipeline.mjs';
const base = 'courses/入中論善顯密意疏/';
const md = fs.readFileSync(base+'publications/lecture_36A_study_guide.md','utf8');
test('36A preserves uncertainty and does not fabricate the next lecture', () => {
  assert.ok(!md.includes('最初六年苦行'));
  assert.ok(!md.includes('微細語義格西於下節課 36B 進一步補充'));
  assert.ok(!md.includes('會有非常精采的破斥'));
  assert.ok(md.includes('課堂推測') && md.includes('尚待核對'));
});
test('36A explains editorial timing and does not claim perfect verbatim accuracy', () => {
  assert.ok(md.includes('時間碼為段內估算'));
  assert.ok(!md.includes('100%逐字忠實'));
});
const read=f=>JSON.parse(fs.readFileSync(f));
const session=read(base+'sessions/session_36A.json');
const baseline=read('reviews/evidence/session36a-quality/baseline.json');
const invariant=read('reviews/evidence/session36a-quality/baseline-invariants.json');
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('36A retains every original verbatim object, ID, timing and root quotation',()=>{
  assert.equal(invariant.baseCommit,baseline.baseCommit);
  assert.equal(invariant.sourceFileDigest,baseline.files['sessions/session_36A.json']);
  assert.equal(invariant.markdownFileDigest,baseline.files['publications/lecture_36A_study_guide.md']);
  assert.equal(hash(session.paragraphs.map(p=>p.verbatimSentences)),invariant.verbatimObjectsDigest);
  const quotations=s=>[...s.matchAll(/「\*\*([\s\S]*?)\*\*」/g)].map(m=>m[1]);
  assert.equal(hash(quotations(md)),invariant.rootQuotationDigest);
  assert.equal(session.paragraphs.length,29);
});
test('36A reviewed overview has exact new-source evidence, including stance distinction',()=>{
  assert.deepEqual(validateContentOverview(session.contentOverview,session,{sourceTranscriptId:'ru-zhong-lun/session_36A'}).errors,[]);
  assert.equal(session.contentOverview.status,'ai-reviewed');
  const item=session.contentOverview.referenceViews.find(x=>x.text.includes('別派') || x.text.includes('其他教派'));
  assert.ok(item && item.text.includes('批評'));
  assert.ok(item.evidence.some(e=>e.sentenceId==='p29-s4'));
});
test('36A acoustic report is baseline-bound and does not certify human listening',()=>{
  const audit=read('reviews/evidence/session36a-quality/audio-alignment.json');
  assert.equal(audit.sourceFileDigest,baseline.files['sessions/session_36A.json']);
  assert.equal(audit.totalVerbatim,176);
  assert.equal(audit.items.length,176);
  assert.ok(audit.items.every(x=>x.humanListened===false));
  const asr=fs.readFileSync('reviews/evidence/session36a-quality/full-asr.json');
  assert.equal(audit.asrDigest,'sha256:'+createHash('sha256').update(asr).digest('hex'));
  const decoded=JSON.parse(asr);
  assert.equal(decoded.sourceSha256,audit.audioSha256);
  assert.ok(decoded.segments.every((x,i)=>x.end<=audit.duration && x.start>=0 && x.end>=x.start
    && (!i || x.start>=decoded.segments[i-1].start)));
  assert.deepEqual(audit.items.map(x=>({id:x.id,text:x.publishedText,start:x.start,end:x.end})),
    session.paragraphs.flatMap(p=>p.verbatimSentences).map(s=>({id:s.id,text:s.text,start:s.start,end:s.end})));
});
test('36A reader-facing HTML includes every selected listening item and honest labels',()=>{
  const audit=read('reviews/evidence/session36a-quality/audio-alignment.json');
  const portal=fs.readFileSync(base+'publications/lecture_36A_quality_review.html','utf8');
  const wanted=audit.items.filter(x=>x.status==='listening-review-required' || audit.representativeSampleIds.includes(x.id));
  assert.equal([...portal.matchAll(/data-review-id=/g)].length,wanted.length);
  for(const s of wanted)assert.ok(portal.includes(`data-review-id="${s.id}"`));
  const clips=read(base+'publications/audio_36A_review/manifest.json');
  for(const s of wanted){
    const c=clips.clips[s.id];
    assert.ok(portal.includes(`data-clip="audio_36A_review/${c.filename}" data-start="${c.entryClipStart}" data-end="${c.entryClipEnd}"`));
  }
  assert.ok(portal.includes('30段轉碼節錄'));
  const html=fs.readFileSync(base+'publications/lecture_36A_study_guide.html','utf8');
  assert.ok(html.includes('時間碼為段內估算') && html.includes('尚待人工聽核'));
  assert.ok(!html.includes('逐字忠實原話'));
  assert.equal(session.qualityReview.humanAudioAcceptance,false);
});
