import { it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'node:fs';
import App from '../../src/App.vue';
import { useAnnotationStore } from '../../src/stores/annotation';

afterEach(()=>vi.restoreAllMocks());

// Command routing uses the published overlay when present; acoustic acceptance is tested separately.
for (const sid of ['30','31']) for (const rapid of [false,true]) {
  it(`session ${sid} ${rapid?'rapidly routes different':'routes'} clicked approved sentence IDs to the same video and exact stored seconds`, async()=>{
    const settings=(window as any).happyDOM.settings;
    const oldIframe=settings.disableIframePageLoading, oldScripts=settings.disableJavaScriptFileLoading, oldSuccess=settings.handleDisabledFileLoadingAsSuccess;
    settings.disableIframePageLoading=true;settings.disableJavaScriptFileLoading=true;settings.handleDisabledFileLoadingAsSuccess=true;
    const frameWindow={postMessage:vi.fn()};
    vi.spyOn(HTMLIFrameElement.prototype,'contentWindow','get').mockReturnValue(frameWindow as unknown as Window);
    const pinia=createPinia();setActivePinia(pinia);
    const annotation=useAnnotationStore(pinia);
    window.history.replaceState({},'',`/?course=shi-liang-lun-er#session-${sid}`);
    const source=JSON.parse(fs.readFileSync(`courses/釋量論第二品/sessions/session_${sid}.json`,'utf8'));
    const timing=JSON.parse(fs.readFileSync(`courses/釋量論第二品/publications/lecture_${sid}_timing_overlay.json`,'utf8'));
    const rows=source.paragraphs.flatMap((p:any)=>p.sentences).map((s:any)=>({...s,...(timing.items.find((r:any)=>r.id===s.id)||{})}));
    const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async(input:any)=>{
      const url=String(input);const file=url.includes('catalog')?'courses/catalog.json':url.replace(/^\//,'');
      return fs.existsSync(file)&&fs.statSync(file).isFile()?new Response(fs.readFileSync(file,'utf8')):new Response('{}',{status:404});
    });
    let now=100000;const time=vi.spyOn(Date,'now').mockImplementation(()=>now);
    const wrapper=mount(App,{attachTo:document.body,global:{plugins:[pinia]}});
    try {
      await flushPromises();
      await vi.waitFor(()=>expect(wrapper.findAll('.paragraph-block > .sentence')).toHaveLength(rows.length));
      for (const index of [0,8,34,Math.floor(rows.length/2),rows.length-1]) {
        const row=rows[index];now+=rapid?100:1000;
        const win=(wrapper.find('#youtube-iframe').element as HTMLIFrameElement).contentWindow!;
        const post=vi.spyOn(win,'postMessage');
        const sentence=wrapper.find(`.paragraph-block > .sentence[id="${row.id}"]`);
        const child=sentence.find('span');
        await (child.exists()?child:sentence).trigger('click');
        await flushPromises();
        const url=new URL(wrapper.find('#youtube-iframe').attributes('src'));
        expect(url.pathname).toBe(`/embed/${source.youtubeVideoId}`);
        expect(Number(url.searchParams.get('start'))).toBe(Math.floor(row.start));
        const commands=post.mock.calls.map(([value])=>typeof value==='string'?JSON.parse(value):value).filter(value=>value?.func==='seekTo');
        expect(commands.at(-1)?.args).toEqual([row.start,true]);
        post.mockRestore();
        expect(annotation.isEditorOpen).toBe(false);
      }
      // The same sentence still supports double-click editing.
      const last=rows.at(-1); now+=100;
      await wrapper.find(`.sentence[id="${last.id}"]`).trigger('click');
      expect(annotation.isEditorOpen).toBe(true);
    } finally {wrapper.unmount();fetchMock.mockRestore();time.mockRestore();settings.disableIframePageLoading=oldIframe;settings.disableJavaScriptFileLoading=oldScripts;settings.handleDisabledFileLoadingAsSuccess=oldSuccess;}
  });
}
