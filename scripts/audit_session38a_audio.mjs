import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dir=path.resolve(import.meta.dirname,'../reviews/evidence/session38a-faithful');
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f)));
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const audio=read('audio-source.json'),source=read('source-session.json');
const rawBytes=fs.readFileSync(path.join(dir,'full-asr.json')),asr=JSON.parse(rawBytes);
if(source.sessionId!=='38A'||!asr.segments?.length)throw Error('Missing source or ASR');
const segments=asr.segments;
const anomalies=segments.flatMap((s,i)=>{
 const reasons=[];
 if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<s.start)reasons.push('invalid-boundary');
 if(s.end>audio.decodedDuration)reasons.push('past-decoded-audio-end');
 if(i&&s.start<segments[i-1].start)reasons.push('start-regression');
 return reasons.length?[{index:i,start:s.start,end:s.end,text:s.text,reasons}]:[];
});
const items=source.paragraphs.flatMap(p=>p.sentences.map((s,i)=>{
 const overlapping=segments.filter(a=>a.start<s.end&&a.end>s.start);
 return {locator:`${p.id}:${i}`,start:s.start,end:s.end,baselineText:s.text,asrSegmentIds:overlapping.map(a=>a.id),asrText:overlapping.map(a=>a.text).join(''),status:overlapping.length?'asr-evidence-only':'no-overlapping-asr',humanListened:false};
}));
const report={schema:'session38a-acoustic-advisory/v1',sourceSessionDigest:audio.sourceSessionDigest,audioSha256:audio.sha256,asrDigest:hash(rawBytes),runtime:read('whisper-runtime.json'),recordedAt:new Date().toISOString(),decodedDuration:audio.decodedDuration,asrDuration:asr.duration,totalAsrSegments:segments.length,totalBaselineSentences:items.length,withOverlappingAsr:items.filter(i=>i.asrSegmentIds.length).length,anomalies,items,limitations:'單一 large-v3-turbo 再辨識；重疊區間僅為輔助，不是詞級對齊或人工聽核。ASR 原始簡體與越界時間保留證據，不直接發布或裁切成假時間。沒有人工真值，因此不計 CER 改善。'};
fs.writeFileSync(path.join(dir,'audio-advisory.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:items.length,withAsr:report.withOverlappingAsr,segments:segments.length,anomalies:anomalies.length}));
