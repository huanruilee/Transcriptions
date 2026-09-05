import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface SavedReview {
  rating: number;
  tags: string[];
  comment: string;
  updatedAt: string;
}

export const useReviewStore = defineStore('review', () => {
  const currentRating = ref<number>(10);
  const selectedTags = ref<string[]>([]);
  const comment = ref<string>('');

  function setRating(score: number): void {
    if (score < 1) currentRating.value = 1;
    else if (score > 10) currentRating.value = 10;
    else currentRating.value = Math.round(score);
  }

  function toggleTag(tag: string): void {
    const idx = selectedTags.value.indexOf(tag);
    if (idx >= 0) {
      selectedTags.value.splice(idx, 1);
    } else {
      selectedTags.value.push(tag);
    }
  }

  function setComment(text: string): void {
    comment.value = text;
  }

  function getStorageKey(courseId: string, sessionId: string): string {
    return `transcriptions_reviews_${courseId}_${sessionId}`;
  }

  function saveReview(courseId: string, sessionId: string): void {
    const reviewData: SavedReview = {
      rating: currentRating.value,
      tags: [...selectedTags.value],
      comment: comment.value,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(getStorageKey(courseId, sessionId), JSON.stringify(reviewData));
    } catch (e) {
      console.warn('儲存評分失敗:', e);
    }
  }

  function getSavedReview(courseId: string, sessionId: string): SavedReview | null {
    try {
      const raw = localStorage.getItem(getStorageKey(courseId, sessionId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function loadReview(courseId: string, sessionId: string): void {
    const saved = getSavedReview(courseId, sessionId);
    if (saved) {
      currentRating.value = saved.rating;
      selectedTags.value = [...saved.tags];
      comment.value = saved.comment || '';
    } else {
      currentRating.value = 10;
      selectedTags.value = [];
      comment.value = '';
    }
  }

  return {
    currentRating,
    selectedTags,
    comment,
    setRating,
    toggleTag,
    setComment,
    saveReview,
    getSavedReview,
    loadReview,
  };
});
