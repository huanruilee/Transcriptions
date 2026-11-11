export interface SentenceItem {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
}

/**
 * 使用二分搜尋法在時間有序之逐字稿陣列中檢索當前秒數所屬之句子索引。
 * 支援句間呼吸/停頓平滑延續高亮 (Pause Gap Holding)。
 * 時間複雜度：O(log N)
 */
export function findSentenceIndexByTime(
  sentences: SentenceItem[],
  time: number
): number {
  if (!sentences || sentences.length === 0) return -1;

  if (time < sentences[0].start_time) {
    return -1;
  }

  const lastSentence = sentences[sentences.length - 1];
  if (time > lastSentence.end_time + 1.0) {
    return -1;
  }

  // Upper-bound search: at a shared boundary the newly starting sentence wins.
  let low = 0;
  let high = sentences.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sentences[mid].start_time <= time) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

/**
 * 計算音訊實際長度與逐字稿轉寫時間戳邊界之縮放拉伸比例
 */
export function calculateTimeScaleRatio(
  audioDuration: number,
  maxTranscriptTime: number
): number {
  if (audioDuration <= 0 || maxTranscriptTime <= 0) return 1.0;
  return audioDuration / maxTranscriptTime;
}

/**
 * 手動滾動鎖定狀態機
 */
export function createScrollLockManager(timeoutMs = 2500) {
  let isLockedState = false;
  let timer: any = null;

  return {
    isLocked: () => isLockedState,
    triggerUserScroll: () => {
      isLockedState = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        isLockedState = false;
        timer = null;
      }, timeoutMs);
    },
    unlock: () => {
      isLockedState = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
