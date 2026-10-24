import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyReadingApproval,readingContentDigest,renderRebuild} from '../../scripts/shiliang_verbatim_rebuild.mjs';
const source=JSON.parse(fs.readFileSync('courses/釋量論第二品/publications/lecture_30_verbatim_rebuild.json'));
const approval={sessionId:'30',type:'reading-only',approvedBy:'Henry',approvedAt:'2026-10-24',userStatement:'30 31 講看完，可以上線了',sourceDigest:source.sourceDigest,contentDigest:readingContentDigest(source),humanListened:false};
test('reading approval changes publication status, never transcript or listening claims',()=>{
 const next=applyReadingApproval(source,approval);
 assert.equal(next.status,'reading-approved');assert.equal(next.humanListened,false);
 assert.deepEqual(next.sections,source.sections);assert.deepEqual(next.ledger,source.ledger);
 const html=renderRebuild(next);assert.match(html,/已閱讀確認/);assert.match(html,/原稿重整正式版/);assert.doesNotMatch(html,/本版未取代正式閱讀器/);
});
test('approval is version bound and cannot authorize altered content or audio confirmation',()=>{
 const changed=structuredClone(source);changed.sections[0].sentences[0].text+='修改';
 assert.throws(()=>applyReadingApproval(changed,approval));
 for(const patch of [{sourceDigest:'bad'},{sessionId:'31'},{humanListened:true},{type:'audio-listened'},{contentDigest:'bad'}])assert.throws(()=>applyReadingApproval(source,{...approval,...patch}));
});
