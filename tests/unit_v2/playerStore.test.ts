import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePlayerStore } from '../../src/stores/player';

describe('PlayerStore Test Pattern (TDD)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('初始狀態應具備正確之預設值', () => {
    const store = usePlayerStore();
    expect(store.isPlaying).toBe(false);
    expect(store.currentTime).toBe(0);
    expect(store.playbackRate).toBe(1.0);
    expect(store.activeSentenceId).toBeNull();
    expect(store.isUserScrolling).toBe(false);
  });

  it('倍速切換應能遵循 1.0 -> 1.2 -> 1.5 -> 2.0 -> 1.0 循環', () => {
    const store = usePlayerStore();
    expect(store.playbackRate).toBe(1.0);
    store.cyclePlaybackRate();
    expect(store.playbackRate).toBe(1.2);
    store.cyclePlaybackRate();
    expect(store.playbackRate).toBe(1.5);
    store.cyclePlaybackRate();
    expect(store.playbackRate).toBe(2.0);
    store.cyclePlaybackRate();
    expect(store.playbackRate).toBe(1.0);
  });

  it('時間更新時應自動觸發句子二分比對並更新 activeSentenceId', () => {
    const store = usePlayerStore();
    store.setSentences([
      { id: 's-10', start_time: 10.0, end_time: 15.0, text: '第一句' },
      { id: 's-11', start_time: 15.5, end_time: 20.0, text: '第二句' },
    ]);

    store.updateTime(12.5);
    expect(store.currentTime).toBe(12.5);
    expect(store.activeSentenceId).toBe('s-10');
    expect(store.activeSentenceIndex).toBe(0);

    store.updateTime(18.0);
    expect(store.activeSentenceId).toBe('s-11');
    expect(store.activeSentenceIndex).toBe(1);
  });

  it('手動滾動時應啟用鎖定並在解鎖時重設狀態', () => {
    const store = usePlayerStore();
    expect(store.isUserScrolling).toBe(false);
    store.handleUserScroll();
    expect(store.isUserScrolling).toBe(true);
    store.resetScrollLock();
    expect(store.isUserScrolling).toBe(false);
  });
});
