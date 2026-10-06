import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import fs from 'node:fs';
import App from '../../src/App.vue';

// Exercise the real course/session JSON through App's actual fetch route.
describe('四念住 reader', () => {
  let wrapper: ReturnType<typeof mount> | undefined;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    wrapper?.unmount();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it.each(['', '#session-08'])('loads candidate text and navigation at %s', async (hash) => {
    window.history.replaceState({}, '', `/?course=si-nian-zhu${hash}`);
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname).replace(/^\//, '');
      requests.push(pathname);
      if (!pathname.startsWith('courses/四念住/') || !fs.existsSync(pathname)) return { ok: false, status: 404 };
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(pathname, 'utf8')) };
    }));
    wrapper = mount(App, { global: { plugins: [createPinia()] } });
    await flushPromises();
    const id = hash ? '08' : '01';
    const data = JSON.parse(fs.readFileSync(`courses/四念住/sessions/session_${id}.json`, 'utf8'));
    expect(requests).toContain(`courses/四念住/sessions/session_${id}.json`);
    expect(requests.some(p => p.includes('session_02A'))).toBe(false);
    expect(wrapper.findAll('.session-item')).toHaveLength(8);
    expect(wrapper.text()).toContain(data.paragraphs[0].sentences[0].text);
    expect(wrapper.text()).toContain('待審閱候選稿');
    expect(wrapper.text()).toContain('玅境長老');
    expect(wrapper.find('#youtube-iframe').attributes('src')).toContain(data.youtubeVideoId);
    expect(window.location.hash).toBe(`#session-${id}`);
  }, 15000); // Real 2,000-sentence fixtures need headroom under parallel CI load.
});
