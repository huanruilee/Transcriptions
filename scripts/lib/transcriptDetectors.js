function sentencesWithParagraphs(session) {
  return (session.paragraphs || []).flatMap((paragraph) =>
    (paragraph.sentences || []).map((sentence) => ({ paragraph, sentence })),
  );
}

function context(text, start, length) {
  return text.slice(Math.max(0, start - 12), start + length + 12);
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectTextCandidates(session, { sourceText = '', corrections = [] } = {}) {
  const candidates = [];
  for (const { paragraph, sentence } of sentencesWithParagraphs(session)) {
    for (const correction of corrections) {
      const { from, to } = correction;
      if (!from || !to || !sourceText.includes(to)) continue;
      const match = new RegExp(`${escaped(from)}(?=$|[，。？！、；：的與及是])`, 'u').exec(sentence.text || '');
      if (!match) continue;
      candidates.push({
        ruleId: 'D1.KNOWN_SOURCE_GROUNDED_CORRECTION',
        sessionId: String(session.sessionId),
        paragraphId: paragraph.id,
        sentenceId: sentence.id,
        operation: 'CORRECT',
        original: from,
        replacement: to,
        confidence: 'LIKELY',
        reason: 'known_correction_supported_by_source',
        context: context(sentence.text, match.index, from.length),
      });
    }
  }
  return candidates;
}

export function detectSentenceBoundaryCandidates(session) {
  const candidates = [];
  for (const { paragraph, sentence } of sentencesWithParagraphs(session)) {
    const text = sentence.text || '';
    const match = /[？！](?=\S)/u.exec(text);
    if (!match) continue;
    candidates.push({
      ruleId: 'D2.INTERNAL_DISCOURSE_BOUNDARY',
      sessionId: String(session.sessionId),
      paragraphId: paragraph.id,
      sentenceId: sentence.id,
      operation: 'SPLIT',
      confidence: 'UNVERIFIED',
      reason: 'audio_alignment_required',
      context: context(text, match.index, 1),
    });
  }
  return candidates;
}

const CONTINUATION_PREFIXES = ['的', '來', '程', '債', '體及'];

export function detectParagraphBoundaryCandidates(session) {
  const paragraphs = session.paragraphs || [];
  const candidates = [];
  for (let index = 0; index < paragraphs.length - 1; index += 1) {
    const target = paragraphs[index];
    const source = paragraphs[index + 1];
    const last = target.sentences?.at(-1);
    const first = source.sentences?.[0];
    if (!last || !first || /[。？！；：]$/u.test(last.text || '')) continue;
    const prefix = CONTINUATION_PREFIXES.find((value) => (first.text || '').startsWith(value));
    if (!prefix) continue;
    candidates.push({
      ruleId: 'D3.CROSS_PARAGRAPH_CONTINUATION',
      sessionId: String(session.sessionId),
      targetParagraphId: target.id,
      sourceParagraphId: source.id,
      lastSentenceId: last.id,
      firstSentenceId: first.id,
      operation: 'MERGE',
      confidence: 'LIKELY',
      reason: 'word_or_discourse_unit_split_across_paragraphs',
      context: `${(last.text || '').slice(-30)}${(first.text || '').slice(0, 30)}`,
    });
  }
  return candidates;
}

export function detectVerseMappingCandidates({ session, manifest, sourceText = '' }) {
  if (String(session.sessionId) !== String(manifest?.sessionId)) return [];
  const index = new Map(sentencesWithParagraphs(session).map(({ paragraph, sentence }) => [
    sentence.id,
    { paragraph, sentence },
  ]));
  const candidates = [];
  for (const annotation of manifest.annotations || []) {
    const hit = index.get(annotation.sentenceId);
    const quote = annotation.quoteText || '';
    if (!hit || !quote || !sourceText.includes(quote) || !(hit.sentence.text || '').includes(quote)) continue;
    candidates.push({
      ruleId: 'D4.SOURCE_AND_SESSION_VERSE_MATCH',
      sessionId: String(session.sessionId),
      paragraphId: hit.paragraph.id,
      sentenceId: hit.sentence.id,
      quoteText: quote,
      operation: 'ANNOTATE',
      confidence: 'CONFIRMED',
      status: 'source_match',
      reason: 'source_session_and_sentence_match',
      context: quote.slice(0, 60),
    });
  }
  return candidates;
}
