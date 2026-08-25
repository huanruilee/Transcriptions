/**
 * timeAligner.js - Fast Binary Search Time Alignment with Ratio Scaling
 * Finds the index of the sentence corresponding to currentTime in O(log N) time,
 * scaling virtual timestamps to actual MP3 audio duration.
 */

export function findSentenceIndexByTime(sentences, currentTime, timeScaleRatio = 1.0) {
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return -1;
  }

  // Convert actual audio currentTime to virtual JSON timestamp
  const virtualTime = timeScaleRatio > 0 ? (currentTime / timeScaleRatio) : currentTime;

  if (virtualTime < sentences[0].start) {
    return -1;
  }

  const lastSentence = sentences[sentences.length - 1];
  if (virtualTime > lastSentence.end + 1.0) {
    return -1;
  }

  let low = 0;
  let high = sentences.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const s = sentences[mid];

    if (virtualTime >= s.start && virtualTime <= s.end) {
      return mid;
    } else if (virtualTime > s.end) {
      // Check if within pause gap before the next sentence
      const nextStart = mid < sentences.length - 1 ? sentences[mid + 1].start : s.end + 1.0;
      if (virtualTime < nextStart) {
        return mid; // Smoothly hold highlight during intra-sentence pause
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return -1;
}

export function calculateTimeScaleRatio(sentences, audioDuration) {
  if (!Array.isArray(sentences) || sentences.length === 0 || !audioDuration || audioDuration <= 0) {
    return 1.0;
  }
  const maxJsonTime = sentences[sentences.length - 1].end;
  if (maxJsonTime > 0) {
    return audioDuration / maxJsonTime;
  }
  return 1.0;
}
