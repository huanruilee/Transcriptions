import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from '../../src/App.vue';
import { readFileSync } from 'node:fs';

const wrappers: any[] = [];
async function open() {
  setActivePinia(createPinia());
  const wrapper = mount(App);
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
const player = (w: any) => w.get('.youtube-player-container');
const toggle = (w: any) => w.get('#video-visibility-toggle');
beforeEach(() => {
  localStorage.clear();
  (window as any).YT = { Player: vi.fn(function () { return { cueVideoById: vi.fn(), getDuration: () => 1200, getCurrentTime: () => 10, getIframe: () => document.querySelector('#youtube-iframe') }; }) };
  window.history.replaceState({}, '', '/?course=shi-liang-lun-er#session-31');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () =>
    url.endsWith('/course.json') ? { sessions: [{ sessionId: '31' }, { sessionId: '32' }] } :
    url.endsWith('/toc.json') ? { nodes: [] } : { youtubeVideoId: 'rlbTRYGbwIM', paragraphs: [] }
  })));
});
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.unstubAllGlobals(); });

describe('Mini Player BDD acceptance patterns', () => {
  it('Given floating video, When hide is clicked, Then keep the same iframe and expose Show video', async () => {
    const w = await open();
    const iframe = w.get('#youtube-iframe').element;
    const src = iframe.getAttribute('src');
    window.dispatchEvent(new Event('scroll'));
    await w.get('[data-testid="hide-video"]').trigger('click');
    expect(player(w).classes()).toContain('audio-only-hidden');
    expect(toggle(w).text()).toBe('📺 顯示影片');
    expect(w.get('#youtube-iframe').element).toBe(iframe);
    expect(iframe.getAttribute('src')).toBe(src);
  });
  it('Given audio-only, When bottom Show video is clicked, Then restore the same player', async () => {
    const w = await open();
    await toggle(w).trigger('click');
    expect(player(w).classes()).toContain('audio-only-hidden');
    await toggle(w).trigger('click');
    expect(player(w).classes()).not.toContain('audio-only-hidden');
    expect(toggle(w).text()).toBe('📺 隱藏影片');
    expect(toggle(w).element.previousElementSibling?.id).toBe('playback-rate-btn');
    expect(toggle(w).element.nextElementSibling?.id).toBe('toc-drawer-trigger');
  });
  it('Given visible floating video, When dock is clicked, Then use bottom-left docking', async () => {
    const w = await open();
    await w.get('[data-testid="dock-video"]').trigger('click');
    expect(player(w).classes()).toContain('dock-bottom-left');
    expect(w.get('[data-testid="dock-video"]').text()).toContain('移至右上');
  });
  it('Given saved hidden/docked preferences, When reloading or changing lecture, Then retain both', async () => {
    let w = await open();
    await w.get('[data-testid="dock-video"]').trigger('click');
    await toggle(w).trigger('click');
    w.unmount(); wrappers.pop();
    w = await open();
    expect(player(w).classes()).toEqual(expect.arrayContaining(['audio-only-hidden', 'dock-bottom-left']));
    window.location.hash = '#session-32';
    window.dispatchEvent(new Event('hashchange'));
    await flushPromises();
    expect(player(w).classes()).toEqual(expect.arrayContaining(['audio-only-hidden', 'dock-bottom-left']));
    await toggle(w).trigger('click');
    expect(player(w).classes()).toContain('dock-bottom-left');
  });
  it('CSS contract: hide without display/visibility suppression; desktop dock reserves reader space', () => {
    const source = readFileSync('src/App.vue', 'utf8');
    const rule = source.match(/\.audio-only-hidden\s*\{([^}]+)\}/)?.[1] || '';
    for (const declaration of ['opacity: 0 !important', 'pointer-events: none !important', 'width: 1px !important', 'height: 1px !important', 'overflow: hidden !important']) expect(rule).toContain(declaration);
    expect(rule).not.toMatch(/display\s*:|visibility\s*:/);
    expect(source).toContain('mini-player-docked');
    expect(source).toContain('@media (min-width: 1025px)');
  });
});
