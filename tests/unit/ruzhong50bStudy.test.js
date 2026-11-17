import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root='courses/入中論善顯密意疏/';
const session=()=>JSON.parse(fs.readFileSync(root+'sessions/session_50B.json','utf8'));
const text=()=>fs.readFileSync(root+'publications/lecture_50B_study_guide.md','utf8');
test('50B reader provides a study edition and preserves every source sentence and timestamp',()=>{
 const s=session(), raw=JSON.parse(fs.readFileSync('reviews/evidence/ruzhong50b-study/source-session.json','utf8'));
 assert.equal(s.readingEdition,'study-guide');
 const old=raw.paragraphs.flatMap(p=>p.sentences), preserved=s.paragraphs.flatMap(p=>p.verbatimSentences||[]);
 assert.equal(preserved.length,old.length);
 for(let i=0;i<old.length;i++){assert.equal(preserved[i].id,`sent-${i}`);for(const k of ['text','start','end'])assert.equal(preserved[i][k],old[i][k]);}
 assert.equal(s.qualityReview.humanListened,false);
 assert.match(s.qualityReview.readerNotice,/未逐句|未逐句聽核/);
});
test('50B study guide retains self-correction and explicit uncertainty',()=>{
 const s=text();assert.match(s,/剛才.{0,12}(解釋錯|講錯|說錯)/);assert.match(s,/不知道|不清楚/);assert.match(s,/待核/);assert.match(s,/回憶/);assert.match(s,/推論|推度/);
});
test('50B study publication, outline and original text remain available',()=>{
 for(const ext of ['md','html','txt'])assert.ok(fs.existsSync(root+`publications/lecture_50B_study_guide.${ext}`));
 assert.ok(fs.existsSync(root+'source_outlines/50B.json'));
});
test('50B standalone guide is registered in the course manifest',()=>{
 const course=JSON.parse(fs.readFileSync(root+'course.json','utf8'));
 assert.ok(course.studyGuides?.includes('publications/lecture_50B_study_guide.html'));
});
test('self-reflection is mapped to the source sentences that contain it',()=>{
 const p=session().paragraphs;assert.ok(p[2].sentences[0].sourceSentenceIds.includes('sent-82'));assert.ok(p[3].sentences[0].sourceSentenceIds.includes('sent-83'));assert.doesNotMatch(p[3].sentences[0].sourceSentenceIds.join(','),/sent-82(?:,|$)/);
});
test('自宗不許自證目錄 points to the actual transition',()=>{
 const n=session().qualityReview.tocProjection.nodes.find(n=>n.title==='自宗不許自證亦有念生');assert.equal(n.sourceSentenceId,'sent-83');assert.equal(n.timestamp,574.3);
});
test('cross-page textbook excerpt preserves the beginning of 能取心',()=>{
 const s=text();assert.match(s,/第155–156頁跨頁補列[^。]*。由能取心領受餘所取境事/);
});
