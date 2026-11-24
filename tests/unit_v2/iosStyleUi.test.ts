import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from '../../src/App.vue';

// feat/ios-style-ui 契約：
// 1. 課程選擇頁＝iOS 主畫面風格圖示網格（每課有漸層圖示與說明），
//    右上角玻璃返回鈕可「回到上次閱讀」。
// 2. 閱讀頁右上角玻璃返回鈕可開啟課程選擇頁，並可從選擇頁還原原課程原講次。

let wrapper: any;

beforeEach(() => {
  setActivePinia(createPinia());
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubCourseFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes('/sessions/')
        ? {
            youtubeVideoId: 'yzSUab52m-8',
            paragraphs: [{ id: 'p', sentences: [{ id: 's', start: 18, end: 20, text: 'Opening' }] }],
          }
        : { sessions: [{ sessionId: '28', title: 'Lesson 28' }, { sessionId: '29', title: 'Lesson 29' }] },
  })));
}

describe('iOS 風格 UI（feat/ios-style-ui）', () => {
  it('課程選擇頁為圖示網格，玻璃返回鈕可回到最近觀看的課程', async () => {
    window.localStorage.setItem('szyd-recent-courses', JSON.stringify(['san-zhu-yao-dao']));
    stubCourseFetch();
    wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.find('#course-chooser').exists()).toBe(true);
    // 8 課＝8 個圖示磚，每磚都有漸層圖示
    expect(wrapper.findAll('.course-choice')).toHaveLength(8);
    expect(wrapper.findAll('.course-choice-icon')).toHaveLength(8);
    const firstIcon = wrapper.findAll('.course-choice-icon')[0];
    expect(firstIcon.attributes('style') || '').toContain('gradient');
    // 圖示磚保留課程說明（入中論 description）
    expect(wrapper.find('#course-chooser').text()).toContain('無自性空性正見');

    // 玻璃返回鈕：回到最近觀看課程並載入閱讀頁
    const back = wrapper.find('[data-testid="glass-back-chooser"]');
    expect(back.exists()).toBe(true);
    await back.trigger('click');
    await flushPromises();
    expect(wrapper.find('#course-chooser').exists()).toBe(false);
    expect(wrapper.find('.brand-title').text()).toContain('三主要道');
    expect(wrapper.find('#youtube-iframe').exists()).toBe(true);
  });

  it('閱讀頁玻璃返回鈕可開啟課程選擇頁，並從選擇頁還原原講次', async () => {
    window.history.replaceState({}, '', '/?course=shi-liang-lun-er#session-28');
    stubCourseFetch();
    wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.find('#course-chooser').exists()).toBe(false);
    const readerBack = wrapper.find('[data-testid="glass-back-reader"]');
    expect(readerBack.exists()).toBe(true);

    await readerBack.trigger('click');
    expect(wrapper.find('#course-chooser').exists()).toBe(true);
    expect(wrapper.find('.app-header').exists()).toBe(false);

    await wrapper.find('[data-testid="glass-back-chooser"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('#course-chooser').exists()).toBe(false);
    expect(wrapper.find('.brand-title').text()).toContain('釋量論第二品');
    expect(wrapper.find('#youtube-iframe').exists()).toBe(true);
  });
});
