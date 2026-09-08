import { describe, expect, it } from 'vitest';
import { splitVerseText } from '../../src/composables/useVerseHighlight';

describe('source-grounded verse highlighting', () => {
  it('only colors an exact source-backed quote range', () => {
    expect(splitVerseText('接著，轉故無解脫，非許不成故。這是解釋。', [
      { sentenceId: 'sent-1', verseId: 192, quoteText: '轉故無解脫，非許不成故', status: 'source_match' },
    ])).toEqual([
      { text: '接著，', isVerse: false, verseIds: [] },
      { text: '轉故無解脫，非許不成故', isVerse: true, verseIds: [192] },
      { text: '。這是解釋。', isVerse: false, verseIds: [] },
    ]);
  });

  it('does not color uncertain or unmatched text', () => {
    expect(splitVerseText('口語解說', [
      { sentenceId: 'sent-1', verseId: 192, quoteText: '轉故無解脫', status: 'uncertain' },
    ])).toEqual([{ text: '口語解說', isVerse: false, verseIds: [] }]);
  });
});
