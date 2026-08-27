#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const COURSE_DIR = path.join(process.cwd(), 'courses/入中論善顯密意疏');
const TOC_PATH = path.join(COURSE_DIR, 'toc.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkToc(nodes, visit, parents = []) {
  for (const node of nodes || []) {
    visit(node, parents);
    walkToc(node.children, visit, [...parents, node]);
  }
}

function numericSessionPart(sessionId) {
  const match = String(sessionId).match(/^(\d{1,3})/);
  return match ? Number(match[1]) : 0;
}

function anchorStatus(node) {
  if (node.reviewStatus === 'needs_review' || node.needsReview === true) return 'needs_review';
  if (node.timestamp === 0) return 'missing_timestamp';
  return 'inferred';
}

function buildSessionAnchors(toc) {
  const anchors = [];
  let ordinal = 0;

  walkToc(toc.sections, (node, parents) => {
    if (!node.sessionId || typeof node.timestamp !== 'number') return;
    const outlinePath = parents.map(parent => parent.title).concat(node.title);
    anchors.push({
      anchorId: `toc-anchor-${String(++ordinal).padStart(4, '0')}`,
      sessionId: node.sessionId,
      timestamp: node.timestamp,
      title: node.title,
      page: node.page || null,
      outlinePath,
      status: anchorStatus(node),
      reviewReason: node.reviewReason || null,
    });
  });

  return anchors.sort((a, b) => {
    const na = numericSessionPart(a.sessionId);
    const nb = numericSessionPart(b.sessionId);
    if (na !== nb) return na - nb;
    if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId);
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.anchorId.localeCompare(b.anchorId);
  });
}

const toc = readJson(TOC_PATH);
toc.modelVersion = 'toc-v2';
toc.modelGeneratedBy = 'scripts/build_toc_model.js';
toc.modelGeneratedAt = new Date().toISOString();
toc.modelNotes = [
  '`sections` remains the book-outline tree for doctrinal structure.',
  '`sessionAnchors` is the playback/navigation model and uses only primary sessionId anchors.',
  '`reviewStatus` and `coverage` describe audit state; they are not doctrinal acceptance.'
];
toc.sessionAnchors = buildSessionAnchors(toc);

fs.writeFileSync(TOC_PATH, JSON.stringify(toc, null, 2) + '\n');
console.log(JSON.stringify({ sessionAnchors: toc.sessionAnchors.length }, null, 2));
