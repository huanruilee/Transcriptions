import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import App from '../../src/App.vue';
for (const pending of [false,true]) it(`${pending?'pending':'published'}: does not recreate a YouTube polling interval when delayed setup outlives the reader`,async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval']});
 setActivePinia(createPinia());window.history.replaceState({},'',`/?course=shi-liang-lun-er#session-${pending?'99':'31'}`);
 const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input:any)=>{const u=String(input);if(pending&&u.endsWith('/course.json'))return new Response(JSON.stringify({sessions:[],pendingSessions:[{sessionId:'99',title:'待校講次',mediaType:'video/youtube',youtubeVideoId:'f2eRxEqCsZA'}]}));const f=u.includes('catalog')?'courses/catalog.json':u.replace(/^\//,'');return fs.existsSync(f)&&fs.statSync(f).isFile()?new Response(fs.readFileSync(f,'utf8')):new Response('{}',{status:404});});
 const wrapper=mount(App);let unmounted=false;
 try{for(let i=0;i<100&&!(pending?wrapper.find('#youtube-iframe').exists():wrapper.findAll('.paragraph-block').length);i++){await flushPromises();await delay(10);}expect(pending?wrapper.find('#youtube-iframe').exists():wrapper.findAll('.paragraph-block').length>0).toBe(true);wrapper.unmount();unmounted=true;const intervals=vi.spyOn(globalThis,'setInterval');await vi.advanceTimersByTimeAsync(500);expect(intervals).not.toHaveBeenCalled();intervals.mockRestore();}
 finally{if(!unmounted)wrapper.unmount();mock.mockRestore();vi.clearAllTimers();vi.useRealTimers();}
});
