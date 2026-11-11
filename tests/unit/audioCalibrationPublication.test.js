import{createHash}from'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{spawnSync}from'node:child_process';import os from'node:os';import path from'node:path';
const root='reviews/evidence/shiliang-30-31-calibration';
for(const sid of ['30','31'])test(`published session ${sid} timings replay the ledger and preserve exact acoustic bounds`,()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'timing-publish-'));
 try{
 const output=path.join(tmp,'ledger.json'),r=spawnSync(process.execPath,['scripts/adjudicate_calibration_alternatives.mjs',`${root}/adjudication/session_${sid}.alternatives.json`,`courses/釋量論第二品/sessions/session_${sid}.json`,`${root}/audio-identity.json`,output],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const ledger=JSON.parse(fs.readFileSync(output));assert.deepEqual(ledger,JSON.parse(fs.readFileSync(`${root}/adjudication/session_${sid}.adjudication.json`)));
 const overlay=JSON.parse(fs.readFileSync(`courses/釋量論第二品/publications/lecture_${sid}_timing_overlay.json`));const course=JSON.parse(fs.readFileSync('courses/釋量論第二品/course.json'));assert.equal(course.sessions.find(s=>s.sessionId===sid).audioCalibrationOverlayDigest,'sha256:'+createHash('sha256').update(fs.readFileSync(`courses/釋量論第二品/publications/lecture_${sid}_timing_overlay.json`)).digest('hex'));assert.deepEqual(overlay.policy.comparisons,['candidate-vs-original-video']);assert.equal(overlay.humanListened,false);assert.equal(overlay.policy.toleranceSeconds,0.5);
 for(const row of overlay.items){const approved=ledger.items.find(r=>r.id===row.id);assert.equal(approved.status,'machine-evidence-ready');assert.equal(row.audioStart,approved.start);assert.equal(row.audioEnd,approved.end);assert.ok(Math.max(Math.abs(row.start-row.oldStart),Math.abs(row.end-row.oldEnd))<=0.5);}
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
