import { describe, it, expect } from 'vitest';
import { searchSentences, navigateMatch, type SearchMatch } from '../../src/composables/useSearchEngine';

describe('SearchEngine Test Pattern (TDD)', () => {
  const sampleSentences = [
    { id: 's-1', text: '我們今天開始宣講《入中論善顯密意疏》。', start_time: 1.0 },
    { id: 's-2', text: '空性正見乃三乘解脫之根本。', start_time: 15.5 },
    { id: 's-3', text: '此疏以深密意宣說緣起空性。', start_time: 32.0 },
    { id: 's-4', text: '菩薩發心，修持六度波羅蜜多。', start_time: 48.2 },
  ];

  it('應能全文檢索關鍵字並回傳所有匹配項與位置', () => {
    const matches = searchSentences(sampleSentences, '空性');
    expect(matches).toHaveLength(2);
    expect(matches[0].sentenceId).toBe('s-2');
    expect(matches[0].startTime).toBe(15.5);
    expect(matches[1].sentenceId).toBe('s-3');
  });

  it('空白關鍵字應回傳空陣列', () => {
    expect(searchSentences(sampleSentences, '')).toHaveLength(0);
    expect(searchSentences(sampleSentences, '   ')).toHaveLength(0);
  });

  it('應支援不區分大小寫之精確搜尋', () => {
    const matches = searchSentences(
      [{ id: 's-1', text: 'ASR 語音辨識與 LLM 校正', start_time: 0 }],
      'asr'
    );
    expect(matches).toHaveLength(1);
  });

  it('應支援 Enter / Shift+Enter 循環切換匹配項目', () => {
    const matches: SearchMatch[] = [
      { sentenceId: 's-2', text: '空性正見', startTime: 15.5, index: 0 },
      { sentenceId: 's-3', text: '緣起空性', startTime: 32.0, index: 1 },
    ];
    // Next
    expect(navigateMatch(matches, 0, 'next')).toBe(1);
    expect(navigateMatch(matches, 1, 'next')).toBe(0); // 循環回到第一個
    // Prev
    expect(navigateMatch(matches, 1, 'prev')).toBe(0);
    expect(navigateMatch(matches, 0, 'prev')).toBe(1); // 循環回到最後一個
  });
});
