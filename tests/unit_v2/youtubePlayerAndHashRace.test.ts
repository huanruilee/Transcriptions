import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useCourseStore } from '../../src/stores/course';
import App from '../../src/App.vue';

describe('YouTube Player & Hash Race Prevention Contract', () => {
  const originalFetch = global.fetch;
  let wrapper: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
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
    wrapper?.unmount();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete (window as any).YT;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. 網址帶有特定講次 (#session-02) 時，初次掛載不得被 Watcher 競態覆寫回第 1 講', async () => {
    delete (window as any).location;
    window.location = new URL('https://huanruilee.github.io/Transcriptions/?course=shi-liang-lun-er#session-02') as any;

    wrapper = mount(App);
    const courseStore = useCourseStore();

    await wrapper.vm.$nextTick();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(60);

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

    wrapper = mount(App);
    await wrapper.vm.$nextTick();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(150);

    const iframe = wrapper.find('#youtube-iframe');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(iframe.attributes('allow')).toContain('web-share');

    const testApi = (window as any).__TEST_API__;
    if (testApi && typeof testApi.loadSession === 'function') {
      await testApi.loadSession('03');
      await flushPromises();
      await vi.advanceTimersByTimeAsync(150);
      expect(destroySpy).not.toHaveBeenCalled();
    }
  });

  it('3. 在 YouTube 模式下原生 audio 標籤不加載 Google Drive 連結，避免 Format Error (Code 4)', async () => {
    delete (window as any).location;
    window.location = new URL('https://huanruilee.github.io/Transcriptions/?course=shi-liang-lun-er#session-02') as any;

    wrapper = mount(App);
    const courseStore = useCourseStore();
    courseStore.currentCourseId = 'shi-liang-lun-er';

    await wrapper.vm.$nextTick();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(60);

    const audioEl = wrapper.find('#audio-element').element as HTMLAudioElement;
    expect(audioEl.src.includes('drive.google.com')).toBe(false);
  });

  it('4. 待轉錄 YouTube 講次由 pendingSessions 顯示，不請求空的 session JSON', async () => {
    delete (window as any).location;
    window.location = new URL('https://huanruilee.github.io/Transcriptions/?course=shi-liang-lun-study-group-2025#session-42') as any;

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/course.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            sessions: [
              { sessionId: '41', displaySessionId: '26上', title: '第26講（上）' },
              { sessionId: '27B', displaySessionId: '27下', title: '第27講（下）' },
            ],
            pendingSessions: [
              {
                sessionId: '42',
                displaySessionId: '26下',
                title: '第26講 集諦與滅諦的行相（下）',
                status: 'not-transcribed',
                mediaType: 'video/youtube',
                youtubeVideoId: 'lBOiFeGQblw',
                youtubeUrl: 'https://www.youtube.com/watch?v=lBOiFeGQblw',
              },
              {
                sessionId: '43',
                displaySessionId: '27上',
                title: '第27講 空與無我的差異（上）',
                status: 'not-transcribed',
                mediaType: 'video/youtube',
                youtubeVideoId: '8sDCFUj5E_c',
                youtubeUrl: 'https://www.youtube.com/watch?v=8sDCFUj5E_c',
              },
            ],
          }),
        });
      }
      if (url.endsWith('/toc.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ nodes: [] }) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchMock as any;

    wrapper = mount(App);
    await wrapper.vm.$nextTick();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(80);

    expect(useCourseStore().sessions.map((session) => session.id)).toEqual(['41', '27B', '42', '43']);
    expect(wrapper.findAll('.session-id').map((node) => node.text())).toEqual([
      '26上',
      '26下',
      '27上',
      '27下',
    ]);
    expect(wrapper.find('.transcript-pending-notice').text()).toContain('逐字稿尚待製作');
    expect(wrapper.find('#youtube-iframe').attributes('src')).toContain('lBOiFeGQblw');
    const download = wrapper.find('#download-transcript-mobile-btn');
    expect(download.attributes('disabled')).toBeDefined();
    expect(download.attributes('title')).toBe('此講次尚無逐字稿可下載');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/sessions/session_42.json'))).toBe(false);
  });
});
