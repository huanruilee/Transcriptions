/**
 * syncPlayer.js - Audio-Text Synchronization Engine
 * Handles Click-to-Seek, Auto-Highlighting with Ratio Alignment, Scroll Lock, and Auto-Next queue.
 *
 * Pattern: Module-singleton initialization with updateSession() to swap target
 * audio/sentences without re-binding event listeners (fixes memory leak Bug 1.1).
 */

import { findSentenceIndexByTime, calculateTimeScaleRatio } from './timeAligner.js';

let userIsScrolling = false;
let scrollTimeout = null;
let currentRatio = 1.0;
let initialized = false;

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

/**
 * Switch the sync player's target audio/sentences. Should be called whenever
 * the active session changes. Does NOT re-bind global listeners (singleton pattern).
 */
export function updateSession(audioElement, allSentences, onNextSessionRequested, options = {}) {
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
    const currentTime = audioElement.currentTime;
    const activeIdx = findSentenceIndexByTime(allSentences, currentTime, currentRatio);

    document.querySelectorAll('.sentence.active').forEach(el => el.classList.remove('active'));

    if (activeIdx !== -1) {
      const activeEl = document.getElementById(`sent-${activeIdx}`);
      if (activeEl) {
        activeEl.classList.add('active');

        if (!userIsScrolling) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
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
