import {it,expect} from 'vitest';import fs from 'node:fs';
import {projectApprovedRebuild} from '../../src/utils/approvedRebuildReader.js';
import {applyTimingOverlay} from '../../src/utils/audioCalibrationOverlay.js';
const root='courses/釋量論第二品/';
for(const sid of ['30','31'])it(`session ${sid}: source-bound partial timing publication preserves text and rejects tampering`,async()=>{
 const raw=fs.readFileSync(root+`sessions/session_${sid}.json`,'utf8'),publication=fs.readFileSync(root+`publications/lecture_${sid}_verbatim_rebuild.json`,'utf8');
 const reading=await projectApprovedRebuild(raw,JSON.parse(publication)),overlay=JSON.parse(fs.readFileSync(root+`publications/lecture_${sid}_timing_overlay.json`,'utf8'));
 const result=await applyTimingOverlay(reading,raw,publication,overlay);
 expect(result.paragraphs.flatMap(p=>p.sentences.map(s=>[s.id,s.text]))).toEqual(reading.paragraphs.flatMap(p=>p.sentences.map(s=>[s.id,s.text])));
 for(const item of overlay.items)expect(result.paragraphs.flatMap(p=>p.sentences).find(s=>s.id===item.id).start).toBe(item.start);
 expect(overlay.items.length).toBeGreaterThan(0);expect(result.qualityReview.readerNotice).toContain('0.5 秒');expect(result.qualityReview.readerNotice).toContain('未逐句聽核');
 const bad=structuredClone(overlay);bad.items[0].start+=1;await expect(applyTimingOverlay(reading,raw,publication,bad)).rejects.toThrow();
 await expect(applyTimingOverlay(reading,raw+' ',publication,overlay)).rejects.toThrow();
 const dup=structuredClone(overlay);dup.items.push(dup.items[0]);await expect(applyTimingOverlay(reading,raw,publication,dup)).rejects.toThrow();
});
