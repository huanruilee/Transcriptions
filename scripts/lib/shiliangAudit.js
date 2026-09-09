export function stripOfficialPageArtifacts(text) {
  return String(text)
    .replace(/(?:^|\n)\s*\d+\s*(?=\n|\f)/g, '\n')
    .replace(/\f/g, '');
}

export function normalizeOfficialTranscript(text) {
  return stripOfficialPageArtifacts(text)
    .replace(/[\r\n\t ]/g, '')
    .replace(/[「」『』“”‘’]/g, '')
    .replace(/[，。！？；：、,.!?;:]/g, '')
    .replace(/[（()）【】《》〈〉]/g, '');
}

export function findTimestampViolations(sentences) {
  const violations = [];
  let previous = null;
  for (const sentence of sentences) {
    const { id: sentenceId, start, end } = sentence;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      violations.push({ type: 'NON_FINITE', sentenceId, start, end });
      previous = null;
      continue;
    }
    if (end < start) {
      violations.push({ type: 'NEGATIVE_DURATION', sentenceId, start, end });
    } else if (previous && start < previous.end) {
      violations.push({
        type: 'ROLLBACK',
        previousId: previous.id,
        sentenceId,
        previousEnd: previous.end,
        start,
        delta: Math.round((start - previous.end) * 1000) / 1000,
      });
    }
    previous = sentence;
  }
  return violations;
}
