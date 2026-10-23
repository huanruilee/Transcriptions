import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const workflow=fs.readFileSync('.github/workflows/acceptance.yml','utf8');
const match=workflow.match(/- name: Install acoustic verification tools\n        run: \|\n([\s\S]*?)(?=\n      - name:)/);
assert.ok(match,'Acoustic bootstrap step must remain present');
const shell=match[1].split('\n').map(l=>l.replace(/^          /,'')).join('\n');
const source='Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble noble-updates\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: https://security.ubuntu.com/ubuntu\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
function run(fail='',legacy=false,mirror=false){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ci-acoustic-bootstrap-'));
 try{
  const bin=path.join(temp,'bin');fs.mkdirSync(bin);
  const sources=path.join(temp,mirror?'apt-mirrors.txt':legacy?'sources.list':'ubuntu.sources'),log=path.join(temp,'commands.txt');
  fs.writeFileSync(sources,source);
  const stubs={sudo:'#!/bin/sh\nexec "$@"\n','apt-get':'#!/bin/sh\nprintf "%s\\n" "$*" >> "$TASK_APT_LOG"\nif [ -n "$TASK_APT_FAIL" ]; then case " $* " in *" $TASK_APT_FAIL "*) exit 42;; esac; fi\n',ffmpeg:'#!/bin/sh\necho "ffmpeg $*" >> "$TASK_APT_LOG"\n',ffprobe:'#!/bin/sh\necho "ffprobe $*" >> "$TASK_APT_LOG"\n'};
  for(const [name,text] of Object.entries(stubs))fs.writeFileSync(path.join(bin,name),text,{mode:0o755});
  const result=spawnSync('bash',['-e','-o','pipefail','-c',shell],{encoding:'utf8',env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,APT_SOURCES_DIR:temp,APT_SOURCES_FILE:legacy||mirror?'':sources,TASK_APT_LOG:log,TASK_APT_FAIL:fail}});
  return {status:result.status,stderr:result.stderr,sources:fs.readFileSync(sources,'utf8'),log:fs.existsSync(log)?fs.readFileSync(log,'utf8'):''};
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
test('hosted runner mirror-list indirection also replaces Azure',()=>{
 const r=run('',false,true);assert.equal(r.status,0,r.stderr);
 assert.ok(!r.sources.includes('azure.archive.ubuntu.com'));
});
test('legacy sources.list layout also replaces the Azure mirror',()=>{
 const r=run('',true);assert.equal(r.status,0,r.stderr);
 assert.ok(!r.sources.includes('azure.archive.ubuntu.com'));
});
test('CI acoustic bootstrap uses signed official HTTPS archive and bounded acquisition',()=>{
 const r=run();assert.equal(r.status,0,r.stderr);
 assert.equal(r.sources,source.replace('http://azure.archive.ubuntu.com/ubuntu','https://archive.ubuntu.com/ubuntu'));
 const apt=r.log.trim().split('\n').slice(0,2);
 for(const line of apt){assert.match(line,/Acquire::Retries=2/);assert.match(line,/Acquire::http::Timeout=20/);assert.match(line,/Acquire::https::Timeout=20/);}
 assert.match(r.log,/install --no-install-recommends -y ffmpeg/);
 assert.match(r.log,/ffmpeg -version\nffprobe -version/);
 assert.ok(!/allow-unauthenticated|trusted=yes|Verify-Peer=false|Verify-Host=false/.test(shell));
});
test('CI acquisition failures propagate without skipping decode verification',()=>{
 for(const fail of ['update','install']){const r=run(fail);assert.equal(r.status,42,r.stderr);assert.ok(!r.log.includes('ffmpeg -version'));}
 assert.ok(workflow.includes('run: npm test'));
});
