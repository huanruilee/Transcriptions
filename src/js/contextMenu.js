/**
 * Context Menu Module for Mobile & Desktop Touch / Long-Press Interactions (UI v1.1/v1.2)
 *
 * Provides a clean bubble context menu for sentences:
 * - [ 📝 筆記 / 校勘 ] -> Opens Annotation modal
 * - [ 📋 複製引文 ] -> Copies sentence text to clipboard
 * - [ ▶️ 從此處播放 ] -> Seeks audio to sentence timestamp
 */

let activeContextMenu = null;
let longPressTimer = null;
let touchStartX = 0;
let touchStartY = 0;

export function initContextMenu({ onNote, onCopy, onPlay }) {
  // Create or retrieve context menu DOM
  let menu = document.getElementById('touch-context-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'touch-context-menu';
    menu.className = 'touch-context-menu';
    menu.innerHTML = `
      <button class="context-menu-item" data-action="play">▶️ 播放</button>
      <button class="context-menu-item" data-action="note">📝 筆記</button>
      <button class="context-menu-item" data-action="copy">📋 複製</button>
    `;
    document.body.appendChild(menu);
  }
  activeContextMenu = menu;

  // Delegate click on context menu actions
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.context-menu-item');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const targetSentence = menu._targetSentence;

    hideContextMenu();

    if (!targetSentence) return;

    if (action === 'play' && onPlay) {
      onPlay(targetSentence);
    } else if (action === 'note' && onNote) {
      onNote(targetSentence);
    } else if (action === 'copy' && onCopy) {
      onCopy(targetSentence);
    }
  });

  // Global dismiss listener
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#touch-context-menu')) {
      hideContextMenu();
    }
  });

  // Setup long-press listeners on transcript container
  const container = document.getElementById('transcript-container');
  if (container) {
    setupSentenceTouchListeners(container);
  }
}

export function setupSentenceTouchListeners(container) {
  if (!container) return;

  container.addEventListener('touchstart', (e) => {
    const sent = e.target.closest('.transcript-sentence');
    if (!sent) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;

    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      // Trigger context menu on long-press (500ms)
      showContextMenu(sent, touchStartX, touchStartY);
    }, 500);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    // If user scrolled > 10px, cancel long-press
    const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
    const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(longPressTimer);
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
  });

  container.addEventListener('touchcancel', () => {
    clearTimeout(longPressTimer);
  });
}

export function showContextMenu(sentenceElem, x, y) {
  if (!activeContextMenu) return;
  activeContextMenu._targetSentence = sentenceElem;

  // Position context menu near touch point
  const viewportWidth = window.innerWidth;
  const menuWidth = 190;
  let posX = Math.max(10, Math.min(x - menuWidth / 2, viewportWidth - menuWidth - 10));
  let posY = Math.max(60, y - 50);

  activeContextMenu.style.left = `${posX}px`;
  activeContextMenu.style.top = `${posY}px`;
  activeContextMenu.classList.add('active');
}

export function hideContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.classList.remove('active');
    activeContextMenu._targetSentence = null;
  }
}
