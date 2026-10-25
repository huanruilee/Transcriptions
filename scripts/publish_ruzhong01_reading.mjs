#!/usr/bin/env node
import fs from 'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import {auditAcousticEvidence}from'./lib/audioCalibrationGate.js';
import {computeSourceDigest,hydrateEvidenceQuotes,validateContentOverview}from'./content_overview_pipeline.mjs';
const hash=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const clone=x=>structuredClone(x),fail=m=>{throw Error(m)};
const fmt=t=>String(t).replace(/[ \t]+/g,'，').replace(/，([，。！？；：、])/g,'$1').replace(/([，。！？；：、])，/g,'$1');
export function buildReading(sourceText,plan,acousticText){
 if(hash(sourceText)!==plan.sourceDigest||hash(acousticText)!==plan.acousticDigest||plan.schema!=='ruzhong01-local-reading-plan/v1'||plan.humanListened!==false)fail('Stale source or acoustic evidence');
 const source=JSON.parse(sourceText),audio=JSON.parse(acousticText);if(source.sessionId!=='01'||audio.audioSha256!==plan.audioSha256)fail('Wrong session/audio');
 const session=clone(source),lookup=new Map();session.paragraphs.forEach((p,pi)=>p.sentences.forEach((s,si)=>lookup.set(`p${pi+1}-s${si+1}`,{s,raw:clone(s)})));
 const occupied=new Map(),edits=new Map();
 for(const e of plan.corrections){
  const entry=lookup.get(e.id);if(!entry||typeof e.from!=='string'||!e.from.length||e.from.length>12||typeof e.to!=='string'||!e.to.length||e.to.length>14||!e.reason||!e.referenceId||e.reviewedBy!=='Codex'||e.humanListened!==false)fail('Invalid local edit');
  const text=entry.raw.text,positions=[];let i=text.indexOf(e.from);while(i>=0){positions.push(i);i=text.indexOf(e.from,i+e.from.length)}
  if(positions.length!==e.count||!e.count)fail('Edit occurrence mismatch');
  const prior=occupied.get(e.id)||[];
  for(const start of positions){const end=start+e.from.length;if(prior.some(r=>start<r.end&&r.start<end))fail('Overlapping source edits');prior.push({start,end,to:e.to});}
  occupied.set(e.id,prior);edits.set(e.id,[...(edits.get(e.id)||[]),e]);
 }
 for(const[id,spans]of occupied){const entry=lookup.get(id);let t=entry.raw.text;for(const e of spans.sort((a,b)=>b.start-a.start))t=t.slice(0,e.start)+e.to+t.slice(e.end);entry.s.text=t;}
 const pending=new Map();for(const p of plan.pending){if(!lookup.has(p.id)||!p.reason||pending.has(p.id))fail('Invalid pending source');pending.set(p.id,[p.reason]);}
 const timingById=new Map(plan.timings.map(t=>[t.id,t]));if(plan.timings.length!==lookup.size||timingById.size!==lookup.size||[...lookup.keys()].some(id=>!timingById.has(id)))fail('Timing coverage');
 const engine={name:'faster-whisper',revision:audio.model,version:audio.fasterWhisperVersion};
 const candidates=[...lookup].filter(([id])=>!timingById.get(id).risks.length&&!pending.has(id)).map(([id,{s,raw}])=>({...timingById.get(id),text:s.text}));
 const acoustic=auditAcousticEvidence({audio:{sha256:audio.audioSha256,duration:audio.duration},engine,items:candidates},audio,plan.acousticDigest);
 const global=acoustic.errors.filter(e=>!e.id);if(global.length)fail('Invalid full acoustic artifact: '+JSON.stringify(global));
 const invalid=new Set(acoustic.errors.map(e=>e.id));let previousEnd=-Infinity;const applied=new Set();
 for(const item of candidates){const raw=lookup.get(item.id).raw;
  if(invalid.has(item.id)||!Number.isFinite(item.start)||!Number.isFinite(item.end)||item.start<0||item.end<=item.start||item.end>audio.duration||Math.max(Math.abs(item.start-raw.start),Math.abs(item.end-raw.end))>.5||item.start<previousEnd)continue;
  lookup.get(item.id).s.start=item.start;lookup.get(item.id).s.end=item.end;previousEnd=item.end;applied.add(item.id);
 }
 // Ensure new bounds never create overlap with the retained original neighboring sentence.
 const entries=[...lookup];let reverted;
 do {reverted=false;for(let i=1;i<entries.length;i++){const prev=entries[i-1],next=entries[i];if(next[1].s.start>=prev[1].s.end)continue;for(const[id,{s,raw}]of[prev,next])if(applied.has(id)){s.start=raw.start;s.end=raw.end;applied.delete(id);reverted=true;}}}while(reverted);
 for(let i=1;i<entries.length;i++)if(entries[i][1].s.start<entries[i-1][1].s.end)fail('Original timestamps overlap');
 const items=[];let readerIndex=0;
 for(const[id,{s,raw}]of lookup){
  const t=timingById.get(id);if(!applied.has(id)&&!pending.has(id))pending.set(id,['時間尚未核定：新ASR匹配、邊界或0.5秒容差未通過，沿用原時間。']);
  s.id=raw.id||`sent-${readerIndex}`;readerIndex++;s.rawText=raw.text;s.rawTextRole='previous-machine-proofread-not-raw-asr';s.sourceSegmentId='original:'+id;s.text=fmt(s.text);if(!/[。！？…」』]$/.test(s.text))s.text+='。';
  s.proofreadText=s.text;s.reviewNeeded=pending.has(id);if(s.reviewNeeded)s.uncertainty=pending.get(id).join('；');
  items.push({id:s.id,sourceLocator:id,original:raw,after:{text:s.text,start:s.start,end:s.end},edits:edits.get(id)||[],timingApplied:applied.has(id),acousticProposal:t,pending:pending.get(id)||[],humanListened:false});
 }
 for(const p of session.paragraphs){p.downloadTrack='reading';p.start=p.sentences[0].start;p.end=p.sentences.at(-1).end;p.verbatimSentences=p.sentences.map(s=>({id:'old-'+s.id,start:s.start,end:s.end,text:s.rawText,speaker:'未辨識'}));}
 const selectedAcousticReplay=auditAcousticEvidence({audio:{sha256:audio.audioSha256,duration:audio.duration},engine,items:candidates.filter(r=>applied.has(r.id))},audio,plan.acousticDigest);if(!selectedAcousticReplay.ok)fail('Selected timing evidence does not replay');
 const oldApproval={status:source._meta?.status,approvedAt:source._meta?.approved_at,approvedBy:source._meta?.approved_by};
 session.lastUpdated=plan.generatedAt;session._meta={...source._meta,llm_proofread:'GX10 Qwen3.8-27B local proposals + Codex bounded review',grounding_source:'官方2016課本 p.6、60–61、63–64；文字參考，非音訊真值',status:'PENDING_REVIEW',last_updated:plan.generatedAt,processed_at:plan.generatedAt,engine:'existing-machine-proofread + fresh faster-whisper-large-v3-turbo advisory',humanListened:false,sourceDigest:plan.sourceDigest,acousticDigest:plan.acousticDigest,priorApproval:oldApproval};delete session._meta.approved_at;delete session._meta.approved_by;
 session.transcriptPublicationState='review-ready';session.qualityReview={humanListened:false,humanAudioAcceptance:false,sourceDigest:plan.sourceDigest,reviewPage:'lecture_01_quality_review.html',verbatimLabel:'舊機校原文（非原始ASR）',readerNotice:`待閱校版：2026-10-25 依現行流程重整，保留全部346句；新ASR僅作佐證，尚未人工完整校訂、未逐句聽核。${applied.size}句時間通過原音機器邊界及0.5秒容差檢查；其餘沿用原時間。${pending.size}句有待核項目，請配合原音核對。底本含第6頁、63–64頁，回看60–61頁。`,pendingItems:[...pending].map(([id,reasons])=>({id:lookup.get(id).s.id,sourceLocator:id,reasons}))};
 const overview=clone(source.contentOverview);for(const r of plan.overviewEvidenceOverrides||[]){if(!overview[r.group]?.[r.index]||!r.ids.length||r.ids.length>3||r.ids.some(id=>!lookup.has(id)))fail('Invalid overview evidence override');overview[r.group][r.index].evidence=r.ids.map(sentenceId=>({sentenceId}));}
 for(const group of ['mainPoints','discussionTopics','referenceViews'])for(const bullet of overview[group])for(const evidence of bullet.evidence){const entry=lookup.get(evidence.sentenceId);if(!entry)fail('Unknown historical overview source');evidence.sentenceId=entry.s.id;}
 session.contentOverview=hydrateEvidenceQuotes(overview,session);session.contentOverview.sourceDigest=computeSourceDigest(session);session.contentOverview.status='needs-review';
 if(plan.overviewReview){if(plan.overviewReview.sourceDigest!==computeSourceDigest(session)||plan.overviewReview.reviewedBy!=='Qwen3.8-27B (GX10 local)')fail('Stale overview review');const expected=['mainPoints','discussionTopics','referenceViews'].flatMap(g=>session.contentOverview[g].map((_,i)=>g+':'+i));const reviews=plan.overviewReview.items;if(reviews.length!==expected.length||expected.some(k=>!reviews.some(r=>r.group+':'+r.index===k&&r.verdict==='supported')))fail('Overview not supported');session.contentOverview.review=clone(plan.overviewReview);session.contentOverview.status='ai-reviewed';session.contentOverview.revisionNote='原MiniMax導讀文字保留；本次引用更新及GX10本地模型重新審查，不冒稱重新由MiniMax生成。';}
 const check=validateContentOverview(session.contentOverview,session,{sourceTranscriptId:'ru-zhong-lun/session_01'});if(check.errors.length)fail('Overview reference mismatch: '+JSON.stringify(check.errors));
 return {session,ledger:{schema:'source-bound-reading-ledger/v1',sourceDigest:plan.sourceDigest,acousticDigest:plan.acousticDigest,audioSha256:audio.audioSha256,humanListened:false,summary:{sentences:items.length,corrected:items.filter(i=>i.edits.length).length,localEdits:plan.corrections.length,timingApplied:applied.size,pending:pending.size},items,preliminaryAcousticReplay:acoustic,selectedAcousticReplay},verbatim:{sessionId:'01',label:'舊機校原文（非原始ASR）',paragraphs:Object.fromEntries(session.paragraphs.map(p=>[p.id,p.verbatimSentences]))}};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const stamp=t=>[Math.floor(t/3600),Math.floor(t%3600/60),Math.floor(t%60)].map(n=>String(n).padStart(2,'0')).join(':');
export function renderReading(result){const{session:s,ledger:l}=result;return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第01講待閱校與來源對照</title><style>body{max-width:950px;margin:auto;padding:20px;font:18px/1.9 system-ui;background:#f6f3ec;color:#26332a}section{background:white;padding:20px;margin:18px 0;border-radius:10px}p{overflow-wrap:anywhere}.notice{background:#fff0c6;padding:15px}.pending{color:#805200}details{font-size:15px}a{color:#285e3d}small{font-size:14px}</style><h1>入中論第01講：忠實原話待閱校版</h1><p class="notice">${esc(s.qualityReview.readerNotice)}</p><p>新ASR與舊機校稿都不是人工真值；未補前行、結行或缺失偈頌。講者未逐句辨識，小標題沿用舊AI整理。<a href="../../../?course=ru-zhong-lun#session-01">主閱讀頁</a></p>${s.paragraphs.map(p=>`<section id="${p.id}">${p.heading?`<h2>${esc(p.heading)}</h2>`:''}${p.sentences.map(r=>{const item=l.items.find(i=>i.id===r.id);return `<p id="${r.id}"><small>${r.id} [${stamp(r.start)}]</small> ${esc(r.text)}${r.reviewNeeded?'<strong class="pending">〔待核〕</strong>':''}</p><details><summary>舊稿／新ASR／修改與待核原因</summary><p>舊機校（不是原始ASR）：${esc(r.rawText)}</p><p>新ASR局部候選：${esc(item.acousticProposal.evidence.acousticText)}</p><p>校字：${esc(item.edits.map(e=>e.from+'→'+e.to+'：'+e.reason).join('；')||'無局部校字')}</p><p class="pending">${esc(item.pending.join('；'))}</p><a href="${esc(s.audioUrl)}#t=${r.start}">開啟官方原音</a></details>`}).join('')}</section>`).join('')}<p class="notice">AI辨識整理，尚未人工完整校訂。末句保留至 ${stamp(s.paragraphs.at(-1).sentences.at(-1).end)}；疑義請配合原音。</p></html>`}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root='reviews/evidence/ruzhong01-standard/',raw=fs.readFileSync(root+'original-session_01.json','utf8'),plan=JSON.parse(fs.readFileSync(root+'plan.json')),words=fs.readFileSync(root+'words.json','utf8'),result=buildReading(raw,plan,words);
 if(process.argv.includes('--candidate')){fs.writeFileSync('work/ruzhong01/candidate.json',JSON.stringify(result.session,null,2)+'\n');console.log(JSON.stringify(result.ledger.summary));process.exit(0)}
 if(!plan.overviewReview)fail('Final overview review required before publication');
 const course='courses/入中論善顯密意疏/';const current=fs.readFileSync(course+'sessions/session_01.json','utf8');if(hash(current)!==plan.sourceDigest&&JSON.stringify(JSON.parse(current))!==JSON.stringify(result.session))fail('Published source changed');
 fs.writeFileSync(course+'sessions/session_01.json',JSON.stringify(result.session,null,2)+'\n');fs.writeFileSync(root+'ledger.json',JSON.stringify(result.ledger,null,2)+'\n');fs.writeFileSync(course+'verbatim/verbatim_01.json',JSON.stringify(result.verbatim,null,2)+'\n');fs.writeFileSync(course+'publications/lecture_01_quality_review.html',renderReading(result));
 const text=`第01講｜入中論善顯密意疏\n最後校正更新：${plan.generatedAt}\n${result.session.qualityReview.readerNotice}\n\n`+result.session.paragraphs.map(p=>(p.heading?p.heading+'\n':'')+p.sentences.map(s=>`[${stamp(s.start)}] ${s.text}`).join('\n')).join('\n\n');for(const ext of ['txt','md'])fs.writeFileSync(course+`publications/lecture_01_verbatim_reading.${ext}`,text+'\n');
 const metadata=JSON.parse(fs.readFileSync(course+'course.json'));const item=metadata.sessions.find(s=>s.sessionId==='01');item.lastUpdated=plan.generatedAt;item.transcriptStatus='review-ready';item.pageRange='p.63–64';item.additionalReferencePages=[6,60,61];fs.writeFileSync(course+'course.json',JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify(result.ledger.summary));
}
