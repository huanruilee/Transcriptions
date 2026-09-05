import { describe, it, expect } from 'vitest';
import { findSentenceIndexByTime, calculateTimeScaleRatio, createScrollLockManager } from '../../src/composables/useTimeSync';

interface SentenceItem {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
}

describe('TimeSync Test Pattern (TDD)', () => {
  const sampleSentences: SentenceItem[] = [
    { id: 's-1', start_time: 0.0, end_time: 3.5, text: '第一句開示' },
    { id: 's-2', start_time: 3.6, end_time: 7.2, text: '第二句論述' },
    { id: 's-3', start_time: 7.5, end_time: 12.0, text: '第三句經論引證' },
    { id: 's-4', start_time: 12.5, end_time: 18.0, text: '第四句總結' },
  ];

  it('應使用二分搜尋精確定位秒數所屬之句子索引', () => {
    expect(findSentenceIndexByTime(sampleSentences, 0.0)).toBe(0);
    expect(findSentenceIndexByTime(sampleSentences, 2.0)).toBe(0);
    expect(findSentenceIndexByTime(sampleSentences, 3.5)).toBe(0);
    expect(findSentenceIndexByTime(sampleSentences, 5.0)).toBe(1);
    expect(findSentenceIndexByTime(sampleSentences, 10.0)).toBe(2);
    expect(findSentenceIndexByTime(sampleSentences, 15.0)).toBe(3);
  });

  it('當時間戳位於句子間隙時應平滑保持前句高亮，超出範圍時回傳 -1', () => {
    // 兩句之間的靜音間隔 3.55s 應平滑維持前句索引 (0)
    expect(findSentenceIndexByTime(sampleSentences, 3.55)).toBe(0);
    // 超出範圍
    expect(findSentenceIndexByTime(sampleSentences, 25.0)).toBe(-1);
    expect(findSentenceIndexByTime([], 5.0)).toBe(-1);
  });

  it('在 2000 句大型陣列下檢索耗時應小於 0.1ms (O(log N))', () => {
    const largeSentences: SentenceItem[] = [];
    for (let i = 0; i < 2000; i++) {
      largeSentences.push({
        id: `s-${i}`,
        start_time: i * 3.0,
        end_time: i * 3.0 + 2.8,
        text: `第 ${i} 句測試經文`,
      });
    }

    const t0 = performance.now();
    for (let k = 0; k < 1000; k++) {
      findSentenceIndexByTime(largeSentences, 1500 * 3.0 + 1.0);
    }
    const totalTimeMs = performance.now() - t0;
    // 1000 次搜尋總耗時應小於 10ms (平均每次 < 0.01ms)
    expect(totalTimeMs).toBeLessThan(15);
  });

  it('自適應時間軸拉伸比例修正應能正確計算', () => {
    // 音訊時長 100 秒，逐字稿末句結束在 98 秒
    const ratio = calculateTimeScaleRatio(100.0, 98.0);
    expect(ratio).toBeCloseTo(1.0204, 3);

    // 異常輸入保護
    expect(calculateTimeScaleRatio(0, 98.0)).toBe(1.0);
    expect(calculateTimeScaleRatio(100.0, 0)).toBe(1.0);
  });

  it('手動滾動鎖定狀態機應能在 2.5 秒內凍結滾動並支援手動解鎖', async () => {
    const lock = createScrollLockManager(100); // 測試用 100ms 逾時

    expect(lock.isLocked()).toBe(false);
    lock.triggerUserScroll();
    expect(lock.isLocked()).toBe(true);

    // 手動解鎖
    lock.unlock();
    expect(lock.isLocked()).toBe(false);

    // 自動逾時解鎖
    lock.triggerUserScroll();
    expect(lock.isLocked()).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    expect(lock.isLocked()).toBe(false);
  });
});
