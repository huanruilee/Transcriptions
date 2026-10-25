import{it,expect}from'vitest';import{formatTranscriptText}from'../../src/composables/useExportTranscript';
it('explicit reading publication exports current corrected text while retaining old raw drawer',()=>{
 const p={id:'p_1',downloadTrack:'reading' as const,sentences:[{start:1,text:'這叫做訓釋。'}],verbatimSentences:[{start:1,text:'這叫做菩薩。',speaker:'未辨識'}]};const text=formatTranscriptText({courseTitle:'入中論',sessionId:'01',sessionTitle:'第01講'},[p]);expect(text).toContain('[00:00:01] 這叫做訓釋。');expect(text).not.toContain('菩薩');
 const legacy={...p,downloadTrack:undefined};expect(formatTranscriptText({courseTitle:'入中論',sessionId:'01',sessionTitle:'第01講'},[legacy])).toContain('這叫做菩薩。');
});
