import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import fs from 'node:fs';
import App from '../../src/App.vue';
import {formatTranscriptText} from '../../src/composables/useExportTranscript';
import {projectApprovedRebuild} from '../../src/utils/approvedRebuildReader.js';
const root='courses/釋量論第二品/';
const raw=fs.readFileSync(root+'sessions/session_30.json','utf8');
const rebuild=JSON.parse(fs.readFileSync(root+'publications/lecture_30_verbatim_rebuild.json','utf8'));
it('loads the approved rebuild through actual course metadata into the main reader',async()=>{
 setActivePinia(createPinia());
 window.history.replaceState({},'', '/?course=shi-liang-lun-er#session-30');
 const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input:any)=>{
  const url=String(input);
  const file=url.includes('catalog') ? 'courses/catalog.json' : url.replace(/^\//,'');
  if(fs.existsSync(file)&&fs.statSync(file).isFile())return new Response(fs.readFileSync(file,'utf8'));
  return new Response('{}',{status:404});
 });
 const wrapper=mount(App);
 try{
  await flushPromises();
  await vi.waitFor(()=>expect(wrapper.findAll('.transcript-heading')).toHaveLength(10));
  expect(wrapper.findAll('.transcript-heading')[0].text()).toContain('前行');
  expect(wrapper.findAll('.transcript-heading')[1].text()).toContain('再次說明');
  expect(wrapper.text()).toContain('版面重整：2026-10-24');
  expect(wrapper.text()).toContain('本文已套用');
  expect(wrapper.text()).toContain('未逐句聽核');
  expect(wrapper.text()).toContain('好，我們今天的課就上到這個地方。');
 }finally{wrapper.unmount();mock.mockRestore();}
});
it('actual export keeps the reading notice, 546 timestamps, and final sentence',async()=>{
 const result=await projectApprovedRebuild(raw,rebuild);
 const text=formatTranscriptText({courseTitle:'釋量論第二品',sessionId:'30',sessionTitle:result.title,readerNotice:result.qualityReview.readerNotice},result.paragraphs);
 expect(text).toContain('未逐句聽核');
 expect(text.match(/^\[\d\d:\d\d:\d\d\]/gm)).toHaveLength(546);
 expect(text).toContain('好，我們今天的課就上到這個地方。');
});

for (const failure of ['404', 'network', 'stale-source', 'altered-content'] as const) {
 it(`visibly falls back to the original reader on ${failure}, without a false applied badge`,async()=>{
  setActivePinia(createPinia());
  window.history.replaceState({},'', '/?course=shi-liang-lun-er#session-30');
  const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input:any)=>{
   const url=String(input);
   if(url.endsWith('lecture_30_verbatim_rebuild.json')){
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
   expect(wrapper.findAll('.paragraph-block > .sentence')).toHaveLength(546);
   expect(wrapper.text()).toContain('好，我們今天的課就上到這個地方。');
   expect(wrapper.text()).not.toContain('本文已套用');
   expect(wrapper.find('.rebuild-tag').exists()).toBe(false);
   expect(wrapper.text()).not.toContain('未核定內容');
   expect(warn).toHaveBeenCalled();
  }finally{wrapper.unmount();mock.mockRestore();warn.mockRestore();}
 });
}
