import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const course='courses/入中論善顯密意疏/';
test('01 publishes a 35A-style study guide with complete source track and evidence-bound timing',()=>{
 const s=JSON.parse(fs.readFileSync(course+'sessions/session_01.json'));assert.equal(s.readingEdition,'study-guide');assert.equal(s.sourceOutlineId,'01');
 const ps=s.paragraphs,rows=ps.flatMap(p=>p.sentences);assert.ok(ps.length>=20&&ps.length<=35);assert.ok(rows.length/ps.length>=1.5);assert.ok(rows.length<346);
 const original=JSON.parse(fs.readFileSync('reviews/evidence/ruzhong01-study/source-session.json'));const raw=ps.flatMap(p=>p.verbatimSentences);assert.deepEqual(raw.map(r=>r.id),original.paragraphs.flatMap(p=>p.sentences).map(r=>r.id));assert.deepEqual(raw.map(r=>r.text),original.paragraphs.flatMap(p=>p.sentences).map(r=>r.text));
 const byId=new Map(raw.map(r=>[r.id,r]));for(const [i,r] of rows.entries()){assert.ok(r.sourceSentenceIds.length);assert.equal(r.start,byId.get(r.sourceSentenceIds[0]).start);assert.equal(r.end,byId.get(r.sourceSentenceIds.at(-1)).end);assert.equal(r.timingMethod,'source-window');if(i)assert.ok(r.start>=rows[i-1].end);}
 const outline=JSON.parse(fs.readFileSync(course+'source_outlines/01.json'));assert.ok(outline.discussionOutline.length>=4);assert.ok(outline.courseOutline.length>=8);
 const md=fs.readFileSync(course+'publications/lecture_01_study_guide.md','utf8');for(const word of ['本講宗旨提要','義理研讀綱要','重點法相辨析','課後思考與研討問題','下棋','三十七','四諦','順逆','待閱校','未逐句聽核'])assert.ok(md.includes(word),word);
 assert.ok(md.includes('老師')&&md.includes('同學'));assert.match(s.qualityReview.readerNotice,/研讀講記/);assert.equal(s.qualityReview.humanListened,false);assert.match(s.qualityReview.readerNotice,/來源區間/);assert.ok(rows.at(-1).text.includes('謝謝大家'));
});

test('01 study rebuild rejects source drift, missing or duplicated source ranges',async()=>{
 const{buildStudy}=await import('../../scripts/publish_ruzhong01_study.mjs');const raw=fs.readFileSync('reviews/evidence/ruzhong01-study/source-session.json','utf8'),plan=JSON.parse(fs.readFileSync('reviews/evidence/ruzhong01-study/plan.json'));
 const result=buildStudy(raw,plan);assert.deepEqual(result.session.paragraphs,JSON.parse(fs.readFileSync(course+'sessions/session_01.json')).paragraphs);assert.throws(()=>buildStudy(raw+' ',plan));
 for(const first of [1,-1,346]){const p=structuredClone(plan);p.paragraphs[0].sentences[0].first=first;assert.throws(()=>buildStudy(raw,p));}
 const p=structuredClone(plan);p.paragraphs.pop();assert.throws(()=>buildStudy(raw,p));
 const s=result.session,normal=t=>t.replace(/[^\p{L}\p{N}]/gu,'');const page=fs.readFileSync(course+'source_text/page_006.txt','utf8');const verse=page.split('釋第一勝義菩提心之一')[1].split('今依月稱')[0];assert.ok(normal(s.paragraphs[1].sentences.map(r=>r.text).join('')).includes(normal(verse)));assert.match(s.paragraphs[1].sentences[0].text,/底本.*不代表.*聽核/);
});

test('study-guide editorial overview is attributed honestly and cannot bypass evidence binding',async()=>{
 const{validateContentOverview}=await import('../../scripts/content_overview_pipeline.mjs');const s=JSON.parse(fs.readFileSync(course+'sessions/session_01.json'));const options={sourceTranscriptId:'ru-zhong-lun/session_01'};
 assert.deepEqual(validateContentOverview(s.contentOverview,s,options).errors,[]);
 const bad=structuredClone(s);bad.contentOverview.editorialSourceDigest='sha256:wrong';assert.ok(validateContentOverview(bad.contentOverview,bad,options).errors.some(e=>e.code==='GENERATOR_MISMATCH'));
 const legacy=structuredClone(s);delete legacy.readingEdition;assert.ok(validateContentOverview(legacy.contentOverview,legacy,options).errors.some(e=>e.code==='GENERATOR_MISMATCH'));
});
