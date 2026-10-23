#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderLegacyPreview(bytes,report){
 const hash='sha256:'+createHash('sha256').update(bytes).digest('hex');
 if(hash!==report.sourceDigest)throw Error('Source digest mismatch');
 const t=JSON.parse(bytes);
 if(t.sessionId!=='37A'||report.paragraphs.length!==t.paragraphs.length||new Set(report.paragraphs.map(p=>p.id)).size!==t.paragraphs.length||t.paragraphs.some(p=>!report.paragraphs.some(r=>r.id===p.id)))throw Error('Review coverage mismatch');
 const sentences=t.paragraphs.flatMap(p=>p.sentences),verbatim=t.paragraphs.flatMap(p=>p.verbatimSentences||[]);
 for(const f of report.proposals){
  if(!sentences.some(s=>s.id===f.sentenceId)||!f.evidenceIds.every(id=>verbatim.some(s=>s.id===id))||!f.evidenceIds.some(id=>verbatim.find(s=>s.id===id).text.includes(f.evidenceQuote)))throw Error('Invalid proposal evidence');
 }
 const applied=new Set(['D03','D04','D05','D06','D07','D08','D09','D10','D11','D13']);
 const sections=t.paragraphs.map((p,i)=>{
  const r=report.paragraphs.find(r=>r.id===p.id);
  const proposals=report.proposals.filter(f=>p.sentences.some(s=>s.id===f.sentenceId));
  const candidate=p.sentences.map(s=>{
   const f=proposals.find(f=>f.sentenceId===s.id&&applied.has(f.id));
   let text=f?f.proposal:s.text;
   if(s.id==='p1-s2')text+='」';if(s.id==='p1-s3')text=text.replace(/^」/,'');
   return `<span${f?' class="changed"':''}>${escape(text)}</span>`;
  }).join('');
  const findings=proposals.map(f=>{
   const before=sentences.find(s=>s.id===f.sentenceId).text;
   return `<details class="proposal" data-proposal="${escape(f.id)}"><summary>${escape(f.id)} · ${escape(f.sentenceId)} · ${applied.has(f.id)?'已顯示於試閱稿，待驗收':f.id==='D01'?'引號排版已調整':'待覆核，未自動套用'}</summary><p><b>原講記：</b>${escape(before)}</p><p><b>修訂建議：</b>${escape(f.proposal)}</p><blockquote>${escape(f.evidenceQuote)}</blockquote><p>原話索引：${escape(f.evidenceIds.join('、'))}</p></details>`;
  }).join('');
  const raw=p.verbatimSentences.map(s=>`<p id="${escape(s.id)}"><small>${escape(s.id)} · ${s.start.toFixed(2)}秒</small> ${escape(s.text)}</p>`).join('');
  return `<section id="${escape(p.id)}" data-paragraph="${escape(p.id)}"><h2>${escape(p.heading||`第 ${i+1} 段`)}</h2><p class="status">${escape(p.id)} · ${escape(r.verdict)} · ${escape(r.reason)}</p><p class="reading">${candidate}</p>${findings}<details><summary>對照原講記與課堂原話（原始 ASR，尚未人工聽核）</summary><h3>原講記</h3><p>${escape(p.sentences.map(s=>s.text).join(''))}</p><h3>課堂原話</h3>${raw}</details></section>`;
 }).join('');
 return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>37A 校訂試閱 · 非正式定稿</title><style>body{margin:0;background:#f6f3ed;color:#272923;font:17px/1.9 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:24px}header,section{background:white;padding:24px;margin:0 0 22px;border-radius:12px}h1{font-size:1.7rem}h2{font-size:1.2rem}.notice{background:#fff3ce;border-left:5px solid #a66a00;padding:16px}.status,small{color:#5b6257;font-size:.88rem}.changed{background:#e8f4e5}.reading{font-family:serif;font-size:1.16rem}details{border:1px solid #ddd;padding:12px;margin:12px 0;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600}blockquote{border-left:3px solid #73926b;padding-left:14px}a{color:#28623b}nav{display:flex;flex-wrap:wrap;gap:10px}@media(max-width:600px){main{padding:12px}header,section{padding:16px}}@media print{details{display:block}.notice{border:2px solid black}}</style></head><body><main><header><h1>《入中論善顯密意疏》37A 校訂試閱</h1><p class="notice"><b>AI 整理與修訂提案，非正式定稿，尚未人工聽核。</b>這是獨立試閱頁，不會改動正式閱讀器。淡綠底為已放入試閱稿的修訂；仍待覆核的建議另列。閱讀前請留意：文字證據核對不等於音訊或獨立內容驗收。</p><p>30段完整試閱 · 13項建議 · 1項原話待聽核。D02、D12未自動套用；導讀摘要尚未重建，因此本頁不呈現舊摘要為新稿背書。</p><nav><a href="../../../?course=ru-zhong-lun#session-37A">回正式37A</a><a href="#p_4">核心立場</a><a href="#p_15">重要條件</a><a href="#p_17">次第疑難</a><a href="#p_26">引文校字</a><a href="#p_27">待聽核</a><a href="https://github.com/huanruilee/Transcriptions/issues/277">回報問題／交接紀錄</a></nav><p class="status">來源版本：${escape(hash)}。原講記、課堂原話與時間碼均保留於對照區。原話 p27-v6 宗派歸屬待聽核，未替換。</p></header>${sections}<footer class="notice">本頁為 AI 校訂試閱，非正式定稿；請對照原講記、課堂原話及底本。尚未人工聽核，未取得獨立內容驗收。</footer></main></body></html>`;
}
export function renderPreview(bytes,report){
 return renderLegacyPreview(bytes,report).replace('<header>','<header><p class="notice"><b>此舊版已撤回：</b>段落與課堂原話未可靠對齊，不能作為已驗收講記。請改看 <a href="lecture_37A_verbatim_rebuild.html">37A 從課堂原話重整版</a>；以下僅保留歷史比較，不再用 supported 作內容放行。</p>');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(import.meta.dirname,'..');
 const course=path.join(root,'courses/入中論善顯密意疏');
 const html=renderPreview(fs.readFileSync(path.join(course,'sessions/session_37A.json')),JSON.parse(fs.readFileSync(path.join(root,'reviews/evidence/session37a-efficient-pilot/codex-direct-review.json'))));
 const out=path.join(course,'publications/lecture_37A_codex_preview.html');fs.writeFileSync(out,html);console.log(out);
}
