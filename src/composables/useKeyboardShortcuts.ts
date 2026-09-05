export interface ShortcutHandlers {
  onTogglePlay?: () => void;
  onToggleSidebar?: () => void;
  onCloseModal?: () => void;
  onFocusSearch?: () => void;
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
}
