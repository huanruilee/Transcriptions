import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from '../../src/App.vue';
import { usePlayerStore } from '../../src/stores/player';

let wrapper: ReturnType<typeof mount>;
const audioUrl = 'https://gx10-2887.tail378c21.ts.net:9443/audio/example.mp3';
const sessions = [
  { sessionId: '01', title: 'Video', mediaType: 'video/youtube', youtubeVideoId: 'abcdefghijk' },
  { sessionId: '27B', title: 'Audio', mediaType: 'audio/mp3', audioUrl },
];
let youtube: Record<string, any>;
let createPlayer: any;
let play: any;
let pause: any;
const api = () => (window as any).__TEST_API__;

beforeEach(() => {
  vi.useFakeTimers();
  // Keep an actual iframe/contentWindow while replacing the external document.
  const setAttribute = HTMLIFrameElement.prototype.setAttribute;
  vi.spyOn(HTMLIFrameElement.prototype, 'setAttribute').mockImplementation(function (name, value) {
    return setAttribute.call(this, name, name === 'src' ? 'about:blank' : value);
  });
  setActivePinia(createPinia());
  window.history.replaceState({}, '', '/?course=shi-liang-lun-study-group-2025#session-01');
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  youtube = Object.fromEntries(['seekTo', 'playVideo', 'pauseVideo', 'unMute', 'cueVideoById', 'setPlaybackRate'].map(k => [k, vi.fn()]));
  youtube.getIframe = () => document.getElementById('youtube-iframe');
  createPlayer = vi.fn(function () { return youtube; });
  vi.stubGlobal('YT', { Player: createPlayer });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/course.json')) return { ok: true, json: async () => ({ sessions }) };
    if (url.includes('/sessions/')) {
      const session = sessions.find(s => url.endsWith(`session_${s.sessionId}.json`))!;
      return { ok: true, json: async () => ({ ...session, paragraphs: [
        { id: 'p', sentences: [{ id: 'sentence', start: 18, end: 20, text: 'Example' }] },
      ] }) };
    }
    return { ok: true, json: async () => ({}) };
  }));
});
afterEach(() => {
  wrapper?.unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
async function open(session = '01') {
  window.history.replaceState({}, '', `/?course=shi-liang-lun-study-group-2025#session-${session}`);
  wrapper = mount(App, { attachTo: document.body });
  await flushPromises();
  await vi.advanceTimersByTimeAsync(210);
}

describe('App runtime media routing', () => {
  it('initializes YouTube and routes sentence clicks, toggles and speed to its API', async () => {
    await open();
    expect(createPlayer).toHaveBeenCalled();
    const post = vi.spyOn((wrapper.get('#youtube-iframe').element as HTMLIFrameElement).contentWindow!, 'postMessage');
    await wrapper.get('#sentence').trigger('click');
    expect(youtube.seekTo).toHaveBeenCalledWith(18, true);
    expect(youtube.playVideo).toHaveBeenCalled();
    expect(post.mock.calls.some(([value]) => JSON.parse(value as string).func === 'seekTo')).toBe(true);
    expect(play).not.toHaveBeenCalled();
    await wrapper.get('#media-play-toggle-btn').trigger('click');
    expect(youtube.pauseVideo).toHaveBeenCalled();
    await wrapper.get('#media-play-toggle-btn').trigger('click');
    expect(youtube.playVideo).toHaveBeenCalledTimes(2);
    usePlayerStore().playbackRate = 1.5;
    await flushPromises();
    expect(youtube.setPlaybackRate).toHaveBeenCalledWith(1.5);
  });

  it('loads MP3 and routes a sentence seek through real metadata readiness', async () => {
    await open('27B');
    const audio = wrapper.get('#audio-element').element as HTMLAudioElement;
    expect(audio.src).toBe(audioUrl);
    expect(createPlayer).not.toHaveBeenCalled();
    Object.defineProperty(audio, 'readyState', { configurable: true, value: 0 });
    await wrapper.get('#sentence').trigger('click');
    expect(play).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('音檔載入中');
    audio.dispatchEvent(new Event('loadedmetadata'));
    await flushPromises();
    expect(audio.currentTime).toBe(18);
    expect(play).toHaveBeenCalledOnce();
    expect(wrapper.text()).not.toContain('音檔載入中');
    // Exercise the same functions used by global keyboard playback controls.
    (wrapper.vm as any).playMedia();
    await flushPromises();
    expect(play).toHaveBeenCalledTimes(2);
    pause.mockClear();
    (wrapper.vm as any).pauseMedia();
    expect(pause).toHaveBeenCalledOnce();
    usePlayerStore().playbackRate = 1.5;
    await flushPromises();
    expect(audio.playbackRate).toBe(1.5);
  });

  it('recomputes media routing when switching MP3 -> YouTube -> MP3', async () => {
    await open('27B');
    await api().loadSession('01');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(210);
    const audio = wrapper.get('#audio-element').element as HTMLAudioElement;
    expect(audio.hasAttribute('src')).toBe(false);
    expect(createPlayer).toHaveBeenCalled();
    await wrapper.get('#sentence').trigger('click');
    expect(youtube.seekTo).toHaveBeenCalledWith(18, true);
    youtube.seekTo.mockClear();
    await api().loadSession('27B');
    await flushPromises();
    expect(audio.src).toBe(audioUrl);
    await vi.advanceTimersByTimeAsync(500);
    Object.defineProperty(audio, 'readyState', { configurable: true, value: 1 });
    await wrapper.get('#sentence').trigger('click');
    expect(play).toHaveBeenCalled();
    expect(youtube.seekTo).not.toHaveBeenCalled();
  });

  it('explains private audio access to public visitors while keeping the transcript usable', async () => {
    await open('27B');
    expect(wrapper.text()).toContain('限內部網路預覽');
    await wrapper.get('#audio-element').trigger('error');
    expect(wrapper.get('[role="alert"]').text()).toContain('仍可閱讀逐字稿');
    expect(wrapper.get('#sentence').text()).toBe('Example');
    await api().loadSession('01');
    await flushPromises();
    expect(wrapper.find('.audio-access-notice').exists()).toBe(false);
  });
});
