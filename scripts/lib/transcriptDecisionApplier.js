function sentenceLocation(session, sentenceId) {
  for (let paragraphIndex = 0; paragraphIndex < session.paragraphs.length; paragraphIndex += 1) {
    const sentenceIndex = session.paragraphs[paragraphIndex].sentences.findIndex(
      ({ id }) => id === sentenceId,
    );
    if (sentenceIndex >= 0) return { paragraphIndex, sentenceIndex };
  }
  return null;
}

function classifyDecision(sessions, decision) {
  if (decision.operation !== 'MERGE' || decision.confidence !== 'CONFIRMED') {
    return { action: 'skip' };
  }
  const session = sessions[decision.sessionId];
  if (!session) throw new Error(`session not found: ${decision.sessionId}`);
  const targetIndex = session.paragraphs.findIndex(({ id }) => id === decision.targetParagraphId);
  const sourceIndex = session.paragraphs.findIndex(({ id }) => id === decision.sourceParagraphId);
  const last = sentenceLocation(session, decision.lastSentenceId);
  const first = sentenceLocation(session, decision.firstSentenceId);

  if (last && first && last.paragraphIndex === first.paragraphIndex
    && first.sentenceIndex === last.sentenceIndex + 1) return { action: 'skip' };

  if (targetIndex >= 0 && sourceIndex < 0) {
    if (last && first && last.paragraphIndex === targetIndex && first.paragraphIndex === targetIndex
      && first.sentenceIndex === last.sentenceIndex + 1) return { action: 'skip' };
  }
  if (targetIndex < 0 || sourceIndex < 0) throw new Error(`paragraph not found for ${decision.candidateId}`);
  if (sourceIndex !== targetIndex + 1) throw new Error(`paragraphs are not adjacent for ${decision.candidateId}`);

  const target = session.paragraphs[targetIndex];
  const source = session.paragraphs[sourceIndex];
  if (target.sentences.at(-1)?.id !== decision.lastSentenceId
    || source.sentences[0]?.id !== decision.firstSentenceId) {
    throw new Error(`sentence boundary mismatch for ${decision.candidateId}`);
  }
  return { action: source.heading ? 'shift' : 'merge', sessionId: decision.sessionId };
}

export function applyDecisionLedger({
  sessions,
  ledger,
  expectedBaselineCommit,
  expectedManifestSha256,
}) {
  if (ledger.schema !== 'transcript-decision-ledger/v1') throw new Error('unsupported ledger schema');
  if (ledger.baselineCommit !== expectedBaselineCommit) throw new Error('baseline commit mismatch');
  if (ledger.inputManifestSha256 !== expectedManifestSha256) throw new Error('manifest hash mismatch');
  const ids = ledger.decisions.map(({ candidateId }) => candidateId);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate candidateId in ledger');

  const plan = ledger.decisions.map((decision) => ({
    decision,
    ...classifyDecision(sessions, decision),
  }));
  const result = structuredClone(sessions);
  const changed = new Set();
  let applied = 0;
  let skipped = 0;

  for (const item of plan) {
    if (item.action === 'skip') {
      skipped += 1;
      continue;
    }
    const paragraphs = result[item.sessionId].paragraphs;
    const targetIndex = paragraphs.findIndex(({ id }) => id === item.decision.targetParagraphId);
    const sourceIndex = paragraphs.findIndex(({ id }) => id === item.decision.sourceParagraphId);
    if (sourceIndex !== targetIndex + 1) {
      throw new Error(`validated merge order changed for ${item.decision.candidateId}`);
    }
    const target = paragraphs[targetIndex];
    const source = paragraphs[sourceIndex];
    if (item.action === 'shift') {
      const moved = target.sentences.pop();
      source.sentences.unshift(moved);
      source.start = moved.start;
      if (target.sentences.length === 0) {
        paragraphs.splice(targetIndex, 1);
      } else {
        target.end = target.sentences.at(-1).end;
      }
    } else {
      target.sentences.push(...source.sentences);
      target.end = target.sentences.at(-1).end;
      paragraphs.splice(sourceIndex, 1);
    }
    changed.add(item.sessionId);
    applied += 1;
  }

  return {
    sessions: result,
    report: { applied, skipped, blocked: 0, changedSessionIds: [...changed].sort() },
  };
}
