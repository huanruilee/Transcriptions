import { defineStore } from 'pinia';
import { type ThemeId } from '../styles/themeTokens';

export type MobileTab = 'transcript' | 'canonical' | 'pinned-split';
export type MobileVideoMode = 'audio-only' | 'sticky-video';

export const useUIStore = defineStore('ui', {
  state: () => ({
    theme: 'parchment' as ThemeId,
    fontSizeRatio: 1.0,
    mobileActiveTab: 'transcript' as MobileTab,
    mobileVideoMode: 'audio-only' as MobileVideoMode,
    isMobileDrawerOpen: false,
    isTOCSheetOpen: false,
    isSentenceModalOpen: false,
    editingSentenceId: null as string | null,
    toast: {
      visible: false,
      message: '',
      type: 'info' as 'info' | 'success' | 'warning' | 'error',
    },
  }),

  actions: {
    setTheme(newTheme: ThemeId) {
      this.theme = newTheme;
    },

    setFontSizeRatio(ratio: number) {
      this.fontSizeRatio = Math.max(0.8, Math.min(1.5, ratio));
    },

    setMobileActiveTab(tab: MobileTab) {
      this.mobileActiveTab = tab;
    },

    toggleMobileVideoMode() {
      this.mobileVideoMode =
        this.mobileVideoMode === 'audio-only' ? 'sticky-video' : 'audio-only';
    },

    openMobileDrawer() {
      this.isMobileDrawerOpen = true;
      this.isTOCSheetOpen = false;
    },

    openTOCSheet() {
      this.isTOCSheetOpen = true;
      this.isMobileDrawerOpen = false;
    },

    closeAllDrawers() {
      this.isMobileDrawerOpen = false;
      this.isTOCSheetOpen = false;
    },

    showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration = 4000) {
      this.toast.message = message;
      this.toast.type = type;
      this.toast.visible = true;
      setTimeout(() => {
        if (this.toast.message === message) {
          this.toast.visible = false;
        }
      }, duration);
    },
  },
});
