/**
 * syncPlayer.js - Audio-Text Synchronization Engine
 * Handles Click-to-Seek, Auto-Highlighting, Auto-Scroll with Scroll Lock, and Auto-Next queue.
 */

import { findSentenceIndexByTime } from './timeAligner.js';

let userIsScrolling = false;
let scrollTimeout = null;

export function initSyncPlayer(audioElement, allSentences, onNextSessionRequested) {
  const lockIndicator = document.getElementById('scroll-lock-indicator');

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
    const activeIdx = findSentenceIndexByTime(allSentences, currentTime);

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
