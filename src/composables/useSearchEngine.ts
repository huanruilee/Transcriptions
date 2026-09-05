export interface SearchMatch {
  sentenceId: string;
  text: string;
  startTime: number;
  index: number;
}

export interface SentenceInput {
  id?: string;
  sentence_id?: string;
  text?: string;
  original_text?: string;
  start_time?: number;
}

export function searchSentences(sentences: SentenceInput[], query: string): SearchMatch[] {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();

  const results: SearchMatch[] = [];
  sentences.forEach((s, idx) => {
    const text = s.text || s.original_text || '';
    if (text.toLowerCase().includes(q)) {
      results.push({
        sentenceId: s.id || s.sentence_id || `sent-${idx}`,
        text: text,
        startTime: s.start_time || 0,
        index: results.length,
      });
    }
  });

  return results;
}

export function navigateMatch(
  matches: SearchMatch[],
  currentIndex: number,
  direction: 'next' | 'prev'
): number {
  if (matches.length === 0) return -1;
  if (direction === 'next') {
    return (currentIndex + 1) % matches.length;
  } else {
    return (currentIndex - 1 + matches.length) % matches.length;
  }
}
