import { createHash } from 'node:crypto';
import { validateContentOverview, finalizeOverviewReview } from '../content_overview_pipeline.mjs';

export const fileDigest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// A later summary review may update contentOverview, never the approved transcript.
export function validateOverviewAmendment({ candidate, published, manifest, amendment }) {
  const errors = [];
  const oldDocument = JSON.parse(candidate);
  const newDocument = JSON.parse(published);
  const { contentOverview: oldOverview, ...oldBody } = oldDocument;
  const { contentOverview: newOverview, ...newBody } = newDocument;
  if (JSON.stringify(oldBody) !== JSON.stringify(newBody)) errors.push('approved transcript changed');
  if (amendment?.schema !== 'transcript-overview-amendment/v1'
    || amendment.runId !== manifest.runId
    || amendment.candidateDigest !== fileDigest(candidate)
    || amendment.publishedDigest !== fileDigest(published)
    || amendment.overviewDigest !== fileDigest(JSON.stringify(newOverview))) errors.push('amendment binding mismatch');
  errors.push(...validateContentOverview(newOverview, newDocument, {
    sourceTranscriptId: oldOverview.sourceTranscriptId,
  }).errors.map((error) => error.code));
  if (finalizeOverviewReview(newOverview, newOverview.review).status !== 'ai-reviewed') errors.push('overview not reviewed');
  return errors;
}
