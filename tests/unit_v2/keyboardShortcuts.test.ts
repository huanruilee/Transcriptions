import { describe, it, expect, vi } from 'vitest';
import { handleGlobalKeyDown } from '../../src/composables/useKeyboardShortcuts';

describe('KeyboardShortcuts Test Pattern (TDD)', () => {
  it('按空白鍵 (Space) 在非輸入元件時應觸發播放/暫停且阻止預設滾動', () => {
    const onTogglePlay = vi.fn();
    const event = {
      code: 'Space',
      target: document.createElement('div'),
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handleGlobalKeyDown(event, { onTogglePlay });
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('在 input / textarea 內按空白鍵不應觸發播放控制', () => {
    const onTogglePlay = vi.fn();
    const event = {
      code: 'Space',
      target: document.createElement('input'),
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handleGlobalKeyDown(event, { onTogglePlay });
    expect(onTogglePlay).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('按 [ 鍵應觸發側邊欄切換', () => {
    const onToggleSidebar = vi.fn();
    const event = {
      key: '[',
      target: document.createElement('body'),
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handleGlobalKeyDown(event, { onToggleSidebar });
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('按 Escape 鍵應觸發關閉彈窗', () => {
    const onCloseModal = vi.fn();
    const event = {
      key: 'Escape',
      target: document.createElement('body'),
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handleGlobalKeyDown(event, { onCloseModal });
    expect(onCloseModal).toHaveBeenCalledTimes(1);
  });

  it('按 ⌘K 或 Ctrl+K 應觸發聚焦搜尋框', () => {
    const onFocusSearch = vi.fn();
    const event = {
      key: 'k',
      metaKey: true,
      target: document.createElement('body'),
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handleGlobalKeyDown(event, { onFocusSearch });
    expect(onFocusSearch).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
