import { defineStore } from 'pinia';
import { findSentenceIndexByTime, type SentenceItem } from '../composables/useTimeSync';

export const usePlayerStore = defineStore('player', {
  state: () => ({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0,
    activeSentenceId: null as string | null,
    activeSentenceIndex: -1,
    isUserScrolling: false,
    scrollLockTimer: null as any,
    sentences: [] as SentenceItem[],
  }),

  actions: {
    cyclePlaybackRate() {
      const rates = [1.0, 1.2, 1.5, 2.0];
      const currentIndex = rates.indexOf(this.playbackRate);
      const nextIndex = (currentIndex + 1) % rates.length;
      this.playbackRate = rates[nextIndex];
    },

    setSentences(items: SentenceItem[]) {
      this.sentences = items;
    },

    updateTime(time: number) {
      this.currentTime = time;
      if (this.sentences.length > 0) {
        const idx = findSentenceIndexByTime(this.sentences, time);
        if (idx !== -1) {
          this.activeSentenceIndex = idx;
          this.activeSentenceId = this.sentences[idx].id;
        }
      }
    },

    handleUserScroll(timeoutMs = 2500) {
      this.isUserScrolling = true;
      if (this.scrollLockTimer) {
        clearTimeout(this.scrollLockTimer);
      }
      this.scrollLockTimer = setTimeout(() => {
        this.isUserScrolling = false;
        this.scrollLockTimer = null;
      }, timeoutMs);
    },

    resetScrollLock() {
      this.isUserScrolling = false;
      if (this.scrollLockTimer) {
        clearTimeout(this.scrollLockTimer);
        this.scrollLockTimer = null;
      }
    },
  },
});
