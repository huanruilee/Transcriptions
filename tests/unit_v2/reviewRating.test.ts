import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReviewStore } from '../../src/stores/review';

describe('ReviewRating Store Test Pattern (TDD)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('應能設定 1~10 分並驗證合法範圍', () => {
    const store = useReviewStore();
    store.setRating(8);
    expect(store.currentRating).toBe(8);

    // 邊界測試
    store.setRating(0);
    expect(store.currentRating).toBe(1); // 自動 clamp 到 1
    store.setRating(15);
    expect(store.currentRating).toBe(10); // 自動 clamp 到 10
  });

  it('應能切換問題標籤 (Toggle tags)', () => {
    const store = useReviewStore();
    store.toggleTag('錯別字');
    expect(store.selectedTags).toContain('錯別字');
    store.toggleTag('錯別字');
    expect(store.selectedTags).not.toContain('錯別字');
  });

  it('應能保存講次評分並持久化至 LocalStorage', () => {
    const store = useReviewStore();
    store.setRating(9);
    store.toggleTag('專有名詞');
    store.setComment('格西發音清晰，校對品質極佳！');
    store.saveReview('ru-zhong-lun', '02A');

    const saved = store.getSavedReview('ru-zhong-lun', '02A');
    expect(saved).not.toBeNull();
    expect(saved?.rating).toBe(9);
    expect(saved?.tags).toContain('專有名詞');
    expect(saved?.comment).toContain('格西發音清晰');
  });
});
