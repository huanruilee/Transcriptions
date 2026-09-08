import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from '../../src/App.vue';
import { usePlayerStore } from '../../src/stores/player';

let wrapper: any;
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Playback regressions', () => {
  it('clears stale highlights on rewind and session replacement', () => {
    setActivePinia(createPinia());
    const player = usePlayerStore();
    const sentences = [{ id: 'a', start_time: 18, end_time: 20, text: 'Opening' }];
    player.setSentences(sentences);
    player.updateTime(19);
    player.updateTime(0);
    expect(player.activeSentenceId).toBeNull();
    expect(player.activeSentenceIndex).toBe(-1);
    player.updateTime(19);
    player.setSentences([{ ...sentences[0], id: 'b' }]);
    expect(player.currentTime).toBe(0);
    expect(player.activeSentenceId).toBeNull();
  });

  it('waits for media ended and preserves iframe when toggling floating view', async () => {
    setActivePinia(createPinia());
    window.history.replaceState({}, '', '/?course=shi-liang-lun-er#session-28');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () =>
      url.includes('/sessions/') ? {
        youtubeVideoId: 'yzSUab52m-8',
        paragraphs: [{ id: 'p', sentences: [{ id: 's', start: 18, end: 20, text: 'Opening' }] }],
      } : { sessions: [{ sessionId: '28', title: 'Lesson 28' }, { sessionId: '29', title: 'Lesson 29' }] }
    })));
    wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.find('.end-of-session-card').exists()).toBe(false);
    const iframe = wrapper.find('#youtube-iframe').element;
    const toggle = wrapper.find('[data-testid="floating-video-toggle"]');
    expect(toggle.exists()).toBe(true);
    expect(wrapper.find('.youtube-player-container.is-floating').exists()).toBe(true);
    await toggle.trigger('click');
    expect(wrapper.find('.youtube-player-container.is-floating').exists()).toBe(false);
    expect(wrapper.find('#youtube-iframe').element).toBe(iframe);
    await toggle.trigger('click');
    expect(wrapper.find('.youtube-player-container.is-floating').exists()).toBe(true);
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.youtube.com', data: { event: 'onStateChange', info: 0 } }));
    await flushPromises();
    expect(wrapper.find('.end-of-session-card').exists()).toBe(false);
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://www.youtube.com', source: iframe.contentWindow, data: { event: 'onStateChange', info: 0 } }));
    await flushPromises();
    expect(wrapper.find('.end-of-session-card').exists()).toBe(true);
  });
});
