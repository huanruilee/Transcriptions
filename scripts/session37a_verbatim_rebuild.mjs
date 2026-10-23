#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=s=>[Math.floor(s/3600),Math.floor(s%3600/60),Math.floor(s%60)].map(n=>String(n).padStart(2,'0')).join(':');
export function buildVerbatimRebuild(bytes,plan){
 if(hash(bytes)!==plan.sourceDigest)throw Error('Source digest mismatch');
 const t=JSON.parse(bytes);
 if(t.sessionId!=='37A'||plan.headings.length!==t.paragraphs.length)throw Error('Invalid scope');
 const raw=t.paragraphs.flatMap(p=>p.verbatimSentences||[]),ids=new Set(raw.map(s=>s.id));
 if(ids.size!==raw.length||!raw.length)throw Error('Invalid raw coverage');
 if([...plan.corrections,...plan.pending].some(c=>!ids.has(c.id)))throw Error('Unknown source ID');
 for(const item of plan.overview)if(!item.text||!item.evidenceIds?.length||item.evidenceIds.some(id=>!ids.has(id)))throw Error('Invalid overview evidence');
 const corrections=[];
 const paragraphs=t.paragraphs.map((p,index)=>{
  const utterances=p.verbatimSentences.map(s=>{
   let text=s.text;const edits=[];
   for(const c of plan.corrections.filter(c=>c.id===s.id)){
    if(!c.from||!c.to||!c.basis||text.split(c.from).length-1!==(c.count??1))throw Error('Correction match mismatch: '+s.id+' '+c.from);
    text=text.split(c.from).join(c.to);
    edits.push({from:c.from,to:c.to,basis:c.basis,...(c.from===c.to?{kind:'verification'}:{})});
   }
   const beforeFormatting=text;
   text=text.replace(/[ \t]+/g,'，').replace(/，([，。！？；：、])/g,'$1');
   if(!/[。！？？，、：；…]$/.test(text))text+='。';
   if(text!==beforeFormatting)edits.push({from:beforeFormatting,to:text,basis:'僅補口語停頓標點，不刪字、不改義。',kind:'punctuation'});
   const pending=plan.pending.filter(c=>c.id===s.id).map(c=>c.reason);
   if(edits.length)corrections.push({id:s.id,before:s.text,after:text,edits,humanListened:false});
   return {...s,text,raw:structuredClone(s),reviewNeeded:pending.length>0,pending,humanListened:false};
  });
  return {id:p.id,heading:plan.headings[index],start:utterances[0].start,end:utterances.at(-1).end,sourceIds:utterances.map(s=>s.id),reading:utterances.map(s=>s.text).join(''),utterances};
 });
 const url=new URL(t.audioUrl);
 if(url.protocol!=='https:'||url.hostname!=='buddha.flyday.com.tw')throw Error('Unverified audio URL');
 return {schema:'session37a-verbatim-rebuild/v1',sessionId:'37A',sourceDigest:hash(bytes),rawUtteranceDigest:hash(JSON.stringify(raw)),planDigest:hash(JSON.stringify(plan)),status:'candidate-needs-audio-review',humanListened:false,audioUrl:t.audioUrl,policy:plan.policy,paragraphs,corrections,overview:plan.overview,counts:{paragraphs:paragraphs.length,utterances:raw.length,correctedUtterances:corrections.filter(c=>c.edits.some(e=>e.kind!=="verification")).length,pendingUtterances:plan.pending.length,rawCharacters:raw.reduce((n,s)=>n+[...s.text].length,0),correctedCharacters:paragraphs.flatMap(p=>p.utterances).reduce((n,s)=>n+[...s.text].length,0)}};
}
export function renderVerbatimRebuild(b){
 const warning='⚠️ AI辨識整理，內容可能有誤，僅供參考，請小心辨別。尚未人工聽核；待核字句保留原字，不冒稱已確認。';
 const intro=`<header><h1>37A 從課堂原話重新整理</h1><p class="notice">${esc(warning)}</p><p>本版不採用舊講記。正文逐句取自校字後課堂原話，保留口語、重複、比喻與原來順序；下方可展開逐句校字及原始 ASR。沒有另補前行、結行或原典段落。</p><p>${b.counts.paragraphs}段 · ${b.counts.utterances}句 · ${b.counts.correctedUtterances}句有校字或標點紀錄 · ${b.counts.pendingUtterances}句待核。校字是文字證據判斷，不等於已聽出錄音。</p><nav><a href="#p_12">第12段：遺忘與加法</a> · <a href="#p_17">了解次第的疑問</a> · <a href="#p_27">宗派歸屬待核</a> · <a href="../../../?course=ru-zhong-lun#session-37A">正式閱讀器（尚未替換）</a></nav><h2>閱讀前導讀（AI摘要，非原話）</h2><ul>${b.overview.map(x=>`<li>${esc(x.text)}<small>〔${esc(x.evidenceIds.join('、'))}〕</small></li>`).join('')}</ul></header>`;
 const body=b.paragraphs.map((p,i)=>{
  const rows=p.utterances.map(s=>{
   const edits=b.corrections.find(c=>c.id===s.id)?.edits||[];
   return `<tr id="audit-${esc(s.id)}"><th scope="row">${esc(s.id)}<br>${time(s.start)}</th><td>${esc(s.raw.text)}</td><td>${esc(s.text)}${s.pending.map(x=>`<p class="pending">待核：${esc(x)}</p>`).join('')}${edits.map(x=>`<p class="basis">${esc(x.basis)}</p>`).join('')}</td></tr>`;
  }).join('');
  const reading=p.utterances.map(s=>`<span id="${esc(s.id)}" class="${s.reviewNeeded?'uncertain':''}">${esc(s.text)}${s.reviewNeeded?`<a class="badge" href="#audit-${esc(s.id)}">〔待核〕</a>`:''}</span>`).join('');
  return `<section id="${esc(p.id)}" data-paragraph="${esc(p.id)}"><h2>第${i+1}段｜${esc(p.heading)} <small>[${time(p.start)}]</small></h2><p class="reading"><b>格西：</b>${reading}</p><details><summary>逐句對照：原始 ASR → 校字後課堂原話</summary><div class="table-wrap"><table><thead><tr><th>來源／時間</th><th>原始 ASR（保留不動）</th><th>校字後課堂原話與依據</th></tr></thead><tbody>${rows}</tbody></table></div></details><p class="source">來源：${esc(p.sourceIds.join('、'))}。<a href="${esc(b.audioUrl+'#t='+p.start)}" target="_blank" rel="noopener noreferrer">開啟官方原音定位</a>（定位僅供輔助，尚未逐句聽核）</p></section>`;
 }).join('');
 return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>37A 原話重整版｜校字與原始ASR對照</title><style>body{background:#f7f4ee;color:#263029;margin:0;font:17px/1.9 system-ui,sans-serif;overflow-wrap:anywhere}main{max-width:1000px;margin:auto;padding:22px}header,section{background:white;border-radius:12px;padding:24px;margin-bottom:22px}h1{font-size:1.65rem}h2{font-size:1.2rem}.reading{font-family:serif;font-size:1.15rem}.notice,.pending{background:#fff1ca;padding:12px;border-left:4px solid #a7730b}.uncertain{background:#fff7df}.badge{font:12px system-ui;color:#7b4b00}.source,small,.basis{color:#59685b;font-size:.85rem}details{border:1px solid #ccd4c9;padding:12px}summary{cursor:pointer;font-weight:bold}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;border:1px solid #ddd;padding:10px;vertical-align:top}th:first-child{width:100px}a{color:#285a3b}footer{padding:20px}@media(max-width:600px){main{padding:10px}header,section{padding:15px}table{min-width:680px}}</style></head><body><main>${intro}${body}<footer><p class="notice">${esc(warning)}</p><p>原始逐字稿字數：${b.counts.rawCharacters} 字；校字及標點後字數：${b.counts.correctedCharacters} 字（均按Unicode字元含標點統計）。</p><p class="source">來源SHA256：${esc(b.sourceDigest)}。本版為候選，未取代正式逐字稿；原始ASR、ID、順序、時間及講者均保留。</p></footer></main></body></html>`;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(import.meta.dirname,'..'),course=path.join(root,'courses/入中論善顯密意疏');
 const plan=JSON.parse(fs.readFileSync(path.join(root,'reviews/evidence/session37a-verbatim-rebuild/plan.json')));
 const b=buildVerbatimRebuild(fs.readFileSync(path.join(course,'sessions/session_37A.json')),plan);
 const prefix=path.join(course,'publications/lecture_37A_verbatim_rebuild');
 fs.writeFileSync(prefix+'.json',JSON.stringify(b,null,2)+'\n');
 fs.writeFileSync(prefix+'.html',renderVerbatimRebuild(b));
 const warning='⚠️ AI辨識整理，內容可能有誤，僅供參考，請小心辨別。尚未人工聽核；待核字句保留原字。';
 fs.writeFileSync(prefix+'.md',`# 37A 從課堂原話重新整理\n\n${warning}\n\n## 閱讀前導讀（AI摘要，非原話）\n\n${b.overview.map(x=>'- '+x.text).join('\n')}\n\n`+b.paragraphs.map(p=>`### ${p.heading} [${time(p.start)}]\n\n**格西：** ${p.reading}\n\n${p.utterances.filter(s=>s.reviewNeeded).map(s=>'> 待核 '+s.id+'：'+s.pending.join('；')).join('\n')}\n`).join('\n')+`\n${warning}\n\n原始逐字稿字數：${b.counts.rawCharacters}字；校字後：${b.counts.correctedCharacters}字（含標點）。\n`);
 console.log(JSON.stringify(b.counts));
}
