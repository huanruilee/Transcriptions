import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildVerbatimRebuild,renderVerbatimRebuild} from '../../scripts/session37a_verbatim_rebuild.mjs';
const root=new URL('../../',import.meta.url);
const bytes=fs.readFileSync(new URL('courses/入中論善顯密意疏/sessions/session_37A.json',root));
const plan=JSON.parse(fs.readFileSync(new URL('reviews/evidence/session37a-verbatim-rebuild/plan.json',root)));
test('reading derives only from corrected utterances, p12 never reuses old lecture',()=>{
 const b=buildVerbatimRebuild(bytes,plan),t=JSON.parse(bytes);
 assert.deepEqual(b.paragraphs.map(p=>p.id),t.paragraphs.map(p=>p.id));
 for(const [i,p] of b.paragraphs.entries()){
  assert.equal(p.reading,p.utterances.map(s=>s.text).join(''));
  assert.equal(p.utterances.length,t.paragraphs[i].verbatimSentences.length);
  for(const [j,s] of p.utterances.entries()){
   const original=t.paragraphs[i].verbatimSentences[j];
   assert.deepEqual(s.raw,original);
   assert.equal(s.id,original.id);assert.equal(s.start,original.start);assert.equal(s.end,original.end);assert.equal(s.speaker,original.speaker);
  }
 }
 const p12=b.paragraphs.find(p=>p.id==='p_12');
 assert.match(p12.reading,/一加一等於二/);assert.match(p12.reading,/自性空就忘掉/);
 assert.doesNotMatch(p12.reading,/四大宗派|故意讓自己墮入/);
 assert.ok(b.corrections.length>0);
});
test('unknowns remain pending; no theological speaker replacement',()=>{
 const b=buildVerbatimRebuild(bytes,plan);
 const s=b.paragraphs.flatMap(p=>p.utterances).find(s=>s.id==='p27-v6');
 assert.match(s.text,/應成派/);assert.equal(s.reviewNeeded,true);assert.equal(s.humanListened,false);
 assert.equal(b.status,'candidate-needs-audio-review');
});
test('word searching and trial pronunciations are not silently unified',()=>{
 const b=buildVerbatimRebuild(bytes,plan),all=b.paragraphs.flatMap(p=>p.utterances);
 for(const [id,term] of [['p4-v5','知業末節'],['p4-v6','智慧末節'],['p4-v7','知為末節']]){
  const s=all.find(s=>s.id===id);assert.ok(s.text.includes(term));assert.equal(s.reviewNeeded,true);
  assert.ok(s.pending.some(x=>x.includes('找詞')));
 }
});
test('stale source or unmatched correction fails closed',()=>{
 assert.throws(()=>buildVerbatimRebuild(Buffer.from('{}'),plan),/digest/);
 const bad=structuredClone(plan);bad.corrections[0].from='not present';
 assert.throws(()=>buildVerbatimRebuild(bytes,bad),/match/);
});
test('HTML distinguishes raw, corrected, warnings, and escaping',()=>{
 const b=buildVerbatimRebuild(bytes,plan);const html=renderVerbatimRebuild(b);
 assert.match(html,/校字後課堂原話/);assert.match(html,/原始 ASR/);assert.match(html,/尚未人工聽核/);
 assert.equal((html.match(/data-paragraph=/g)||[]).length,30);
 const changed=structuredClone(b);changed.paragraphs[0].heading='<script>alert(1)</script>';
 assert.doesNotMatch(renderVerbatimRebuild(changed),/<script>/);
});
