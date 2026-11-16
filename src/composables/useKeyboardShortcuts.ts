export interface ShortcutHandlers {
  onTogglePlay?: () => void;
  onToggleSidebar?: () => void;
  onCloseModal?: () => void;
  onFocusSearch?: () => void;
  onLoopCurrentSentence?: () => void;
  onToggleStudyGuide?: () => void;
  onSeekBackward?: (seconds?: number) => void;
  onSeekForward?: (seconds?: number) => void;
}

export function handleGlobalKeyDown(event: KeyboardEvent, handlers: ShortcutHandlers): void {
  const target = event.target as HTMLElement | null;
  const isInputActive =
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      target.tagName === 'SELECT');

  // 1. ⌘K or Ctrl+K -> Focus Search
  if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
    event.preventDefault();
    handlers.onFocusSearch?.();
    return;
  }

  // 2. Escape -> Close modal
  if (event.key === 'Escape') {
    handlers.onCloseModal?.();
    return;
  }

  // If typing in input or textarea, do not trigger single-key actions
  if (isInputActive) {
    return;
  }

  // 3. Space -> Play/Pause
  if (event.code === 'Space') {
    event.preventDefault();
    handlers.onTogglePlay?.();
    return;
  }

  // 4. [ -> Toggle sidebar
  if (event.key === '[') {
    handlers.onToggleSidebar?.();
    return;
  }

  // 5. 'j' or 'J' -> Rewind 10s (standard video/audio shortcut)
  if (event.key === 'j' || event.key === 'J') {
    event.preventDefault();
    handlers.onSeekBackward?.(10);
    return;
  }

  // 6. 'k' or 'K' -> Play/Pause toggle
  if (event.key === 'k' || event.key === 'K') {
    event.preventDefault();
    handlers.onTogglePlay?.();
    return;
  }

  // 7. 'l' or 'L' -> Forward 10s (or when modified, loop sentence)
  if (event.key === 'l' || event.key === 'L') {
    event.preventDefault();
    if (event.shiftKey) {
      handlers.onLoopCurrentSentence?.();
    } else {
      handlers.onSeekForward?.(10);
    }
    return;
  }

  // 8. 'g' or 'G' -> Toggle Study Guide publication / drawer
  if (event.key === 'g' || event.key === 'G') {
    event.preventDefault();
    handlers.onToggleStudyGuide?.();
    return;
  }
}
