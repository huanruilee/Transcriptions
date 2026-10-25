import {it,expect} from 'vitest';import fs from 'node:fs';import{createHash}from'node:crypto';
import {projectApprovedRebuild} from '../../src/utils/approvedRebuildReader.js';
import {applyTimingOverlay} from '../../src/utils/audioCalibrationOverlay.js';
const root='courses/釋量論第二品/';
for(const sid of ['30','31'])it(`session ${sid}: source-bound partial timing publication preserves text and rejects tampering`,async()=>{
 const raw=fs.readFileSync(root+`sessions/session_${sid}.json`,'utf8'),publication=fs.readFileSync(root+`publications/lecture_${sid}_verbatim_rebuild.json`,'utf8');
 const reading=await projectApprovedRebuild(raw,JSON.parse(publication)),overlay=JSON.parse(fs.readFileSync(root+`publications/lecture_${sid}_timing_overlay.json`,'utf8'));
 const overlayText=JSON.stringify(overlay),digest='sha256:'+createHash('sha256').update(overlayText).digest('hex');
 const result=await applyTimingOverlay(reading,raw,publication,overlayText,digest);
 expect(result.paragraphs.flatMap(p=>p.sentences.map(s=>[s.id,s.text]))).toEqual(reading.paragraphs.flatMap(p=>p.sentences.map(s=>[s.id,s.text])));
 for(const item of overlay.items)expect(result.paragraphs.flatMap(p=>p.sentences).find(s=>s.id===item.id).start).toBe(item.start);
 expect(overlay.items.length).toBeGreaterThan(0);expect(result.qualityReview.readerNotice).toContain('0.5 秒');expect(result.qualityReview.readerNotice).toContain('未逐句聽核');
 const bad=structuredClone(overlay);bad.items[0].start+=1;await expect(applyTimingOverlay(reading,raw,publication,JSON.stringify(bad),digest)).rejects.toThrow();
 await expect(applyTimingOverlay(reading,raw+' ',publication,overlayText,digest)).rejects.toThrow();
 const shifted=structuredClone(overlay);shifted.items[0].start+=0.1;shifted.items[0].audioStart+=0.1;await expect(applyTimingOverlay(reading,raw,publication,JSON.stringify(shifted),digest)).rejects.toThrow('digest');
 const dup=structuredClone(overlay);dup.items.push(dup.items[0]);await expect(applyTimingOverlay(reading,raw,publication,JSON.stringify(dup),digest)).rejects.toThrow();
});
