import {evaluateTimingTolerance} from '../../scripts/lib/audioCalibrationTolerance.js';
async function sha(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return 'sha256:'+Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('')}
export async function applyTimingOverlay(reading,sourceText,publicationText,overlayText,expectedDigest){
 if(typeof expectedDigest!=='string'||expectedDigest!==await sha(overlayText))throw Error('Timing overlay digest mismatch');
 const overlay=JSON.parse(overlayText);
 const source=JSON.parse(sourceText),original=source.paragraphs.flatMap(p=>p.sentences),byId=new Map(original.map(s=>[s.id,s]));
 if(overlay.schema!=='partial-timing-overlay/v1'||overlay.sessionId!==source.sessionId||overlay.videoId!==source.youtubeVideoId||overlay.sourceDigest!==await sha(sourceText)||overlay.readingPublicationDigest!==await sha(publicationText)||overlay.humanListened!==false||overlay.policy?.humanListened!==false||overlay.policy?.toleranceSeconds!==0.5||overlay.policy?.approvedBy!=='Henry'||overlay.policy?.approvedAt!=='2026-10-25'||overlay.audio?.identityVerified!==true||!Number.isFinite(overlay.audio.videoOffsetSeconds)||!Array.isArray(overlay.items)||!overlay.items.length)throw Error('Invalid timing overlay');
 const changes=new Map();
 for(const row of overlay.items){
  const raw=byId.get(row.id);
  if(!raw||changes.has(row.id)||row.oldStart!==raw.start||row.oldEnd!==raw.end||row.humanListened!==false||Math.abs(row.start-(row.audioStart+overlay.audio.videoOffsetSeconds))>1e-8||Math.abs(row.end-(row.audioEnd+overlay.audio.videoOffsetSeconds))>1e-8||!evaluateTimingTolerance({reference:raw,candidate:row,evidencePass:true}).accepted)throw Error('Timing tolerance or source mismatch');
  changes.set(row.id,row);
 }
 const paragraphs=reading.paragraphs.map(p=>{const sentences=p.sentences.map(s=>changes.has(s.id)?{...s,start:changes.get(s.id).start,end:changes.get(s.id).end}:s);return {...p,sentences,start:sentences[0].start,end:sentences.at(-1).end}});
 return {...reading,paragraphs,qualityReview:{...reading.qualityReview,readerNotice:`正式重整版：已閱讀確認（Henry，2026-10-24），未逐句聽核。時間部分校準：${changes.size}／${original.length} 句已依 0.5 秒容差接受（2026-10-25），其餘沿用原時間、待校準。`}};
}
