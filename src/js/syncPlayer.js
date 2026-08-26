/**
 * syncPlayer.js - Audio-Text Synchronization Engine
 * Handles Click-to-Seek, Auto-Highlighting with Ratio Alignment, Scroll Lock,
 * Instant Seek Feedback, Simulated Playback Fallback, and Auto-Next queue.
 *
 * Pattern: Module-singleton initialization with updateSession() to swap target
 * audio/sentences without re-binding event listeners (fixes memory leak Bug 1.1).
 */

import { findSentenceIndexByTime, calculateTimeScaleRatio } from './timeAligner.js';

let userIsScrolling = false;
let scrollTimeout = null;
let currentRatio = 1.0;
let initialized = false;

// Simulated playback state (for offline/missing audio environments)
let isSimulating = false;
let simTime = 0;
let simInterval = null;
let simMaxTime = 0;

// Cached DOM references (acquired once)
let lockIndicator = null;

// Cached handler functions (for removal in case of teardown)
let boundAudioElement = null;
let boundSentences = null;
let boundNextCallback = null;
let handleUserScroll = null;
let handleIndicatorClick = null;
let handleTimeUpdate = null;
let handleEnded = null;
let handleLoadedMetadata = null;
let handleDurationChange = null;
let updateRatio = null;

export function initSyncPlayer() {
  if (initialized) return; // Singleton guard: only bind once

  lockIndicator = document.getElementById('scroll-lock-indicator');

  // User-scroll detection
  handleUserScroll = () => {
    userIsScrolling = true;
    if (lockIndicator) lockIndicator.classList.add('visible');

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      userIsScrolling = false;
      if (lockIndicator) lockIndicator.classList.remove('visible');
    }, 4000);
  };
  window.addEventListener('wheel', handleUserScroll, { passive: true });
  window.addEventListener('touchmove', handleUserScroll, { passive: true });

  // Lock indicator click
  if (lockIndicator) {
    handleIndicatorClick = () => {
      userIsScrolling = false;
      lockIndicator.classList.remove('visible');
      const activeEl = document.querySelector('.sentence.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    lockIndicator.addEventListener('click', handleIndicatorClick);
  }

  initialized = true;
}

let pendingScrollTimeout = null;
let userInteractionLockUntil = 0;

/**
 * Freeze auto-scrolling for a specified duration (e.g. 500ms)
 * to guarantee that clicks/double-clicks never cause screen jumps.
 */
export function freezeAutoScroll(durationMs = 500) {
  userInteractionLockUntil = Math.max(userInteractionLockUntil, Date.now() + durationMs);
  cancelPendingAutoScroll();
}

/**
 * Check if auto-scrolling is currently temporarily frozen.
 */
export function isAutoScrollFrozen() {
  return Date.now() < userInteractionLockUntil;
}

/**
 * Cancel any pending delayed auto-scroll.
 */
export function cancelPendingAutoScroll() {
  if (pendingScrollTimeout) {
    clearTimeout(pendingScrollTimeout);
    pendingScrollTimeout = null;
  }
}

/**
 * Highlight sentence matching the given timestamp and scroll into view.
 * Exported so click-to-seek and TOC seek give instant visual feedback.
 * @param {number} timeInSeconds
 * @param {Object} [options]
 * @param {number} [options.delayScrollMs=0] - Delay before auto-scrolling (prevents double-click jitter)
 */
export function highlightSentenceByTime(timeInSeconds, options = {}) {
  const { delayScrollMs = 0 } = options;
  if (!boundSentences || boundSentences.length === 0) return -1;
  const activeIdx = findSentenceIndexByTime(boundSentences, timeInSeconds, currentRatio);

  document.querySelectorAll('.sentence.active').forEach(el => el.classList.remove('active'));

  if (activeIdx !== -1) {
    const activeEl = document.getElementById(`sent-${activeIdx}`);
    if (activeEl) {
      activeEl.classList.add('active');

      if (!userIsScrolling && !isAutoScrollFrozen()) {
        cancelPendingAutoScroll();
        if (delayScrollMs > 0) {
          pendingScrollTimeout = setTimeout(() => {
            if (!userIsScrolling && !isAutoScrollFrozen()) {
              activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            pendingScrollTimeout = null;
          }, delayScrollMs);
        } else {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }
  return activeIdx;
}



/**
 * Stop any active simulated playback timer.
 */
export function stopSimulatedPlayback() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
  isSimulating = false;
}

/**
 * Start simulated playback (used when audio file 404s or is not present locally).
 */
export function startSimulatedPlayback(startTime = 0) {
  stopSimulatedPlayback();
  if (!boundSentences || boundSentences.length === 0) return;

  simTime = startTime;
  simMaxTime = boundSentences[boundSentences.length - 1].end || 100;
  isSimulating = true;

  const statusEl = document.querySelector('.now-playing-status');
  if (statusEl) {
    statusEl.textContent = '💡 模擬音訊同步中（可點擊句子跳轉）';
  }

  highlightSentenceByTime(simTime);

  simInterval = setInterval(() => {
    simTime += 0.25;
    highlightSentenceByTime(simTime);

    if (simTime >= simMaxTime) {
      stopSimulatedPlayback();
      if (statusEl) statusEl.textContent = '本講播放完畢';
      if (typeof boundNextCallback === 'function') {
        boundNextCallback();
      }
    }
  }, 250);
}

export function getIsSimulating() {
  return isSimulating;
}

/**
 * Switch the sync player's target audio/sentences. Should be called whenever
 * the active session changes. Does NOT re-bind global listeners (singleton pattern).
 */
export function updateSession(audioElement, allSentences, onNextSessionRequested, options = {}) {
  stopSimulatedPlayback();

  // Always unbind the previous session handlers. The app reuses the same audio
  // element across sessions, so checking element identity is not enough.
  if (boundAudioElement) {
    if (handleTimeUpdate) boundAudioElement.removeEventListener('timeupdate', handleTimeUpdate);
    if (handleEnded) boundAudioElement.removeEventListener('ended', handleEnded);
    if (handleLoadedMetadata) boundAudioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
    if (handleDurationChange) boundAudioElement.removeEventListener('durationchange', handleDurationChange);
  }

  boundAudioElement = audioElement;
  boundSentences = allSentences;
  boundNextCallback = onNextSessionRequested;
  handleTimeUpdate = null;
  handleEnded = null;
  handleLoadedMetadata = null;
  handleDurationChange = null;
  updateRatio = null;

  if (!audioElement) return;

  // Recalculate ratio
  // Issue #11 v2 — when pilot v2 payload is loaded (sentences already carry
  // audio-grounded timestamps from WhisperX), we force ratio = 1.0 so the
  // legacy fallback scaling does NOT corrupt the aligned timestamps.
  updateRatio = () => {
    if (options.pilot_v2 === true) {
      currentRatio = 1.0;
    } else if (audioElement.duration && audioElement.duration > 0) {
      currentRatio = calculateTimeScaleRatio(allSentences, audioElement.duration);
    } else {
      currentRatio = 1.0;
    }
  };

  handleLoadedMetadata = updateRatio;
  handleDurationChange = updateRatio;
  audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
  audioElement.addEventListener('durationchange', handleDurationChange);
  updateRatio();

  // Time update → highlight + scroll
  handleTimeUpdate = () => {
    // If real audio is playing, stop any simulation
    if (isSimulating) stopSimulatedPlayback();
    const currentTime = audioElement.currentTime;
    highlightSentenceByTime(currentTime);
  };
  audioElement.addEventListener('timeupdate', handleTimeUpdate);

  // Auto-play next
  handleEnded = () => {
    if (typeof boundNextCallback === 'function') {
      boundNextCallback();
    }
  };
  audioElement.addEventListener('ended', handleEnded);
}

export function getCurrentTimeScaleRatio() {
  return currentRatio;
}

// Backward-compat: original API still works (delegates to singleton + update)
export function initSyncPlayerCompat(audioElement, allSentences, onNextSessionRequested) {
  initSyncPlayer();
  updateSession(audioElement, allSentences, onNextSessionRequested);
}
