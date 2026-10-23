import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPreview} from '../../scripts/render_session37a_preview.mjs';
const root=new URL('../../',import.meta.url);
const source=fs.readFileSync(new URL('courses/入中論善顯密意疏/sessions/session_37A.json',root));
const report=JSON.parse(fs.readFileSync(new URL('reviews/evidence/session37a-efficient-pilot/codex-direct-review.json',root)));
test('preview is separate, escaped and visibly not accepted',()=>{
 const original=source.toString();const html=renderPreview(source,report);
 assert.match(html,/尚未人工聽核/);assert.match(html,/非正式定稿/);
 assert.equal((html.match(/data-paragraph=/g)||[]).length,30);
 assert.equal((html.match(/data-proposal=/g)||[]).length,13);
 assert.match(html,/故不繁贅/);assert.match(html,/p27-v6/);
 assert.doesNotMatch(html,/<script|fetch\(|localStorage/);
 assert.equal(source.toString(),original);
 const changed=structuredClone(report);changed.proposals[0].proposal='<img src=x onerror=alert(1)>';
 const escaped=renderPreview(source,changed);assert.match(escaped,/&lt;img/);assert.doesNotMatch(escaped,/<img/);
});
test('stale source and missing paragraph review fail closed',()=>{
 assert.throws(()=>renderPreview(Buffer.from('{}'),report),/digest/);
 const bad=structuredClone(report);bad.paragraphs.pop();assert.throws(()=>renderPreview(source,bad),/coverage/);
});
