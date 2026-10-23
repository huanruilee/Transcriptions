import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionDate, renderCorrectionDates } from '../../scripts/course_correction_dates.mjs';
test('only explicit valid transcript update dates are used',()=>{
 assert.equal(correctionDate({lastUpdated:'2026-10-23 12:30:00'}).value,'2026-10-23 12:30:00');
 assert.equal(correctionDate({_meta:{processed_at:'2026-09-04'}}).source,'_meta.processed_at');
 assert.equal(correctionDate({date:'2026-10-23',lastUpdated:'2026-02-30'}).value,'未記錄');
 assert.equal(correctionDate({}).value,'未記錄');
});
test('table is escaped, links back to course and does not claim listening approval',()=>{
 const html=renderCorrectionDates({courseId:'x',title:'<unsafe>'},[{id:'02A',title:'<script>',date:correctionDate({})}]);
 assert.match(html,/<table>/);assert.match(html,/未記錄/);assert.match(html,/不代表已人工聽核/);
 assert.match(html,/#session-02A/);assert.doesNotMatch(html,/<script>|<unsafe>/);
});
