#!/usr/bin/env node
import fs from 'node:fs';import{createHash}from'node:crypto';
import{auditAudioCalibration,auditAcousticEvidence,auditAudioIdentity}from'./lib/audioCalibrationGate.js';
const [alternativesPath,sourcePath,identityPath,outputPath]=process.argv.slice(2);
if(!outputPath)throw new Error('Usage: alternatives source identity output');
const hash=raw=>'sha256:'+createHash('sha256').update(raw).digest('hex');
const sourceRaw=fs.readFileSync(sourcePath),source=JSON.parse(sourceRaw),input=JSON.parse(fs.readFileSync(alternativesPath));
if(input.sourceDigest!==hash(sourceRaw))throw new Error('Stale source');
const originals=source.paragraphs.flatMap(p=>p.sentences),byId=new Map(originals.map(s=>[s.id,s]));
const identityRaw=fs.readFileSync(identityPath),identities=JSON.parse(identityRaw);
const validated=new Map(),checks={};
for(const[label,originalVariant]of Object.entries(input.variants)){
 const rootLabel=label.includes('second')?'second':'first';const artifact=input.artifacts[rootLabel];const raw=fs.readFileSync(artifact.path);
 if(hash(raw)!==artifact.sha256)throw new Error('Stale acoustic artifact');
 const evidence=JSON.parse(raw);const variant={...originalVariant,audio:input.variants.first.audio,items:[...originalVariant.items].sort((a,b)=>(a.start??Infinity)-(b.start??Infinity))};
 if(new Set(variant.items.map(i=>i.id)).size!==variant.items.length||variant.items.some(i=>!byId.has(i.id)||byId.get(i.id).text!==i.text))throw new Error('Changed source sentence');
 const identity=auditAudioIdentity(variant,identities,hash(identityRaw));if(!identity.ok)throw new Error('Audio identity not verified');
 // Per-item replay in AUDIO order. This is not publication approval or reading-order validation.
 const subset={...source,paragraphs:[{sentences:variant.items.map(i=>byId.get(i.id))}]};
 const structure=auditAudioCalibration(subset,variant,hash(sourceRaw));const acoustic=auditAcousticEvidence(variant,evidence,hash(raw));
 const errors=[...structure.errors,...acoustic.errors];checks[label]={structure,acoustic};
 for(const item of variant.items){
  const reasons=[...new Set(errors.filter(e=>!e.id||e.id===item.id).map(e=>e.code))];
  const duration=item.end-item.start;
  if(item.evidence.totalCharacters>=12&&duration>item.evidence.totalCharacters*2+15)reasons.push('excessive-span');
  const choices=validated.get(item.id)||[];choices.push({variant:label,evidencePass:!reasons.length,errors:reasons,item});validated.set(item.id,choices);
 }
}
const rows=originals.map((source,index)=>{
 const choices=validated.get(source.id)||[];const find=label=>choices.find(c=>c.variant===label&&c.evidencePass);
 const first=find('first'),second=find('second'),localFirst=find('local-first'),localSecond=find('local-second');
 const disagree=(a,b)=>a&&b&&(Math.abs(a.item.start-b.item.start)>1.5||Math.abs(a.item.end-b.item.end)>1.5);
 let chosen=first||second||localFirst||localSecond;const reasons=[];
 if(disagree(first,second))reasons.push('cross-pass-boundary-disagreement');
 if(!first&&!second){if(!localFirst||!localSecond)reasons.push('single-local-hypothesis');if(disagree(localFirst,localSecond))reasons.push('local-boundary-disagreement');}
 if(!chosen)reasons.push('no-validated-boundary');
 const proposed=chosen||[...choices].sort((a,b)=>b.item.evidence.matchedCharacters/Math.max(1,b.item.evidence.totalCharacters)-a.item.evidence.matchedCharacters/Math.max(1,a.item.evidence.totalCharacters))[0];
 const pass=chosen&&!reasons.length;const text=source.text;
 const category=reasons.includes('cross-pass-boundary-disagreement')||reasons.includes('local-boundary-disagreement')?'boundary-disagreement':/^[（(]學員[：:]/.test(text)?'learner-short-answer':text.replace(/[^\p{L}\p{N}]/gu,'').length<8?'short-answer':choices.some(c=>c.errors.includes('evidence-boundary')||c.errors.includes('acoustic-boundary'))?'sentence-boundary':!chosen?'wording-or-missing-asr':'matched';
 return{id:source.id,displayIndex:index,text,oldStart:source.start,oldEnd:source.end,status:pass?'machine-evidence-ready':'needs-listening',start:pass?chosen.item.start:null,end:pass?chosen.item.end:null,selectedVariant:pass?chosen.variant:null,category,reasons,proposal:proposed?{variant:proposed.variant,start:proposed.item.start,end:proposed.item.end,evidence:proposed.item.evidence}:null,alternatives:choices.map(c=>({variant:c.variant,evidencePass:c.evidencePass,errors:c.errors,start:c.item.start,end:c.item.end,evidence:c.item.evidence}))};
});
const timeline=rows.filter(r=>r.status==='machine-evidence-ready').sort((a,b)=>a.start-b.start||a.displayIndex-b.displayIndex);
for(let i=1;i<timeline.length;i++)if(timeline[i].start<timeline[i-1].end-0.12){for(const r of [timeline[i-1],timeline[i]]){r.status='needs-listening';r.category='overlapping-boundaries';r.reasons.push('overlapping-sentence-boundaries');}}
for(let i=1;i<rows.length;i++)if(rows[i].start!==null&&rows[i-1].start!==null&&rows[i].start<rows[i-1].start){rows[i].orderConflictWith=rows[i-1].id;rows[i-1].orderConflictWith=rows[i].id;rows[i].category=rows[i-1].category='reading-audio-order';}
for(const r of rows)if(r.status==='needs-listening'){r.start=null;r.end=null;r.selectedVariant=null;}
const output={schema:'sentence-calibration-review/v1',authority:'machine-review-candidate',humanListened:false,publicationAccepted:false,sourceDigest:hash(sourceRaw),alternativesDigest:hash(fs.readFileSync(alternativesPath)),session:input.session,videoId:source.youtubeVideoId,audio:input.variants.first.audio,summary:{total:rows.length,ready:rows.filter(r=>r.status==='machine-evidence-ready').length,pending:rows.filter(r=>r.status==='needs-listening').length},items:rows,perVariantChecks:checks};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({session:input.session,...output.summary}));
