import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'node:fs';
import path from 'node:path';
import App from '../../src/App.vue';

describe('DOM Contract & Zero-Regression Test Pattern (TDD)', () => {
  it('關鍵 DOM 標記必須 100% 符合防回歸合約', () => {
    setActivePinia(createPinia());
    const wrapper = mount(App);

    // 核心容器與播放器
    expect(wrapper.find('#transcript-container').exists()).toBe(true);
    expect(wrapper.find('#audio-element').exists()).toBe(true);
    expect(wrapper.find('#playback-rate-btn').exists()).toBe(true);
    expect(wrapper.find('#prev-session-btn').exists()).toBe(true);
    expect(wrapper.find('#next-session-btn').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mobile-toc-drawer-btn"]').exists()).toBe(true);

    // 頂部導航與搜尋
    expect(wrapper.find('#sidebar-toggle').exists()).toBe(true);
    expect(wrapper.find('#search-input').exists()).toBe(true);
    expect(wrapper.find('#sync-modal-btn').exists()).toBe(true);
    expect(wrapper.find('#export-notes-btn').exists()).toBe(true);
    expect(wrapper.find('#download-transcript-btn').exists()).toBe(true);
    expect(wrapper.find('#download-transcript-mobile-btn').exists()).toBe(true);
    expect(wrapper.find('#review-modal-btn').exists()).toBe(true);

    // 側邊欄與課程總覽
    expect(wrapper.find('#course-select').exists()).toBe(true);
    expect(wrapper.find('#sidebar-filter').exists()).toBe(true);
    expect(wrapper.find('#course-overview-btn').exists()).toBe(true);
    expect(wrapper.find('#sidebar-resizer').exists()).toBe(true);
  });

  it('左右欄獨立捲動合約：桌機版側邊欄固定高度並獨立捲動，不與右欄主文連動', () => {
    const appVue = fs.readFileSync(path.resolve(__dirname, '../../src/App.vue'), 'utf-8');
    expect(appVue).toContain('height: calc(100vh - var(--header-height) - var(--player-height));');
    expect(appVue).toContain('overscroll-behavior: contain;');
    expect(appVue).toContain('if (isEventInsideSidebar(e)) return;');
  });
});
