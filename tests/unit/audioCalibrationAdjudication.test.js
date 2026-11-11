import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root='reviews/evidence/shiliang-30-31-calibration';
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const run=(alternatives,source,output)=>spawnSync(process.execPath,['scripts/adjudicate_calibration_alternatives.mjs',alternatives,source,`${root}/audio-identity.json`,output],{encoding:'utf8'});
for(const sid of ['30','31'])test(`session ${sid}: replay alternatives without treating machine agreement as listening approval`,()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'calibration-adjudication-'));
 try{
 const alternatives=`${root}/adjudication/session_${sid}.alternatives.json`,source=`courses/釋量論第二品/sessions/session_${sid}.json`,output=path.join(temp,'result.json');
 const result=run(alternatives,source,output);assert.equal(result.status,0,result.stderr);
 const ledger=JSON.parse(fs.readFileSync(output));
 assert.equal(ledger.publicationAccepted,false);assert.equal(ledger.humanListened,false);
 assert.equal(ledger.sourceDigest,hash(fs.readFileSync(source)));
 const original=JSON.parse(fs.readFileSync(source)).paragraphs.flatMap(p=>p.sentences);
 assert.deepEqual(ledger.items.map(i=>[i.id,i.text]),original.map(i=>[i.id,i.text]));
 assert.ok(ledger.items.some(i=>i.status==='needs-listening'));
 for(const row of ledger.items){
  if(row.status==='needs-listening'){assert.equal(row.start,null);assert.equal(row.end,null);continue;}
  const first=row.alternatives.find(a=>a.variant==='first'&&a.evidencePass);
  if(first)assert.equal(row.selectedVariant,'first');
 }
 if(sid==='30'){
 const one=ledger.items.find(i=>i.id==='sent-101'),two=ledger.items.find(i=>i.id==='sent-102');
 assert.equal(one.start,953.26);assert.equal(two.start,948.16);
 assert.ok(one.displayIndex<two.displayIndex);assert.equal(one.orderConflictWith,two.id);
 }
 const changed=JSON.parse(fs.readFileSync(alternatives));changed.variants.first.items[0].text+='changed';const bad=path.join(temp,'bad.json');fs.writeFileSync(bad,JSON.stringify(changed));assert.notEqual(run(bad,source,output).status,0);
 const stale=JSON.parse(fs.readFileSync(alternatives));stale.artifacts.first.sha256='sha256:invalid';fs.writeFileSync(bad,JSON.stringify(stale));assert.notEqual(run(bad,source,output).status,0);
 const src=path.join(temp,'source.json');fs.writeFileSync(src,fs.readFileSync(source)+' ');assert.notEqual(run(alternatives,src,output).status,0);
 const derived=JSON.parse(fs.readFileSync(`${root}/second-pass/session_${sid}.second-pass.words.json`));assert.equal(derived.derivation.baseArtifactSha256,hash(fs.readFileSync(`${root}/first-pass/session_${sid}.words.json`)));assert.equal(derived.derivation.rescueArtifactSha256,hash(fs.readFileSync(`${root}/second-pass/session_${sid}.rescue.json`)));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
