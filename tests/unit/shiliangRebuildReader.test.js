import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectApprovedRebuild } from '../../src/utils/approvedRebuildReader.js';
const raw=fs.readFileSync('courses/釋量論第二品/sessions/session_30.json','utf8');
const rebuild=JSON.parse(fs.readFileSync('courses/釋量論第二品/publications/lecture_30_verbatim_rebuild.json'));
test('main reader uses approved headings and continuous paragraphs while preserving every source sentence',async()=>{
 const before=JSON.parse(raw), result=await projectApprovedRebuild(raw,rebuild);
 assert.deepEqual(result.paragraphs.flatMap(p=>p.sentences),before.paragraphs.flatMap(p=>p.sentences));
 assert.deepEqual(result.paragraphs.filter(p=>p.heading).map(p=>p.heading),rebuild.sections.map(s=>s.heading));
 assert.equal(result.paragraphs[0].sentences.length,3);
 assert.equal(result.paragraphs[1].sentences[0].id,'sent-4');
 assert.equal(result.paragraphs.at(-1).sentences.at(-1).id,'sent-546');
 assert.equal(result.lastUpdated,before.lastUpdated);
 assert.match(result.qualityReview.readerNotice,/已閱讀確認.*未逐句聽核/);
 assert.equal(result.readerRebuiltAt,'2026-10-24');
 assert.deepEqual(JSON.parse(raw),before);
});
test('rejects stale source, unapproved content, changed timing, and listening claims',async()=>{
 await assert.rejects(projectApprovedRebuild(raw+' ',rebuild));
 for(const mutate of [b=>b.status='candidate-needs-audio-review',b=>b.humanListened=true,b=>b.sections[0].sentences[0].start++,b=>b.sections[0].sentences[0].text+='變更',b=>b.sections[0].sentences.pop()]){
  const altered=structuredClone(rebuild);mutate(altered);
  await assert.rejects(projectApprovedRebuild(raw,altered));
 }
});

test('every published reading-approved rebuild in this course is the default main-reader body',async()=>{
 const root='courses/釋量論第二品/';
 const course=JSON.parse(fs.readFileSync(root+'course.json'));
 const approved=course.sessions.filter(s=>s.status==='published'&&s.sourceRebuildStatus==='reading-approved');
 assert.ok(approved.some(s=>s.sessionId==='31'),'session 31 must be covered');
 for(const session of approved){
  assert.equal(session.sourceRebuildInReader,true,`approved session ${session.sessionId} must render in the main reader`);
  const sourceText=fs.readFileSync(`${root}sessions/session_${session.sessionId}.json`,'utf8');
  const publication=JSON.parse(fs.readFileSync(`${root}publications/lecture_${session.sessionId}_verbatim_rebuild.json`));
  const result=await projectApprovedRebuild(sourceText,publication);
  const actual=result.paragraphs.flatMap(p=>p.sentences);
  const original=JSON.parse(sourceText).paragraphs.flatMap(p=>p.sentences);
  assert.deepEqual(actual.map(({text,...rest})=>rest),original.map(({text,...rest})=>rest));
  assert.deepEqual(actual.map(s=>s.text),publication.sections.flatMap(p=>p.sentences).map(s=>s.text));
  assert.deepEqual(result.paragraphs.filter(p=>p.heading).map(p=>p.heading),publication.sections.map(s=>s.heading));
 }
});
