/**
 * timeAligner.js - Fast Binary Search Time Alignment
 * Finds the index of the sentence corresponding to currentTime in O(log N) time.
 */

export function findSentenceIndexByTime(sentences, currentTime) {
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return -1;
  }

  let low = 0;
  let high = sentences.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const s = sentences[mid];

    if (currentTime >= s.start && currentTime <= s.end) {
      return mid;
    } else if (currentTime < s.start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return -1;
}
