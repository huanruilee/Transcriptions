// Bounded, local-only advisory calls. Never modifies courses/ or adopts suggestions.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const dir=path.join(root,'reviews/evidence/shiliang-30-31-rebuild');fs.mkdirSync(dir,{recursive:true});
const digest=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const endpoint='http://127.0.0.1:18038/v1/';
const info=await(await fetch(endpoint+'models')).json();
if(!info.data?.some(x=>x.id==='Qwen3.8-27B'))throw Error('Expected authorized local model');
const policy='你只做保守校字候選，不改寫逐字稿。published是有ID的現有逐字稿，official是官方整編文字底本而非原始ASR。完整讀完再答。只找明確錯別字、漏字、引用訛字；禁止把提問改成定論、替換近取因與俱生緣、改宗派或從原典補義。不要把字體或用語偏好當錯字。保持每句ID不變，只建議非常確定的少量修改，最多15項。before必須整句逐字相同；after是僅校字的完整句；basis說明；officialQuote必須為official內連續逐字短引，不確定就列pending不要校正。不要聲稱聽過音。只輸出JSON {corrections:[{id,before,after,basis,officialQuote}],pending:[{id,reason}],assessment:"60字內"}。原稿的句子跨段或引號拆開由程式合併處理，不需為此改寫句子。';
for(const id of ['30','31']){
 const file=path.join(dir,`local-${id}.json`);
 if(fs.existsSync(file)){console.log(id+' cached');continue;}
 const source=fs.readFileSync(path.join(root,`courses/釋量論第二品/sessions/session_${id}.json`));
 const t=JSON.parse(source),official=fs.readFileSync(path.join(root,`courses/釋量論第二品/source_text/session_${id}_official_raw.txt`),'utf8');
 const input={published:t.paragraphs.map(p=>({heading:p.heading,sentences:p.sentences.map(s=>({id:s.id,text:s.text}))})),official};
 const budgetFile=path.join(dir,'local-budget.json');
 let budget=fs.existsSync(budgetFile)?JSON.parse(fs.readFileSync(budgetFile)):{limit:4,used:0};
 if(budget.used>=budget.limit)throw Error('Call cap reached');
 budget.used++;fs.writeFileSync(budgetFile,JSON.stringify(budget));
 console.log(id+' local review start');
 const res=await fetch(endpoint+'chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(600000),body:JSON.stringify({model:'Qwen3.8-27B',temperature:0,max_tokens:3000,chat_template_kwargs:{enable_thinking:false},messages:[{role:'system',content:policy},{role:'user',content:JSON.stringify(input)}]})});
 const raw=await res.text();fs.writeFileSync(file,raw);
 if(!res.ok)throw Error('Local HTTP '+res.status);
 const result=JSON.parse(raw);if(result.choices?.[0]?.finish_reason!=='stop')throw Error('Truncated model output preserved, not adopted');
 const text=result.choices[0].message.content.replace(/^```(?:json)?\s*|\s*```$/g,'');
 const advice=JSON.parse(text),sentences=t.paragraphs.flatMap(p=>p.sentences);
 const accepted=[],rejected=[];
 for(const c of advice.corrections||[]){
  const s=sentences.find(s=>s.id===c.id);
  if(s?.text===c.before&&typeof c.after==='string'&&c.after.trim()&&c.basis&&c.officialQuote&&official.includes(c.officialQuote))accepted.push(c);
  else rejected.push(c);
 }
 fs.writeFileSync(path.join(dir,`advice-${id}.json`),JSON.stringify({sessionId:id,sourceDigest:digest(source),officialDigest:digest(official),model:result.model,runtime:info,usage:result.usage,humanListened:false,acceptedForHumanReview:accepted,rejected,pending:advice.pending||[],assessment:advice.assessment},null,2)+'\n');
 console.log(JSON.stringify({id,usage:result.usage,candidates:accepted.length,rejected:rejected.length,pending:advice.pending?.length||0}));
}
