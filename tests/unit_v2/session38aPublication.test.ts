import {it,expect} from 'vitest';
import fs from 'node:fs';
import {formatTranscriptText} from '../../src/composables/useExportTranscript';
it('38A actual reader export includes the publication notice, current study-guide timestamps, and final sentence',()=>{
 const root='courses/入中論善顯密意疏/';
 const session=JSON.parse(fs.readFileSync(root+'sessions/session_38A.json','utf8'));
 const catalog=JSON.parse(fs.readFileSync(root+'course.json','utf8')).sessions.find((s:any)=>s.sessionId==='38A');
 expect(catalog.transcriptStatus).toBe('review-ready');
 const text=formatTranscriptText({courseTitle:'入中論善顯密意疏',sessionId:'38A',sessionTitle:session.title,transcriptStatus:catalog.transcriptStatus,readerNotice:session.qualityReview.readerNotice},session.paragraphs);
 expect(text.indexOf('待閱校版')).toBeLessThan(text.indexOf('[00:00:02]'));
 expect(text.match(/^\[\d\d:\d\d:\d\d\]/gm)).toHaveLength(session.paragraphs.flatMap((p:any)=>p.sentences).length);
 expect(text).toContain('如果瓶子有自性');expect(session.paragraphs.flatMap((p:any)=>p.verbatimSentences).some((r:any)=>r.text.includes('中觀自續派，中觀自續派的話'))).toBe(true);
 expect(text).toContain('我們先休息一下吧');expect(text).not.toContain('[REVIEW:');
});
