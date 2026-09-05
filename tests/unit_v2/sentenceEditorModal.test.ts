import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SentenceEditorModal from '../../src/components/modals/SentenceEditorModal.vue';
import { useAnnotationStore } from '../../src/stores/annotation';

describe('SentenceEditorModal Component Test (1:1 V1 Parity)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('開啟編輯彈窗時應完整呈現前後文義脈絡、AI 存疑提示、5 種標籤與頁碼輸入框', async () => {
    const annotationStore = useAnnotationStore();
    annotationStore.loadSessionAnnotations('02A');

    const wrapper = mount(SentenceEditorModal);

    // 初始狀態下彈窗關閉
    expect(wrapper.find('.modal-dialog').exists()).toBe(false);

    // 開啟帶有存疑提示與前後語境的句子
    const prev = { id: 's-1', start_time: 10.0, end_time: 12.0, text: '這個可以怎麼講。' };
    const curr = {
      id: 's-2',
      start_time: 14.0,
      end_time: 20.0,
      text: '總之像《中論》的話，有二十七品。',
      reviewNeeded: true,
      uncertainty: '此句可能存在中觀名相盲區，請耳聽核對。',
    };
    const next = { id: 's-3', start_time: 21.0, end_time: 22.0, text: '可以說。' };

    annotationStore.openEditor(curr, { prev, next });
    await wrapper.vm.$nextTick();

    // 驗證彈窗 DOM 結構與標題
    expect(wrapper.find('.modal-dialog').exists()).toBe(true);
    expect(wrapper.find('#editor-title').text()).toContain('0:14');

    // 驗證 AI 存疑提示 Banner
    const callout = wrapper.find('.review-needed-callout');
    expect(callout.exists()).toBe(true);
    expect(callout.text()).toContain('此句可能存在中觀名相盲區');

    // 驗證前後文義脈絡盒
    const contextBox = wrapper.find('.context-snippet-box');
    expect(contextBox.exists()).toBe(true);
    expect(contextBox.text()).toContain('這個可以怎麼講。');
    expect(contextBox.text()).toContain('總之像《中論》的話，有二十七品。');
    expect(contextBox.text()).toContain('可以說。');

    // 驗證底本頁數與 5 種標籤下拉選單
    expect(wrapper.find('#modal-page-ref').exists()).toBe(true);
    const select = wrapper.find('#modal-tag-select');
    expect(select.exists()).toBe(true);
    expect(select.findAll('option').length).toBe(5);

    // 驗證主動學習 Universal Rule Checkbox
    expect(wrapper.find('#modal-learn-term-checkbox').exists()).toBe(true);

    // 驗證儲存按鈕
    expect(wrapper.find('#modal-save-btn').exists()).toBe(true);
  });
});
