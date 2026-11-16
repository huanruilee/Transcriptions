import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {build38A,render38A,markdown38A,text38A} from './session38a_faithful_reading.mjs';
import {validateContentOverview} from './content_overview_pipeline.mjs';
const root=path.resolve(import.meta.dirname,'..'),course=path.join(root,'courses/入中論善顯密意疏'),dir=path.join(root,'reviews/evidence/session38a-faithful');
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f));
const plan=read(path.join(dir,'plan.json'));
const source=fs.readFileSync(path.join(dir,'source-session.json'));
const clipFile=path.join(course,'publications/audio_38A_review/tail.mp3'),clip=fs.readFileSync(clipFile),audio=read(path.join(dir,'audio-source.json'));
plan.tailClip={url:'audio_38A_review/tail.mp3',sourceStart:4460,sourceEnd:audio.decodedDuration};
const result=build38A(source,plan);
const validation=validateContentOverview(result.session.contentOverview,result.session,{sourceTranscriptId:'ru-zhong-lun/session_38A'});
if(validation.errors.length||result.session.contentOverview.status!=='ai-reviewed')throw Error('Overview not valid: '+JSON.stringify(validation.errors));
const current=fs.readFileSync(path.join(course,'sessions/session_38A.json'));
if(hash(current)!==plan.sourceDigest&&JSON.stringify(JSON.parse(current))!==JSON.stringify(result.session))throw Error('Published source diverged; do not overwrite');
const manifest={schema:'bounded-audio-excerpt/v1',sessionId:'38A',purpose:'末段原音檔頭時長不足以跳播；只提供末段31.70秒覆核，不提供整檔',sourceUrl:audio.url,sourceSha256:audio.sha256,sourceReferenceDigest:hash(fs.readFileSync(path.join(dir,'audio-source.json'))),sourceStart:4460,sourceEnd:audio.decodedDuration,sourceDuration:audio.decodedDuration,filename:'tail.mp3',bytes:clip.length,sha256:hash(clip),clipDuration:Number(JSON.parse(execFileSync('ffprobe',['-v','quiet','-show_format','-of','json',clipFile],{encoding:'utf8'})).format.duration),ffmpegCommand:'ffmpeg -v error -i <official-source> -ss 4460 -t 31.7028125 -ac 1 -ar 44100 -codec:a libmp3lame -b:a 64k -write_xing 1 <tail.mp3>',humanListened:false};
const files=new Map([
 [path.join(course,'sessions/session_38A.json'),JSON.stringify(result.session,null,2)+'\n'],
 [path.join(course,'verbatim/verbatim_38A.json'),JSON.stringify(result.verbatim,null,2)+'\n'],
 [path.join(course,'publications/lecture_38A_quality_review.html'),render38A(result)],
 [path.join(course,'publications/lecture_38A_verbatim_reading.md'),markdown38A(result)],
 [path.join(course,'publications/lecture_38A_verbatim_reading.txt'),text38A(result)],
 [path.join(course,'publications/audio_38A_review/manifest.json'),JSON.stringify(manifest,null,2)+'\n'],
 [path.join(dir,'ledger.json'),JSON.stringify({schema:'session38a-local-edits/v1',sourceDigest:plan.sourceDigest,entries:result.ledger,humanListened:false},null,2)+'\n'],
 [path.join(dir,'plan.json'),JSON.stringify(plan,null,2)+'\n'],
]);
for(const [file,text]of files){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
const coursePath=path.join(course,'course.json'),catalog=read(coursePath),item=catalog.sessions.find(s=>s.sessionId==='38A');
if(!item)throw Error('38A missing from course');
item.transcriptStatus='review-ready';
fs.writeFileSync(coursePath,JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({paragraphs:result.session.paragraphs.length,sentences:Object.values(result.verbatim.paragraphs).flat().length,localEditProposals:plan.corrections.length,ledgerOccurrences:result.ledger.length,changedSentences:new Set(result.ledger.filter(e=>!e.locator.endsWith(':heading')).map(e=>e.locator)).size,pending:plan.pending.length,tailBytes:clip.length}));
