import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=x=>[Math.floor(x/3600),Math.floor(x%3600/60),Math.floor(x%60)].map(x=>String(x).padStart(2,'0')).join(':');
export const normalizeText=x=>x.replace(/\s/g,'');
export function referenceBody(official,t){
 let body=official.slice(official.indexOf('大眾請合掌'));
 body=body.replace(/^\s*\d+\s*$/gm,'');
 for(const p of t.paragraphs){
  if(!p.heading)continue;
  const title=p.heading.replace(/^【.*?】[一二三四五六七八九十]+、/,'');
  body=body.replace(new RegExp('\\d+\\.\\s*'+title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'');
 }
 return normalizeText(body);
}
export function buildRebuild(t,plan){
 const all=t.paragraphs.flatMap(p=>p.sentences),ids=new Set(all.map(s=>s.id));
 if(ids.size!==all.length||!all.length)throw Error('Invalid sentence coverage');
 for(const c of [...plan.corrections,...plan.pending])if(!ids.has(c.id))throw Error('Unknown source ID');
 if(new Set(plan.corrections.map(c=>c.id)).size!==plan.corrections.length)throw Error('Duplicate correction');
 const sections=[],ledger=[];
 for(const p of t.paragraphs){
  let section=sections.at(-1);
  const heading=p.heading||section?.heading||'【主題】原稿內容';
  if(section?.heading!==heading){section={id:'section-'+(sections.length+1),heading,sourceParagraphIds:[],sentences:[],reading:''};sections.push(section);}
  section.sourceParagraphIds.push(p.id);
  for(const s of p.sentences){
   const c=plan.corrections.find(c=>c.id===s.id);
   if(c&&(!c.basis||c.before!==s.text||typeof c.after!=='string'||!c.after.trim()))throw Error('Invalid correction '+s.id);
   const pending=plan.pending.filter(c=>c.id===s.id).map(c=>c.reason);
   if(c)ledger.push({...c,humanListened:false});
   const item={...s,text:c?.after??s.text,sourceParagraphId:p.id,raw:structuredClone(s),pending,humanListened:false};
   section.sentences.push(item);section.reading+=item.text;
  }
 }
 const first=sections[0];
 // Opening chants and instructions are not the first doctrinal topic.
 const opening=[];
 while(first.sentences.length&&/^(大眾請合掌|南無本師|請放掌)/.test(first.sentences[0].text))opening.push(first.sentences.shift());
 if(opening.length){first.reading=first.sentences.map(s=>s.text).join('');sections.unshift({id:'opening',heading:'【前行】合掌、禮佛與開經偈（底本所載）',sourceParagraphIds:[],sentences:opening,reading:opening.map(s=>s.text).join('')});}
 for(const section of sections)section.sourceParagraphIds=[...new Set(section.sentences.map(s=>s.sourceParagraphId))];
 return {schema:'shiliang-source-rebuild/v1',sessionId:t.sessionId,title:t.title,youtubeVideoId:t.youtubeVideoId,sourceDigest:plan.sourceDigest||hash(JSON.stringify(t)),officialDigest:plan.officialDigest,sourceRole:'published-transcript-and-official-edited-reference-not-raw-ASR',status:'candidate-needs-audio-review',humanListened:false,sections,ledger,overview:t.contentOverview,counts:{sentences:all.length,sections:sections.length,corrected:ledger.length,pending:new Set(plan.pending.map(p=>p.id)).size,sourceCharacters:all.reduce((n,s)=>n+[...s.text].length,0),correctedCharacters:sections.reduce((n,p)=>n+[...p.reading].length,0)}};
}
export const readingContentDigest=b=>hash(JSON.stringify({sourceDigest:b.sourceDigest,sections:b.sections,ledger:b.ledger,overview:b.overview}));
export function applyReadingApproval(b,a){
 if(!a||a.type!=='reading-only'||a.humanListened!==false||a.sessionId!==b.sessionId||a.sourceDigest!==b.sourceDigest||a.contentDigest!==readingContentDigest(b)||a.approvedBy!=='Henry'||a.approvedAt!=='2026-10-24'||a.userStatement!=='30 31 講看完，可以上線了')throw Error('Invalid or stale reading approval');
 return {...structuredClone(b),status:'reading-approved',humanListened:false,readingApproval:structuredClone(a)};
}
export function renderRebuild(b){
 let html=renderCandidate(b);
 if(b.status==='reading-approved'){
  applyReadingApproval(b,b.readingApproval);
  html=html.replace('｜原稿重整試閱</title>','｜原稿重整正式版</title>').replace('：原稿重整版</h1>','：原稿重整正式版</h1>').replace('本版未取代正式閱讀器。','已閱讀確認：Henry，2026-10-24。本重整閱讀版已正式發布；原有音文同步閱讀器保留。未逐句聽核。');
 }
 return html;
}
function renderCandidate(b){
 const warning='⚠️ AI辨識整理，內容可能有誤，僅供參考，請小心辨別。尚未人工聽核；本版以既有正式逐字稿及官方整編稿為文字底本，不冒稱原始 ASR。';
 const video=id=>'https://www.youtube.com/watch?v='+encodeURIComponent(b.youtubeVideoId)+'&t='+Math.floor(id)+'s';
 const groups=[['mainPoints','主要內容'],['discussionTopics','討論議題'],['referenceViews','參考觀點']];
 const sourceById=new Map(b.sections.flatMap(p=>p.sentences).map(s=>[s.id,s.raw.text]));
 const overview=b.overview&&groups.every(([key])=>Array.isArray(b.overview[key])&&b.overview[key].every(x=>x.evidence?.length&&x.evidence.every(e=>sourceById.get(e.sentenceId)?.includes(e.quote))))
  ? `<section><h2>閱讀前導讀（沿用正式稿 AI 摘要，非課堂原話）</h2>${groups.map(([key,label])=>`<h3>${label}</h3><ul>${b.overview[key].map(x=>`<li>${esc(x.text)} <small>〔${x.evidence.map(e=>esc(e.sentenceId)).join('、')}〕</small></li>`).join('')}</ul>`).join('')}</section>` : '';
 const body=overview+b.sections.map(p=>{
  let chunks=[],current='';
  for(const [i,s] of p.sentences.entries()){
   current+=`<span id="${esc(s.id)}">${esc(s.text)}${s.pending.length?`<a class="pending" href="#audit-${esc(s.id)}">〔待核〕</a>`:''}</span>`;
   if(current.replace(/<[^>]*>/g,'').length>600&&/[。！？」』）]$/.test(s.text)&&!/^[(）」，；、]/.test(p.sentences[i+1]?.text||'')){chunks.push(current);current='';}
  }
  if(current)chunks.push(current);
  return `<section id="${esc(p.id)}"><h2>${esc(p.heading)} <small>[${clock(p.sentences[0]?.start||0)}]</small></h2>${chunks.map(c=>'<p class="reading">'+c+'</p>').join('')}<a href="${esc(video(p.sentences[0]?.start||0))}" target="_blank" rel="noopener">▶ 原影片定位</a><details><summary>原稿對照與校字依據（${p.sentences.length} 句）</summary><div class="scroll"><table><thead><tr><th>來源與時間</th><th>原稿（保留）</th><th>本版／校字依據</th></tr></thead><tbody>${p.sentences.map(s=>`<tr id="audit-${esc(s.id)}"><th>${esc(s.id)}<br>${clock(s.start)}</th><td>${esc(s.raw.text)}</td><td>${esc(s.text)}${b.ledger.filter(c=>c.id===s.id).map(c=>`<p>${esc(c.basis)}</p>`).join('')}${s.pending.map(r=>`<p class="pending">待核：${esc(r)}</p>`).join('')}</td></tr>`).join('')}</tbody></table></div></details></section>`;
 }).join('');
 return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(b.title)}｜原稿重整試閱</title><style>body{font:17px/1.9 system-ui;background:#f7f4ee;color:#263029;margin:0}main{max-width:1000px;margin:auto;padding:24px}header,section{background:white;border-radius:12px;padding:24px;margin-bottom:22px}.reading{font:20px/2 serif}h2{font-size:1.25rem}a{color:#285a3b}.notice,.pending{background:#fff1ca;padding:4px}small{font-size:14px;color:#59685b}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:650px}th,td{border:1px solid #ddd;padding:10px;vertical-align:top;text-align:left}details{margin-top:15px}summary{cursor:pointer}nav a{display:block}@media(max-width:600px){main{padding:10px}header,section{padding:15px}}</style><main><header><h1>${esc(b.title)}：原稿重整版</h1><p class="notice">${esc(warning)}</p><p>如性法師講授；學員插話沿用底本標註。保留全部 ${b.counts.sentences} 句、順序、ID 與既有時間，合併重複主題標題及跨段文字；沒有另補發願、回向或義理解說。時間沿用原資料，尚未重新校準。</p><p>${b.counts.sections} 個主題區塊 · ${b.counts.corrected} 句有校字紀錄 · ${b.counts.pending} 句待核。本版未取代正式閱讀器。</p><a href="../../../?course=shi-liang-lun-er#session-${esc(b.sessionId)}">返回正式閱讀器</a><h2>本講目錄</h2><nav>${b.sections.map(p=>`<a href="#${esc(p.id)}">${esc(p.heading)}</a>`).join('')}</nav></header>${body}<footer><p class="notice">${esc(warning)}</p><p>原稿 ${b.counts.sourceCharacters} 字；重整後 ${b.counts.correctedCharacters} 字（含標點）。來源：${esc(b.sourceDigest)}</p></footer></main></html>`;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),course=path.join(root,'courses/釋量論第二品');
 fs.mkdirSync(path.join(course,'publications'),{recursive:true});
 for(const id of ['30','31']){
  const planFile=path.join(root,`reviews/evidence/shiliang-30-31-rebuild/plan-${id}.json`);
  const plan=JSON.parse(fs.readFileSync(planFile));
  const source=fs.readFileSync(path.join(course,`sessions/session_${id}.json`));
  if(hash(source)!==plan.sourceDigest)throw Error('Source digest mismatch '+id);
  let b=buildRebuild(JSON.parse(source),plan);
  const official=fs.readFileSync(path.join(course,`source_text/session_${id}_official_raw.txt`),'utf8');
  if(hash(official)!==plan.officialDigest)throw Error('Official digest mismatch '+id);
  if(referenceBody(official,JSON.parse(source))!==normalizeText(b.sections.map(p=>p.reading).join('')))throw Error('Full reference coverage mismatch '+id);
  const approvals=path.join(root,'reviews/evidence/shiliang-30-31-rebuild/reading-approval.json');
  if(fs.existsSync(approvals))b=applyReadingApproval(b,JSON.parse(fs.readFileSync(approvals)).sessions.find(a=>a.sessionId===id));
  const prefix=path.join(course,`publications/lecture_${id}_verbatim_rebuild`);
  fs.writeFileSync(prefix+'.json',JSON.stringify(b,null,2)+'\n');fs.writeFileSync(prefix+'.html',renderRebuild(b));
  console.log(JSON.stringify({session:id,...b.counts}));
 }
}
