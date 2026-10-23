import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function correctionDate(t){
 for(const [source,value] of [['lastUpdated',t.lastUpdated],['last_updated',t.last_updated],['_meta.processed_at',t._meta?.processed_at],['_meta.last_updated',t._meta?.last_updated]]){
  if(typeof value!=='string')continue;
  const m=value.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/);
  if(m&&Number.isFinite(Date.parse(m[1]))&&new Date(m[1]).toISOString().slice(0,10)===m[1])return {value,source};
 }
 return {value:'未記錄',source:'無有效日期欄位'};
}
export function renderCorrectionDates(course,rows){
 const back='../../?course='+encodeURIComponent(course.courseId);
 return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(course.title)}｜各講最後校訂日期</title><style>body{font:17px/1.7 system-ui;background:#f7f4ee;color:#263029;margin:0}main{max-width:1100px;margin:auto;padding:24px}table{width:100%;border-collapse:collapse;background:white}th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}caption{text-align:left;font-weight:bold}a{color:#285a3b}.scroll{overflow-x:auto}small{color:#59685b}</style><main><a href="${esc(back)}">← 返回課程</a><h1>${esc(course.title)}：各講最後校訂日期</h1><p>本頁為課程最後的校訂紀錄總表，共 ${rows.length} 講。日期取自正式逐字稿的更新欄位，不是授課日、部署日或試閱候選日期；有日期不代表已人工聽核。未記錄表示缺少有效日期，不代表從未校訂。</p><div class="scroll"><table><caption>正式逐字稿記錄日期</caption><thead><tr><th scope="col">講次</th><th scope="col">標題</th><th scope="col">最後校訂／更新日期（原記錄）</th><th scope="col">日期來源</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row"><a href="${esc(back+'#session-'+encodeURIComponent(r.id))}">${esc(r.id)}</a></th><td>${esc(r.title)}</td><td>${esc(r.date.value)}</td><td><small>${esc(r.date.source)}</small></td></tr>`).join('')}</tbody></table></div><p>未註明時區的歷史紀錄按原值顯示，不自行換算；生成日期與人工覆核日期不可混同。</p><a href="${esc(back)}">返回課程</a></main></html>`;
}
export function generateCorrectionDates(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 const result=[];
 for(const dir of fs.readdirSync(path.join(root,'courses'))){
  const base=path.join(root,'courses',dir),file=path.join(base,'course.json');
  if(!fs.existsSync(file))continue;
  const course=JSON.parse(fs.readFileSync(file));
  const entries=new Map([...(course.sessions||[]),...(course.pendingSessions||[])].map(s=>[s.sessionId,s]));
  const sessions=path.join(base,'sessions');
  if(fs.existsSync(sessions))for(const name of fs.readdirSync(sessions)){
   const m=name.match(/^session_(.+)\.json$/);if(m&&!entries.has(m[1]))entries.set(m[1],{sessionId:m[1]});
  }
  const rows=[...entries].sort(([a],[b])=>a.localeCompare(b,'en',{numeric:true})).map(([id,s])=>{
   const f=path.join(sessions,`session_${id}.json`);
   const t=fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):{};
   return {id,title:s.title||t.title||`第 ${id} 講`,date:correctionDate(t)};
  });
  fs.writeFileSync(path.join(base,'correction-dates.html'),renderCorrectionDates(course,rows));
  result.push({course:course.courseId,count:rows.length});
 }
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(generateCorrectionDates());
