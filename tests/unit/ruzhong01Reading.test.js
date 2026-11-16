import test from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs';
import {execFileSync} from 'node:child_process';
import {buildReading} from '../../scripts/publish_ruzhong01_reading.mjs';
const root='reviews/evidence/ruzhong01-standard/';
test('01 source-bound rebuild preserves all 346 source sentences and marks actual scope',()=>{
 const raw=fs.readFileSync(root+'original-session_01.json','utf8'),plan=JSON.parse(fs.readFileSync(root+'plan.json')),words=fs.readFileSync(root+'words.json','utf8');
 const result=buildReading(raw,plan,words),original=JSON.parse(raw).paragraphs.flatMap(p=>p.sentences),rows=result.session.paragraphs.flatMap(p=>p.sentences);
 assert.equal(rows.length,346);assert.deepEqual(rows.map(s=>s.rawText),original.map(s=>s.text));assert.equal(new Set(rows.map(s=>s.id)).size,346);assert.deepEqual(rows.map(s=>s.id),rows.map((s,i)=>'sent-'+i));
 assert.equal(result.session.qualityReview.humanListened,false);assert.match(result.session.qualityReview.readerNotice,/待閱校/);assert.notEqual(result.session._meta.status,'APPROVED');
 assert.deepEqual(rows.map(s=>s.id),result.ledger.items.map(s=>s.id));
 for(let i=0;i<rows.length;i++){assert.ok(Math.abs(rows[i].start-original[i].start)<=.5);assert.ok(Math.abs(rows[i].end-original[i].end)<=.5);if(i)assert.ok(rows[i].start>=rows[i-1].end);}
 assert.equal(result.ledger.selectedAcousticReplay.ok,true);
 const byLocator=new Map(result.ledger.items.map(r=>[r.sourceLocator,r]));const norm=t=>t.replace(/[^\p{L}\p{N}]/gu,'');for(const id of ['p7-s1','p98-s1','p157-s1','p157-s2','p165-s2'])assert.equal(norm(byLocator.get(id).after.text),norm(byLocator.get(id).original.text));assert.equal(byLocator.get('p165-s2').after.text.split('這個是第一了').length-1,2);assert.match(byLocator.get('p149-s2').after.text,/四諦/);assert.match(byLocator.get('p151-s2').after.text,/四諦/);assert.equal(rows[169].rawText,original[169].text);
 assert.throws(()=>buildReading(raw+' ',plan,words));assert.throws(()=>buildReading(raw,plan,words+' '));
 const bad=structuredClone(plan);bad.corrections.push({id:'unknown',from:'錯',to:'對',reason:'test'});assert.throws(()=>buildReading(raw,bad,words));
 const before=JSON.parse(raw).paragraphs[0].sentences[0].text;const rewrite=structuredClone(plan);rewrite.corrections.push({id:'p1-s1',from:before,to:'刪掉原話',reason:'test'});assert.throws(()=>buildReading(raw,rewrite,words));
});

test('01 keeps grounding pageRange parser-compatible and additional references separate',()=>{
 const metadata=JSON.parse(fs.readFileSync('courses/入中論善顯密意疏/course.json'));
 const item=metadata.sessions.find(s=>s.sessionId==='01');
 assert.equal(item.pageRange,'p.63–64');
 assert.deepEqual(item.additionalReferencePages,[6,60,61]);
 const parsed=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts/lib');from session_prompt import parse_page_range,window_pages;print(json.dumps({'range':parse_page_range(sys.argv[1]),'pages':window_pages(sys.argv[1])}))",item.pageRange],{encoding:'utf8'}));
 assert.deepEqual(parsed.range,[63,64]);for(const page of [60,61,63,64])assert.ok(parsed.pages.includes(page));
});
