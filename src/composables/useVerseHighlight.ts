export interface VerseAnnotation {
  sentenceId: string;
  verseId: number | string;
  quoteText: string;
  status?: string;
}

export interface TextSegment {
  text: string;
  isVerse: boolean;
  verseIds: Array<number | string>;
}

export function splitVerseText(text: string, annotations: VerseAnnotation[] = []): TextSegment[] {
  if (!text || annotations.length === 0) return [{ text, isVerse: false, verseIds: [] }];
  const matches = annotations
    .filter(a => a.quoteText && a.status !== 'uncertain')
    .map(a => ({ ...a, start: text.indexOf(a.quoteText) }))
    .filter(a => a.start >= 0)
    .sort((a, b) => a.start - b.start || b.quoteText.length - a.quoteText.length);
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start), isVerse: false, verseIds: [] });
    segments.push({ text: match.quoteText, isVerse: true, verseIds: [match.verseId] });
    cursor = match.start + match.quoteText.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isVerse: false, verseIds: [] });
  return segments.length ? segments : [{ text, isVerse: false, verseIds: [] }];
}
