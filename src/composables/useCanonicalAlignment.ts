export interface VerseItem {
  verse_id: string;
  chapter: string;
  number: number;
  root_text: string;
  tibetan?: string;
}

export interface SentenceLike {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
  root_verse_id?: string;
}

export interface CorrectionSuggestion {
  suspicious: string;
  canonical: string;
}

export function findVerseById(verses: VerseItem[], verseId: string): VerseItem | undefined {
  return verses.find((v) => v.verse_id === verseId);
}

export function alignSentenceWithVerse(
  sentence: SentenceLike,
  verses: VerseItem[]
): VerseItem | undefined {
  if (!sentence.root_verse_id) return undefined;
  return findVerseById(verses, sentence.root_verse_id);
}

export function suggestCanonicalCorrections(
  asrText: string,
  canonicalText: string
): CorrectionSuggestion[] {
  const suggestions: CorrectionSuggestion[] = [];
  if (asrText === canonicalText) return suggestions;

  const minLen = Math.min(asrText.length, canonicalText.length);
  let i = 0;
  while (i < minLen) {
    if (asrText[i] !== canonicalText[i]) {
      // 向後抓取 2 個字元以組成完整佛學詞相 (如「定量」、「現量」)
      const end = Math.min(i + 2, minLen);
      suggestions.push({
        suspicious: asrText.slice(i, end),
        canonical: canonicalText.slice(i, end),
      });
      i = end;
    } else {
      i++;
    }
  }

  return suggestions;
}
