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

export function validateDecisionLedger(ledger, { first, last }) {
  const decisions = Array.isArray(ledger?.decisions) ? ledger.decisions : [];
  const expected = Array.from({ length: last - first + 1 }, (_, index) => `sent-${first + index}`);
  const seen = new Set();
  const errors = [];
  for (const decision of decisions) {
    if (seen.has(decision.sentenceId)) errors.push(`duplicate sentenceId: ${decision.sentenceId}`);
    seen.add(decision.sentenceId);
  }
  for (const id of expected) {
    if (!seen.has(id)) errors.push(`missing sentenceId: ${id}`);
  }
  for (const id of seen) {
    if (!expected.includes(id)) errors.push(`out-of-range sentenceId: ${id}`);
  }
  const counts = {
    total: decisions.length,
    confirmed: decisions.filter(x => x.confidence === 'CONFIRMED').length,
    likely: decisions.filter(x => x.confidence === 'LIKELY').length,
    uncertain: decisions.filter(x => x.confidence === 'UNCERTAIN').length,
  };
  if (counts.total !== counts.confirmed + counts.likely + counts.uncertain) {
    errors.push('invalid confidence value');
  }
  const canAutoApply = errors.length === 0
    && counts.uncertain === 0
    && counts.likely === 0
    && ledger.minimumWindow !== null;
  return { errors, counts, canAutoApply };
}

export function resolveBoundedTimestampGaps(entries, resolutions) {
  const byId = new Map(resolutions.map(item => [item.sentenceId, item]));
  return entries.map((entry, index) => {
    const resolution = byId.get(entry.sentenceId);
    if (!resolution) return { ...entry };
    if (entry.proposedStart !== null || entry.proposedEnd !== null || entry.confidence !== 'UNCERTAIN') {
      throw new Error(`${entry.sentenceId} is not an unresolved gap`);
    }
    const left = entries[index - 1];
    const right = entries[index + 1];
    if (!left || left.proposedEnd !== resolution.start) {
      throw new Error(`${entry.sentenceId} does not meet left anchor`);
    }
    if (!right || right.proposedStart !== resolution.end) {
      throw new Error(`${entry.sentenceId} does not meet right anchor`);
    }
    return {
      ...entry,
      rawSegmentStartId: resolution.rawSegmentStartId,
      rawSegmentEndId: resolution.rawSegmentEndId,
      proposedStart: resolution.start,
      proposedEnd: resolution.end,
      confidence: 'BOUNDED_CONFIRMED',
      evidencePhrase: `${entry.evidencePhrase}; bounded by adjacent confirmed anchors`,
    };
  });
}
