import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import{spawnSync}from'node:child_process';
test('listening package rejects changed reading text and mismatched source before displaying approval',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'calibration-reading-'));
 const source='courses/釋量論第二品/sessions/session_30.json',publication='courses/釋量論第二品/publications/lecture_30_verbatim_rebuild.json';
 const run=(s,p)=>spawnSync(process.execPath,['scripts/validate_calibration_reading.mjs',s,p],{encoding:'utf8'});
 try{
 assert.equal(run(source,publication).status,0);
 const changed=JSON.parse(fs.readFileSync(publication));changed.sections[0].sentences[0].text+='未經核定改字';const bad=path.join(temp,'publication.json');fs.writeFileSync(bad,JSON.stringify(changed));assert.notEqual(run(source,bad).status,0);
 const badsource=path.join(temp,'source.json');fs.writeFileSync(badsource,fs.readFileSync(source)+' ');assert.notEqual(run(badsource,publication).status,0);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
