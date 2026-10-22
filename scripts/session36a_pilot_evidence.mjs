#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'reviews/evidence/session36a-quality');
const tmp = path.join(root, 'tmp/session36a-quality');
fs.mkdirSync(dir, {recursive:true}); fs.mkdirSync(tmp, {recursive:true});
const course = path.join(root,'courses/入中論善顯密意疏');
const read = f => JSON.parse(fs.readFileSync(f));
const hash = b => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const save = (f,x) => fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');
const transcript = read(path.join(course,'sessions/session_36A.json'));
const baselineFile=path.join(dir,'baseline.json');
if (!fs.existsSync(baselineFile)) {
  const files = ['sessions/session_36A.json','sessions/session_36B.json','verbatim/verbatim_36A.json','publications/lecture_36A_study_guide.md','publications/lecture_36A_study_guide.html','source_outlines/36A.json','toc.json',...[104,111,112,113,114].map(p=>`source_text/page_${p}.txt`)];
  save(baselineFile,{schema:'session36a-pilot-baseline/v1',baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),recordedAt:new Date().toISOString(),files:Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync(path.join(course,f)))])),counts:{paragraphs:transcript.paragraphs.length,lecture:transcript.paragraphs.flatMap(p=>p.sentences).length,verbatim:transcript.paragraphs.flatMap(p=>p.verbatimSentences||[]).length},originalOverview:transcript.contentOverview,scope:'36A only; no full-corpus promotion'});
}
if(process.argv.includes('--baseline')) {console.log('baseline recorded');process.exit(0);}
if(process.argv.includes('--decoded-duration')) {
  const audio=path.join(tmp,'source_36A.mp3');
  const sourceFile=path.join(dir,'audio-source.json');
  const source=read(sourceFile);
  if(hash(fs.readFileSync(audio))!==source.sha256)throw Error('Audio changed');
  const child=spawn('ffmpeg',['-v','error','-i',audio,'-f','s16le','-ac','1','-ar','16000','pipe:1']);
  let count=0,stderr='';child.stdout.on('data',b=>count+=b.length);child.stderr.on('data',b=>stderr+=b);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  if(code!==0 || !count || count%2)throw Error(`PCM decode failed: ${stderr}`);
  source.containerDuration=source.probe.format.duration;
  source.duration=count/32000;
  source.durationEvidence={method:'full ffmpeg decode to mono 16000Hz signed 16-bit PCM; count bytes / 32000',pcmBytes:count,sampleRate:16000,channels:1,bytesPerSample:2,stderr,reason:'MP3 header estimate differs from full decoded audio; no change to source bytes or transcript time anchors'};
  save(sourceFile,source);console.log(JSON.stringify({duration:source.duration,headerEstimate:source.containerDuration,pcmBytes:count}));process.exit(0);
}
const qwen='http://127.0.0.1:18036/v1';
const whisper='http://127.0.0.1:18037';
const models=await (await fetch(`${qwen}/models`)).json();
const health=await(await fetch(`${whisper}/health`)).json();
save(path.join(dir,'runtime.json'),{recordedAt:new Date().toISOString(),models,whisper:health});
if(process.argv.includes('--audio')){
  const cached='/Users/henry/Documents/huanruilee-github-repos/Transcriptions/tmp/pipeline_v2/36A/runtime-validation/source_36A.mp3';
  const audio=path.join(tmp,'source_36A.mp3');
  if(!fs.existsSync(audio))fs.copyFileSync(cached,audio);
  const bytes=fs.readFileSync(audio);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','quiet','-show_format','-show_streams','-of','json',audio],{encoding:'utf8'}));
  save(path.join(dir,'audio-source.json'),{schema:'audio-source/v1',url:transcript.audioUrl,acquisition:'reused exact prior official-source download; not a fresh download',sha256:hash(bytes),bytes:bytes.length,duration:Number(probe.format.duration),probe});
  const out=path.join(dir,'full-asr.json');
  if(!fs.existsSync(out)){
    const form=new FormData();form.append('file',new Blob([bytes],{type:'audio/mpeg'}),'36A.mp3');
    form.append('model','large-v3-turbo');form.append('language','zh');form.append('response_format','verbose_json');
    const res=await fetch(`${whisper}/v1/audio/transcriptions`,{method:'POST',body:form,signal:AbortSignal.timeout(600000)});
    if(!res.ok)throw Error(`ASR HTTP ${res.status}`);
    const result=await res.json();if(!result.segments?.length)throw Error('empty ASR');
    save(out,{schema:'audio-asr-evidence/v1',sourceSha256:hash(bytes),runtime:health,createdAt:new Date().toISOString(),...result});
  }
  console.log('full audio ASR evidence ready');
}
if(process.argv.includes('--review')){
  const sources=[104,111,112,113,114].map(p=>({page:p,text:fs.readFileSync(path.join(course,`source_text/page_${p}.txt`),'utf8')}));
  for(let offset=0;offset<transcript.paragraphs.length;offset+=4){
    const file=path.join(dir,`qwen-content-${offset}.json`);
    const paragraphs=transcript.paragraphs.slice(offset,offset+4);
    const input={sources,paragraphs:paragraphs.map(p=>({id:p.id,heading:p.heading,lecture:p.sentences.map(s=>({id:s.id,text:s.text})),verbatim:p.verbatimSentences.map(s=>({id:s.id,text:s.text}))}))};
    if(fs.existsSync(file)){
      const old=read(file);
      if(old.inputDigest!==hash(JSON.stringify(input)))throw Error(`Stale review ${file}; retain baseline evidence and create a separately named review run`);
      continue;
    }
    const res=await fetch(`${qwen}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'Qwen3.8-27B',temperature:0,max_tokens:4500,chat_template_kwargs:{enable_thinking:false},messages:[{role:'system',content:'你是佛典講記內容稽核員。逐段比對講記、課堂原話及底本；不把原話當已聽核音訊。只回JSON {paragraphs:[{id,verdict:"supported|needs-review",findings:[{sentenceId,kind:"unsupported-addition|omission|stance|root-quote|uncertain",detail:"60字內",evidenceIds:["原話ID"],suggestion:"保守修法或保留疑點"}]}]}。每輸入段恰好一筆，不列單純修辭差異。注意引述他宗批評不能當自宗；整理講記可凝練但不能加入原話沒有的實質觀點。底本只證明字句，不證明錄音有讀。'}, {role:'user',content:JSON.stringify(input)}]}),signal:AbortSignal.timeout(300000)});
    if(!res.ok)throw Error(`Qwen HTTP ${res.status}`);
    const response=await res.json();const raw=response.choices?.[0]?.message?.content;
    const review=JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
    const ids=review.paragraphs?.map(p=>p.id);
    if(ids?.length!==paragraphs.length || new Set(ids).size!==ids.length || paragraphs.some(p=>!ids.includes(p.id)))throw Error('review coverage mismatch');
    save(file,{schema:'qwen-paragraph-review/v1',model:response.model,inputDigest:hash(JSON.stringify(input)),sourceFileDigest:hash(fs.readFileSync(path.join(course,'sessions/session_36A.json'))),review,usage:response.usage,createdAt:new Date().toISOString()});
    console.log(`reviewed ${offset+paragraphs.length}/${transcript.paragraphs.length}`);
  }
}
