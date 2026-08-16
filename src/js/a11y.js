/**
 * a11y.js - Accessibility helpers (M6.3, AGY review).
 *
 * Extracted from app.js so the Roving Tabindex navigation, safe audio.play()
 * wrapper, and aria-time formatting can be unit-tested with jsdom as real
 * DOM behavior (not just regex on source text).
 *
 * Pattern: pure functions + a DOM navigation helper. No side effects on import.
 */

/**
 * Format a virtual-time seconds value as "X 分 Y 秒" for screen readers.
 * Different from formatTime (HH:MM:SS) — this is for aria-label audio cues.
 */
export function formatAriaTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0 秒';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} 秒`;
  return `${m} 分 ${s} 秒`;
}

/**
 * Safe audio.play() wrapper (AGY review risk #1).
 * audio.play() returns a Promise that rejects if the source is missing/404 or
 * the browser blocks autoplay. An unhandled rejection leaves the player stuck
 * in "loading/paused". Catch it and surface a toast instead.
 *
 * @param {HTMLAudioElement} audio
 * @param {string} [fallbackMsg] toast text on failure
 * @param {(msg: string) => void} [onError] injectable error sink (defaults to console.warn)
 */
export function safePlay(audio, fallbackMsg, onError) {
  if (!audio) return;
  const p = audio.play();
  if (p && typeof p.catch === 'function') {
    p.catch((err) => {
      const sink = onError || ((msg) => console.warn('[safePlay]', msg));
      sink(fallbackMsg || '音檔播放失敗，請確認音源存在。');
    });
  }
}

/**
 * Roving Tabindex navigation (AGY review: avoid Tab Flood).
 * Given a list of sentence elements (only the first is tabindex=0, rest -1),
 * move focus + seek on ArrowDown/ArrowUp.
 *
 * @param {HTMLElement[]} sentences
 * @param {number} currentIndex index of the currently focused sentence
 * @param {number} delta +1 (down) or -1 (up)
 * @param {(el: HTMLElement) => void} [onSeek] called with the newly focused element
 * @returns {number} new focused index, or -1 if no movement possible
 */
export function rovingMove(sentences, currentIndex, delta, onSeek) {
  if (!sentences || sentences.length === 0) return -1;
  const next = currentIndex + delta;
  if (next < 0 || next >= sentences.length) return -1;
  const cur = sentences[currentIndex];
  const nxt = sentences[next];
  if (cur) cur.tabIndex = -1;
  if (nxt) {
    nxt.tabIndex = 0;
    nxt.focus();
    if (onSeek) onSeek(nxt);
  }
  return next;
}
