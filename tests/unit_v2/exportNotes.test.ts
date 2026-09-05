import { describe, it, expect } from 'vitest';
import { formatMarkdownNotes } from '../../src/composables/useExportNotes';

describe('ExportNotes Test Pattern (TDD)', () => {
  it('應能將當講之校勘修訂與心得研讀筆記格式化為標準 Markdown', () => {
    const meta = {
      courseTitle: '入中論善顯密意疏',
      sessionId: '02A',
      sessionTitle: '第02A講',
      pageRange: 'p.63-p.64',
    };

    const corrections = {
      'sent-10': {
        original: '中觀應成態無自性',
        corrected: '中觀應成派無自性',
        timestamp: 125.4,
        note: '格西開示派別',
      },
    };

    const notes = {
      'sent-10': '此處開示非常關鍵，需反覆思維。',
      'sent-15': '記住此段科判對照。',
    };

    const md = formatMarkdownNotes(meta, corrections, notes);

    expect(md).toContain('# 《入中論善顯密意疏》第02A講 研讀筆記與校勘修訂');
    expect(md).toContain('**底本頁碼**：p.63-p.64');
    expect(md).toContain('## 一、 校勘修訂清單');
    expect(md).toContain('中觀應成態無自性');
    expect(md).toContain('中觀應成派無自性');
    expect(md).toContain('## 二、 研讀心得與要點筆記');
    expect(md).toContain('此處開示非常關鍵，需反覆思維。');
  });

  it('無校勘與筆記時應友善提示尚無記錄', () => {
    const meta = {
      courseTitle: '入中論善顯密意疏',
      sessionId: '01',
      sessionTitle: '第01講',
    };

    const md = formatMarkdownNotes(meta, {}, {});
    expect(md).toContain('（本講次尚無校勘記錄）');
    expect(md).toContain('（本講次尚無研讀筆記）');
  });
});
