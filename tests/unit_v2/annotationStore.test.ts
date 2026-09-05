import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAnnotationStore, computeChineseDiff } from '../../src/stores/annotation';

describe('AnnotationStore & SentenceEditor Test Pattern (TDD)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('初始狀態應具備空的校勘字典與筆記字典', () => {
    const store = useAnnotationStore();
    expect(store.corrections).toEqual({});
    expect(store.notes).toEqual({});
    expect(store.isEditorOpen).toBe(false);
  });

  it('應能正確計算中文逐字 Diff (紅刪綠增)', () => {
    const original = '這是一句佛學講記測試。';
    const corrected = '這是一句佛法講記測試。';

    const diff = computeChineseDiff(original, corrected);
    // 預期抓出「學」被替換為「法」
    const del = diff.find((d) => d.type === 'del');
    const ins = diff.find((d) => d.type === 'ins');
    expect(del?.text).toBe('學');
    expect(ins?.text).toBe('法');
  });

  it('儲存校勘與筆記後應正確更新 Store 與 LocalStorage', () => {
    const store = useAnnotationStore();
    store.loadSessionAnnotations('02A');

    store.saveCorrection('s-10', '原文字', '修訂文字', {
      noteText: '這是一則修訂理由',
      pageRef: 'p.63',
      tag: '破執辯難',
      learnTerm: true,
    });

    expect(store.corrections['s-10']).toBeDefined();
    expect(store.corrections['s-10'].corrected).toBe('修訂文字');
    expect(store.corrections['s-10'].pageRef).toBe('p.63');
    expect(store.corrections['s-10'].tag).toBe('破執辯難');
    expect(store.corrections['s-10'].learnTerm).toBe(true);

    // 驗證 localStorage 持久化
    const raw = localStorage.getItem('transcriptions_corr_02A');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed['s-10'].corrected).toBe('修訂文字');

    // 驗證清除變更
    store.removeAnnotation('s-10');
    expect(store.corrections['s-10']).toBeUndefined();
    expect(store.notes['s-10']).toBeUndefined();
  });

  it('開啟編輯彈窗應正確帶入目標句與前後語境資料', () => {
    const store = useAnnotationStore();
    const prev = { id: 's-41', start_time: 95.0, end_time: 100.0, text: '前一句語境' };
    const curr = { id: 's-42', start_time: 100.0, end_time: 105.0, text: '雙擊測試經句' };
    const next = { id: 's-43', start_time: 105.0, end_time: 110.0, text: '後一句語境' };

    store.openEditor(curr, { prev, next });

    expect(store.isEditorOpen).toBe(true);
    expect(store.activeEditingSentence?.id).toBe('s-42');
    expect(store.activeContext.prev?.text).toBe('前一句語境');
    expect(store.activeContext.next?.text).toBe('後一句語境');
  });
});
