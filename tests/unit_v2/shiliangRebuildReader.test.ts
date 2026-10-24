import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import fs from 'node:fs';
import App from '../../src/App.vue';
import {formatTranscriptText} from '../../src/composables/useExportTranscript';
import {projectApprovedRebuild} from '../../src/utils/approvedRebuildReader.js';
const root='courses/釋量論第二品/';
for (const sessionId of ['30','31']) {
const raw=fs.readFileSync(root+`sessions/session_${sessionId}.json`,'utf8');
const rebuild=JSON.parse(fs.readFileSync(root+`publications/lecture_${sessionId}_verbatim_rebuild.json`,'utf8'));
const expectedSentences=rebuild.sections.flatMap((p:any)=>p.sentences);
it(`session ${sessionId} loads the approved rebuild through actual course metadata into the main reader`,async()=>{
 setActivePinia(createPinia());
 window.history.replaceState({},'', `/?course=shi-liang-lun-er#session-${sessionId}`);
 const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input:any)=>{
  const url=String(input);
  const file=url.includes('catalog') ? 'courses/catalog.json' : url.replace(/^\//,'');
  if(fs.existsSync(file)&&fs.statSync(file).isFile())return new Response(fs.readFileSync(file,'utf8'));
  return new Response('{}',{status:404});
 });
 const wrapper=mount(App);
 try{
  await flushPromises();
  await vi.waitFor(()=>expect(wrapper.findAll('.transcript-heading')).toHaveLength(rebuild.sections.length));
  expect(wrapper.findAll('.transcript-heading')[0].text()).toContain('前行');
  expect(wrapper.findAll('.transcript-heading').map(h=>h.text())).toEqual(rebuild.sections.map((p:any)=>p.heading));
  expect(wrapper.findAll('.paragraph-block > .sentence').map(s=>({id:s.attributes('id'),text:s.text()}))).toEqual(expectedSentences.map((s:any)=>({id:s.id,text:s.text})));
  expect(wrapper.text()).toContain('版面重整：2026-10-24');
  expect(wrapper.text()).toContain('本文已套用');
  expect(wrapper.text()).toContain('未逐句聽核');
  expect(wrapper.text()).toContain(expectedSentences.at(-1).text);
 }finally{wrapper.unmount();mock.mockRestore();}
});
it(`session ${sessionId} export keeps the approved text, timestamps, and final sentence`,async()=>{
 const result=await projectApprovedRebuild(raw,rebuild);
 const text=formatTranscriptText({courseTitle:'釋量論第二品',sessionId,sessionTitle:result.title,readerNotice:result.qualityReview.readerNotice},result.paragraphs);
 expect(text).toContain('未逐句聽核');
 expect(text.match(/^\[\d\d:\d\d:\d\d\]/gm)).toHaveLength(expectedSentences.length);
 expect(text).toContain(expectedSentences.at(-1).text);
 for(const item of rebuild.ledger) expect(text).toContain(item.after);
});

for (const failure of ['404', 'network', 'stale-source', 'altered-content'] as const) {
 it(`session ${sessionId} visibly falls back on ${failure}, without a false applied badge`,async()=>{
  setActivePinia(createPinia());
  window.history.replaceState({},'', `/?course=shi-liang-lun-er#session-${sessionId}`);
  const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input:any)=>{
   const url=String(input);
   if(url.endsWith(`lecture_${sessionId}_verbatim_rebuild.json`)){
    if(failure==='404')return new Response('{}',{status:404});
    if(failure==='network')throw new TypeError('Network unavailable');
    const altered=structuredClone(rebuild);
    if(failure==='stale-source')altered.sourceDigest='sha256:stale';
    else altered.sections[0].sentences[0].text+='未核定內容';
    return new Response(JSON.stringify(altered));
   }
   const file=url.includes('catalog') ? 'courses/catalog.json' : url.replace(/^\//,'');
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return new Response(fs.readFileSync(file,'utf8'));
   return new Response('{}',{status:404});
  });
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const wrapper=mount(App);
  try{
   await flushPromises();
   await vi.waitFor(()=>expect(wrapper.find('.session-reader-notice').text()).toContain('目前顯示原稿'));
   expect(wrapper.findAll('.transcript-heading').map(h=>h.text())).toEqual(JSON.parse(raw).paragraphs.filter((p:any)=>p.heading).map((p:any)=>p.heading));
   expect(wrapper.findAll('.paragraph-block > .sentence')).toHaveLength(expectedSentences.length);
   expect(wrapper.text()).toContain(expectedSentences.at(-1).text);
   expect(wrapper.text()).not.toContain('本文已套用');
   expect(wrapper.find('.rebuild-tag').exists()).toBe(false);
   expect(wrapper.text()).not.toContain('未核定內容');
   expect(warn).toHaveBeenCalled();
  }finally{wrapper.unmount();mock.mockRestore();warn.mockRestore();}
 });
}

}
