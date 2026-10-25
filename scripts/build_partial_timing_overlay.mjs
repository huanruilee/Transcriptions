#!/usr/bin/env node
import fs from 'node:fs';import{createHash}from'node:crypto';
import {evaluateTimingTolerance}from'./lib/audioCalibrationTolerance.js';
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
for(const sid of ['30','31']){
 const root='courses/釋量論第二品/',source=fs.readFileSync(root+`sessions/session_${sid}.json`),publication=fs.readFileSync(root+`publications/lecture_${sid}_verbatim_rebuild.json`),ledgerRaw=fs.readFileSync(`reviews/evidence/shiliang-30-31-calibration/adjudication/session_${sid}.adjudication.json`),ledger=JSON.parse(ledgerRaw),original=JSON.parse(source);
 if(sha(source)!==ledger.sourceDigest||ledger.humanListened!==false)throw Error('Stale ledger');
 const items=[];
 for(const row of ledger.items){
  if(row.status!=='machine-evidence-ready')continue;
  const selected=row.alternatives.find(a=>a.variant===row.selectedVariant&&a.evidencePass);if(!selected)continue;
  const offset=ledger.audio.videoOffsetSeconds,candidate={start:row.start+offset,end:row.end+offset};
  if(!evaluateTimingTolerance({reference:{start:row.oldStart,end:row.oldEnd},candidate,evidencePass:true}).accepted)continue;
  items.push({id:row.id,oldStart:row.oldStart,oldEnd:row.oldEnd,...candidate,audioStart:row.start,audioEnd:row.end,selectedVariant:row.selectedVariant,humanListened:false});
 }
 const overlay={schema:'partial-timing-overlay/v1',sessionId:sid,videoId:original.youtubeVideoId,sourceDigest:sha(source),readingPublicationDigest:sha(publication),ledgerDigest:sha(ledgerRaw),audio:ledger.audio,policy:{toleranceSeconds:0.5,comparisons:['candidate-vs-original-video'],approvedBy:'Henry',approvedAt:'2026-10-25',authorization:'可以上線',humanListened:false},humanListened:false,items};
 const overlayRaw=JSON.stringify(overlay,null,2)+'\n';fs.writeFileSync(root+`publications/lecture_${sid}_timing_overlay.json`,overlayRaw);
 const coursePath=root+'course.json',course=JSON.parse(fs.readFileSync(coursePath));course.sessions.find(s=>s.sessionId===sid).audioCalibrationOverlayDigest=sha(overlayRaw);fs.writeFileSync(coursePath,JSON.stringify(course,null,2)+'\n');console.log(sid,items.length);
}
