import { defineStore } from 'pinia';
import { type SentenceItem } from '../composables/useTimeSync';

export interface CorrectionItem {
  sentenceId: string;
  original: string;
  corrected: string;
  note?: string;
  pageRef?: string;
  tag?: string;
  learnTerm?: boolean;
  updatedAt: number | string;
}

export interface NoteItem {
  sentenceId: string;
  content: string;
  pageRef?: string;
  tag?: string;
  updatedAt: number | string;
}

export interface DiffPart {
  type: 'equal' | 'del' | 'ins';
  text: string;
}

/**
 * 依據 LCS (最長公共子序列) 計算中文逐字 Diff 演算法
 */
export function computeChineseDiff(original: string, corrected: string): DiffPart[] {
  if (original === corrected) {
    return [{ type: 'equal', text: original }];
  }

  const m = original.length;
  const n = corrected.length;

  // 動態規劃構建 LCS 矩陣
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (original[i - 1] === corrected[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯生成 Diff
  const rawDiff: DiffPart[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && original[i - 1] === corrected[j - 1]) {
      rawDiff.unshift({ type: 'equal', text: original[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.unshift({ type: 'ins', text: corrected[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawDiff.unshift({ type: 'del', text: original[i - 1] });
      i--;
    }
  }

  // 合併連續相同類型的 Diff 片段
  const mergedDiff: DiffPart[] = [];
  for (const part of rawDiff) {
    if (mergedDiff.length > 0 && mergedDiff[mergedDiff.length - 1].type === part.type) {
      mergedDiff[mergedDiff.length - 1].text += part.text;
    } else {
      mergedDiff.push({ ...part });
    }
  }

  return mergedDiff;
}

const STORAGE_PREFIX_CORRECTION = 'transcriptions_corr_';
const STORAGE_PREFIX_NOTES = 'transcriptions_note_';

export const useAnnotationStore = defineStore('annotation', {
  state: () => ({
    currentSessionId: '02A',
    corrections: {} as Record<string, CorrectionItem>,
    notes: {} as Record<string, NoteItem>,
    isEditorOpen: false,
    activeEditingSentence: null as (SentenceItem & { reviewNeeded?: boolean; uncertainty?: string | null }) | null,
    activeContext: {
      prev: null as SentenceItem | null,
      next: null as SentenceItem | null,
    },
    syncServerOnline: false,
  }),

  actions: {
    loadSessionAnnotations(sessionId: string) {
      this.currentSessionId = sessionId;
      try {
        const corrKey = `${STORAGE_PREFIX_CORRECTION}${sessionId}`;
        const rawCorr = localStorage.getItem(corrKey);
        this.corrections = rawCorr ? JSON.parse(rawCorr) : {};

        const noteKey = `${STORAGE_PREFIX_NOTES}${sessionId}`;
        const rawNote = localStorage.getItem(noteKey);
        this.notes = rawNote ? JSON.parse(rawNote) : {};
      } catch (e) {
        console.warn('載入 localStorage 校勘筆記失敗:', e);
      }
    },

    openEditor(
      sentence: SentenceItem & { reviewNeeded?: boolean; uncertainty?: string | null },
      context?: { prev?: SentenceItem | null; next?: SentenceItem | null }
    ) {
      this.activeEditingSentence = sentence;
      this.activeContext = {
        prev: context?.prev || null,
        next: context?.next || null,
      };
      this.isEditorOpen = true;
      this.checkSyncServer();
    },

    closeEditor() {
      this.isEditorOpen = false;
      this.activeEditingSentence = null;
      this.activeContext = { prev: null, next: null };
    },

    async checkSyncServer() {
      try {
        const res = await fetch('http://127.0.0.1:9091/api/health', { method: 'GET', signal: AbortSignal.timeout(1000) });
        this.syncServerOnline = res.ok;
      } catch (_) {
        this.syncServerOnline = false;
      }
    },

    saveCorrection(
      sentenceId: string,
      original: string,
      corrected: string,
      options?: {
        noteText?: string;
        pageRef?: string;
        tag?: string;
        learnTerm?: boolean;
      }
    ) {
      const item: CorrectionItem = {
        sentenceId,
        original,
        corrected,
        note: options?.noteText || '',
        pageRef: options?.pageRef || '',
        tag: options?.tag || '中觀正理',
        learnTerm: Boolean(options?.learnTerm),
        updatedAt: Date.now(),
      };

      this.corrections[sentenceId] = item;

      // 持久化到 localStorage
      try {
        const corrKey = `${STORAGE_PREFIX_CORRECTION}${this.currentSessionId}`;
        localStorage.setItem(corrKey, JSON.stringify(this.corrections));
      } catch (e) {
        console.error('儲存校勘至 localStorage 失敗:', e);
      }

      // 若有填寫研讀筆記，同步存入 notes
      if (options?.noteText && options.noteText.trim()) {
        this.saveNote(sentenceId, options.noteText.trim(), options.pageRef, options.tag);
      }

      // 若後台在線，嘗試同步推送
      if (this.syncServerOnline) {
        this.pushToBackend(item);
      }
    },

    saveNote(sentenceId: string, content: string, pageRef?: string, tag?: string) {
      const noteItem: NoteItem = {
        sentenceId,
        content,
        pageRef: pageRef || '',
        tag: tag || '中觀正理',
        updatedAt: Date.now(),
      };
      this.notes[sentenceId] = noteItem;

      try {
        const noteKey = `${STORAGE_PREFIX_NOTES}${this.currentSessionId}`;
        localStorage.setItem(noteKey, JSON.stringify(this.notes));
      } catch (e) {
        console.error('儲存筆記至 localStorage 失敗:', e);
      }
    },

    removeAnnotation(sentenceId: string) {
      delete this.corrections[sentenceId];
      delete this.notes[sentenceId];

      try {
        const corrKey = `${STORAGE_PREFIX_CORRECTION}${this.currentSessionId}`;
        localStorage.setItem(corrKey, JSON.stringify(this.corrections));

        const noteKey = `${STORAGE_PREFIX_NOTES}${this.currentSessionId}`;
        localStorage.setItem(noteKey, JSON.stringify(this.notes));
      } catch (e) {
        console.error('清除 localStorage 校勘筆記失敗:', e);
      }
    },

    async pushToBackend(item: CorrectionItem) {
      try {
        await fetch('http://127.0.0.1:9091/api/submit_correction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.currentSessionId,
            sentenceId: item.sentenceId,
            originalText: item.original,
            correctedText: item.corrected,
            pageRef: item.pageRef,
            tag: item.tag,
            learnTerm: item.learnTerm,
            note: item.note,
          }),
        });
      } catch (e) {
        console.warn('推送到本機同步後台失敗:', e);
      }
    },
  },
});
