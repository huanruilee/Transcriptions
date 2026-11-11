import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildRebuild,renderRebuild,normalizeText,referenceBody} from '../../scripts/shiliang_verbatim_rebuild.mjs';
const source={sessionId:'30',title:'測試',youtubeVideoId:'f2eRxEqCsZA',paragraphs:[{id:'p1',heading:'【主題】測試',sentences:[{id:'s1',start:0,end:1,text:'這是原話。'}]},{id:'p2',heading:'【主題】測試',sentences:[{id:'s2',start:1,end:2,text:'保留問題？'}]}]};
test('rebuild preserves all IDs, timing, ordering and original utterance objects',()=>{
 const b=buildRebuild(source,{corrections:[],pending:[]});
 assert.equal(b.sections.length,1);assert.equal(b.counts.sentences,2);
 assert.deepEqual(b.sections.flatMap(p=>p.sentences).map(s=>s.raw),source.paragraphs.flatMap(p=>p.sentences));
 assert.equal(b.sections[0].reading,'這是原話。保留問題？');
 assert.equal(b.humanListened,false);
});
test('blank headings continue preceding topic without duplicate titles',()=>{
 const t=structuredClone(source);t.paragraphs[1].heading=null;
 assert.equal(buildRebuild(t,{corrections:[],pending:[]}).sections.length,1);
});
test('changes require exact matching text and explicit basis, unknown IDs fail closed',()=>{
 assert.throws(()=>buildRebuild(source,{corrections:[{id:'s1',before:'不存在',after:'新文',basis:'x'}],pending:[]}));
 assert.throws(()=>buildRebuild(source,{corrections:[{id:'x',before:'x',after:'y',basis:'x'}],pending:[]}));
 const b=buildRebuild(source,{corrections:[{id:'s1',before:'這是原話。',after:'這是原話！',basis:'標點'}],pending:[]});
 assert.equal(b.ledger.length,1);assert.equal(b.sections[0].sentences[0].raw.text,'這是原話。');
});
test('review page escapes content and distinguishes source text from acoustic confirmation',()=>{
 const b=buildRebuild({...source,title:'<script>'},{corrections:[],pending:[{id:'s2',reason:'需聽核'}]});
 const html=renderRebuild(b);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/尚未人工聽核/);assert.match(html,/原稿對照/);
});
test('both complete rebuilt lectures exactly cover the official edited body',()=>{
 for(const id of ['30','31']){
  const t=JSON.parse(fs.readFileSync(`courses/釋量論第二品/sessions/session_${id}.json`));
  const plan=JSON.parse(fs.readFileSync(`reviews/evidence/shiliang-30-31-rebuild/plan-${id}.json`));
  const b=buildRebuild(t,plan),all=t.paragraphs.flatMap(p=>p.sentences),rebuilt=b.sections.flatMap(p=>p.sentences);
  assert.deepEqual(rebuilt.map(s=>s.raw),all);
  assert.equal(referenceBody(fs.readFileSync(`courses/釋量論第二品/source_text/session_${id}_official_raw.txt`,'utf8'),t),normalizeText(b.sections.map(p=>p.reading).join('')));
  assert.equal(b.sections[0].id,'opening');assert.equal(b.sections.length,id==='30'?10:14);
  assert.deepEqual(b.sections[0].sourceParagraphIds,t.paragraphs.slice(0,3).map(p=>p.id));
  assert.equal(b.ledger.length,id==='30'?0:4);
  assert.equal(b.sections.slice(1).some(p=>!p.heading),false);
 }
});
