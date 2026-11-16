// Project a version-bound reading approval into the synchronized reader.
// Source session files and publication evidence stay immutable.
async function digest(value) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return 'sha256:' + Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export async function projectApprovedRebuild(sourceText, rebuild) {
  const source = JSON.parse(sourceText);
  const approval = rebuild.readingApproval;
  const contentDigest = await digest(JSON.stringify({sourceDigest: rebuild.sourceDigest, sections: rebuild.sections, ledger: rebuild.ledger, overview: rebuild.overview}));
  if (rebuild.schema !== 'shiliang-source-rebuild/v1' || rebuild.status !== 'reading-approved'
      || rebuild.sessionId !== source.sessionId || rebuild.youtubeVideoId !== source.youtubeVideoId
      || rebuild.humanListened !== false || approval?.type !== 'reading-only'
      || approval.humanListened !== false || approval.approvedBy !== 'Henry'
      || approval.sessionId !== source.sessionId || !/^\d{4}-\d{2}-\d{2}$/.test(approval.approvedAt)
      || approval.sourceDigest !== rebuild.sourceDigest || rebuild.sourceDigest !== await digest(sourceText)
      || approval.contentDigest !== contentDigest) throw new Error('Stale or invalid reading approval');
  const original = source.paragraphs.flatMap(p => p.sentences);
  const rebuilt = rebuild.sections.flatMap(p => p.sentences);
  if (original.length !== rebuilt.length || original.some((s,i) =>
      JSON.stringify(s) !== JSON.stringify(rebuilt[i].raw)
      || s.id !== rebuilt[i].id || s.start !== rebuilt[i].start || s.end !== rebuilt[i].end)) {
    throw new Error('Rebuild source sentence mismatch');
  }
  const paragraphs = [];
  for (const section of rebuild.sections) {
    let sentences = [], length = 0, chunk = 0;
    const flush = () => {
      if (!sentences.length) return;
      paragraphs.push({id: `rebuild-${section.id}-${chunk}`, heading: chunk++ === 0 ? section.heading : null,
        start: sentences[0].start, end: sentences.at(-1).end, sentences});
      sentences = []; length = 0;
    };
    for (const [i,s] of section.sentences.entries()) {
      sentences.push({...s.raw, text: s.text, ...(s.pending.length ? {reviewNeeded: true} : {})});
      length += s.text.length;
      if (length > 600 && /[。！？」』）]$/.test(s.text) && !/^[（），」、；]/.test(section.sentences[i+1]?.text || '')) flush();
    }
    flush();
  }
  return {...source, paragraphs, readerRebuiltAt: approval.approvedAt,
    qualityReview: {...source.qualityReview,
      readerNotice: `正式重整版：已閱讀確認（${approval.approvedBy}，${approval.approvedAt}），未逐句聽核。時間沿用原資料，尚未重新校準。`}};
}
