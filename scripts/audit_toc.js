#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const COURSE_DIR = path.join(process.cwd(), 'courses/入中論善顯密意疏');
const COURSE_PATH = path.join(COURSE_DIR, 'course.json');
const TOC_PATH = path.join(COURSE_DIR, 'toc.json');
const REPORT_PATH = path.join(process.cwd(), 'docs/TOC_DATA_AUDIT.md');
const SPAN_REVIEW_THRESHOLD = 20;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function numericSessionPart(sessionId) {
  const match = String(sessionId).match(/^(\d{1,3})/);
  return match ? Number(match[1]) : null;
}

function getNodeSessions(node) {
  if (Array.isArray(node.sessionIds) && node.sessionIds.length > 0) return node.sessionIds;
  return node.sessionId ? [node.sessionId] : [];
}

function walkToc(nodes, visit, parents = []) {
  for (const node of nodes || []) {
    visit(node, parents);
    walkToc(node.children, visit, [...parents, node]);
  }
}

function flattenSentences(session) {
  return session.paragraphs.flatMap(paragraph => paragraph.sentences);
}

function audit() {
  const course = readJson(COURSE_PATH);
  const toc = readJson(TOC_PATH);
  const publishedSessions = course.sessions.map(session => session.sessionId);
  const publishedSet = new Set(publishedSessions);

  const broadSpans = [];
  const zeroTimestampNodes = [];
  const invalidTargets = [];
  const preciseAnchorSessions = new Set();
  const allTargetSessions = new Set();

  const sessionDurations = new Map(course.sessions.map(entry => {
    const session = readJson(path.join(process.cwd(), entry.jsonUrl));
    const sentences = flattenSentences(session);
    return [entry.sessionId, sentences.at(-1)?.end || 0];
  }));

  walkToc(toc.sections, (node, parents) => {
    const nodePath = parents.map(parent => parent.title).concat(node.title).join(' > ');
    const sessions = getNodeSessions(node);
    for (const sessionId of sessions) allTargetSessions.add(sessionId);

    const numbers = sessions.map(numericSessionPart).filter(Number.isFinite);
    if (numbers.length >= 2) {
      const span = Math.max(...numbers) - Math.min(...numbers);
      if (span > SPAN_REVIEW_THRESHOLD) {
        broadSpans.push({ path: nodePath, sessionId: node.sessionId, sessionIds: sessions, span, timestamp: node.timestamp });
      }
    }

    if (node.timestamp === 0) {
      zeroTimestampNodes.push({ path: nodePath, sessionId: node.sessionId, sessionIds: sessions, page: node.page });
    }

    if (node.sessionId && typeof node.timestamp === 'number' && node.timestamp > 0) {
      if (!publishedSet.has(node.sessionId)) {
        invalidTargets.push({ path: nodePath, sessionId: node.sessionId, reason: 'session_not_published' });
      } else if (node.timestamp > (sessionDurations.get(node.sessionId) || 0) + 1) {
        invalidTargets.push({ path: nodePath, sessionId: node.sessionId, timestamp: node.timestamp, reason: 'timestamp_out_of_range' });
      } else {
        preciseAnchorSessions.add(node.sessionId);
      }
    }
  });

  const coverage = toc.coverage || {};
  const explicit = new Set([
    ...(coverage.exemptions || []),
    ...(coverage.needsReview || []),
    ...(coverage.missingAnchors || [])
  ]);
  const unaccountedSessions = publishedSessions.filter(sessionId => !preciseAnchorSessions.has(sessionId) && !explicit.has(sessionId));

  return {
    generatedAt: new Date().toISOString(),
    threshold: { broadSessionSpan: SPAN_REVIEW_THRESHOLD },
    totals: {
      publishedSessions: publishedSessions.length,
      preciseAnchorSessions: preciseAnchorSessions.size,
      allTargetSessions: allTargetSessions.size,
      broadSpans: broadSpans.length,
      zeroTimestampNodes: zeroTimestampNodes.length,
      invalidTargets: invalidTargets.length,
      unaccountedSessions: unaccountedSessions.length,
    },
    broadSpans,
    zeroTimestampNodes,
    invalidTargets,
    unaccountedSessions,
  };
}

function formatList(items, formatter, limit = 40) {
  if (items.length === 0) return '- None\n';
  const shown = items.slice(0, limit).map(formatter).join('\n');
  const more = items.length > limit ? '\n- ... ' + (items.length - limit) + ' more' : '';
  return shown + more + '\n';
}

function renderMarkdown(result) {
  return '# TOC Data Audit\n\n' +
    'Generated: ' + result.generatedAt + '\n\n' +
    '## Summary\n\n' +
    '- Published sessions: ' + result.totals.publishedSessions + '\n' +
    '- Sessions with precise positive TOC anchors: ' + result.totals.preciseAnchorSessions + '\n' +
    '- TOC target sessions mentioned anywhere: ' + result.totals.allTargetSessions + '\n' +
    '- Broad sessionIds spans over ' + result.threshold.broadSessionSpan + ': ' + result.totals.broadSpans + '\n' +
    '- timestamp=0 pending nodes: ' + result.totals.zeroTimestampNodes + '\n' +
    '- Invalid TOC targets: ' + result.totals.invalidTargets + '\n' +
    '- Published sessions without explicit TOC coverage status: ' + result.totals.unaccountedSessions + '\n\n' +
    '## Broad Session Spans\n\n' +
    'These nodes mix sessions whose numeric lesson span is wider than ' + result.threshold.broadSessionSpan + '. M3 marks them as audit findings; M4 must decide whether to split anchors, keep as inferred, or retain needs-review status.\n\n' +
    formatList(result.broadSpans, item => '- span=' + item.span + '; sessionId=' + item.sessionId + '; sessions=' + item.sessionIds.join(', ') + '; path=' + item.path, 60) + '\n' +
    '## Pending Timestamp Nodes\n\n' +
    'Nodes with timestamp=0 are not precise playback anchors. M2 renders them as pending; M3 keeps them auditable.\n\n' +
    formatList(result.zeroTimestampNodes, item => '- sessionId=' + item.sessionId + '; sessions=' + item.sessionIds.join(', ') + '; page=' + (item.page || 'n/a') + '; path=' + item.path, 60) + '\n' +
    '## Invalid Targets\n\n' +
    formatList(result.invalidTargets, item => '- ' + item.reason + ': sessionId=' + item.sessionId + '; timestamp=' + (item.timestamp ?? 'n/a') + '; path=' + item.path, 40) + '\n' +
    '## Sessions Without Explicit Coverage Status\n\n' +
    'These sessions do not have a precise positive TOC anchor and are not yet listed in toc.coverage. M3 should move this list into toc.coverage.needsReview so missing anchors are explicit rather than silent.\n\n' +
    formatList(result.unaccountedSessions, sessionId => '- ' + sessionId, 160);
}

const result = audit();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  fs.writeFileSync(REPORT_PATH, renderMarkdown(result));
  console.log('Wrote ' + REPORT_PATH);
  console.log(JSON.stringify(result.totals, null, 2));
}
