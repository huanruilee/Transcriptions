import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUIStore } from '../../src/stores/ui';

describe('MobileUX Test Pattern (TDD)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('手機端應支援分段切換器：逐字稿、課文原典、上下對照釘選', () => {
    const ui = useUIStore();
    expect(ui.mobileActiveTab).toBe('transcript');

    ui.setMobileActiveTab('canonical');
    expect(ui.mobileActiveTab).toBe('canonical');

    ui.setMobileActiveTab('pinned-split');
    expect(ui.mobileActiveTab).toBe('pinned-split');
  });

  it('手機端應支援 YouTube 影音頂部固定與純音訊省流量雙態切換', () => {
    const ui = useUIStore();
    expect(ui.mobileVideoMode).toBe('audio-only');

    ui.toggleMobileVideoMode();
    expect(ui.mobileVideoMode).toBe('sticky-video');

    ui.toggleMobileVideoMode();
    expect(ui.mobileVideoMode).toBe('audio-only');
  });

  it('行動端抽屜狀態應具備嚴格的互斥性與關閉邏輯', () => {
    const ui = useUIStore();
    expect(ui.isMobileDrawerOpen).toBe(false);
    expect(ui.isTOCSheetOpen).toBe(false);

    // 打開目錄抽屜
    ui.openMobileDrawer();
    expect(ui.isMobileDrawerOpen).toBe(true);
    expect(ui.isTOCSheetOpen).toBe(false);

    // 打開科判抽屜時，目錄抽屜應自動收起
    ui.openTOCSheet();
    expect(ui.isTOCSheetOpen).toBe(true);
    expect(ui.isMobileDrawerOpen).toBe(false);

    // 一鍵全關閉
    ui.closeAllDrawers();
    expect(ui.isMobileDrawerOpen).toBe(false);
    expect(ui.isTOCSheetOpen).toBe(false);
  });
});
