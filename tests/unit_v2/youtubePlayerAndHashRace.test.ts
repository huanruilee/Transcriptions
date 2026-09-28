import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useCourseStore } from '../../src/stores/course';
import App from '../../src/App.vue';

describe('YouTube Player & Hash Race Prevention Contract', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('session')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            audioUrl: 'https://drive.google.com/uc?export=download&id=1Pi21V4m1zEzVuOLJ5Toko1dP5KbTvuW9',
            youtubeVideoId: 'rlbTRYGbwIM',
            paragraphs: [],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          sessions: [
            { sessionId: '01', title: '第01講' },
            { sessionId: '02', title: '第02講' },
          ],
        }),
      });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. 網址帶有特定講次 (#session-02) 時，初次掛載不得被 Watcher 競態覆寫回第 1 講', async () => {
    delete (window as any).location;
    window.location = new URL('https://huanruilee.github.io/Transcriptions/?course=shi-liang-lun-er#session-02') as any;

    const wrapper = mount(App);
    const courseStore = useCourseStore();

    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 60));

    expect(courseStore.currentCourseId).toBe('shi-liang-lun-er');
    expect(window.location.hash).toBe('#session-02');
  });

  it('2. YouTube 播放器容器必須保有 iframe 且不得被 destroy() 移除', async () => {
    delete (window as any).location;
    window.location = new URL('https://huanruilee.github.io/Transcriptions/?course=shi-liang-lun-er#session-02') as any;

    const cueVideoSpy = vi.fn();
    const destroySpy = vi.fn();
    (window as any).YT = {
      Player: vi.fn().mockImplementation((elementId, options) => {
        return {
          cueVideoById: cueVideoSpy,
          destroy: destroySpy,
          getDuration: () => 1200,
          getCurrentTime: () => 0,
          seekTo: vi.fn(),
          playVideo: vi.fn(),
          pauseVideo: vi.fn(),
          unMute: vi.fn(),
          getIframe: () => document.getElementById(elementId),
        };
      }),
    };

    const wrapper = mount(App);
    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 150));

    const iframe = wrapper.find('#youtube-iframe');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(iframe.attributes('allow')).toContain('web-share');

    const testApi = (window as any).__TEST_API__;
    if (testApi && typeof testApi.loadSession === 'function') {
      await testApi.loadSession('03');
      await new Promise((r) => setTimeout(r, 150));
      expect(destroySpy).not.toHaveBeenCalled();
    }
  });

  it('3. 在 YouTube 模式下原生 audio 標籤不加載 Google Drive 連結，避免 Format Error (Code 4)', async () => {
    delete (window as any).location;
    window.location = new URL('https://huanruilee.github.io/Transcriptions/?course=shi-liang-lun-er#session-02') as any;

    const wrapper = mount(App);
    const courseStore = useCourseStore();
    courseStore.currentCourseId = 'shi-liang-lun-er';

    await wrapper.vm.$nextTick();
    await new Promise((r) => setTimeout(r, 60));

    const audioEl = wrapper.find('#audio-element').element as HTMLAudioElement;
    expect(audioEl.src.includes('drive.google.com')).toBe(false);
  });
});
