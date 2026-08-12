/**
 * syncPlayer.js - Audio-Text Synchronization Engine
 * Handles Click-to-Seek, Auto-Highlighting with Ratio Alignment, Scroll Lock, and Auto-Next queue.
 */

import { findSentenceIndexByTime, calculateTimeScaleRatio } from './timeAligner.js';

let userIsScrolling = false;
let scrollTimeout = null;
let currentRatio = 1.0;

export function initSyncPlayer(audioElement, allSentences, onNextSessionRequested) {
  const lockIndicator = document.getElementById('scroll-lock-indicator');

  // Recalculate ratio when audio metadata is loaded
  const updateRatio = () => {
    if (audioElement.duration && audioElement.duration > 0) {
      currentRatio = calculateTimeScaleRatio(allSentences, audioElement.duration);
    } else {
      currentRatio = 1.0;
    }
  };

  audioElement.addEventListener('loadedmetadata', updateRatio);
  audioElement.addEventListener('durationchange', updateRatio);
  updateRatio();

  // Detect manual user scrolling
  const handleUserScroll = () => {
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

  if (lockIndicator) {
    lockIndicator.addEventListener('click', () => {
      userIsScrolling = false;
      lockIndicator.classList.remove('visible');
      const activeEl = document.querySelector('.sentence.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // Time update listener
  audioElement.addEventListener('timeupdate', () => {
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
  });

  // Auto-play next session on ended
  audioElement.addEventListener('ended', () => {
    if (typeof onNextSessionRequested === 'function') {
      onNextSessionRequested();
    }
  });
}

export function getCurrentTimeScaleRatio() {
  return currentRatio;
}
