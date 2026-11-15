#!/usr/bin/env node
/**
 * Shared deterministic safety guards for transcript batch scripts:
 * - Pre-flight locked-session registry check (config/locked-sessions.json)
 * - URL masking/unmasking before punctuation normalization
 * - Immutable rawText assertion
 * - Stage 6 contentOverview hydration & sourceDigest recomputation
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeSourceDigest,
  hydrateEvidenceQuotes,
  normalizeCandidateEvidence,
} from '../content_overview_pipeline.mjs';

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadLockedSessions(repoRoot = DEFAULT_REPO_ROOT) {
  const lockPath = path.join(repoRoot, 'config/locked-sessions.json');
  if (!fs.existsSync(lockPath)) return [];
  const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  return Array.isArray(data.locked) ? data.locked : [];
}

export function isLockedSession(filePath, repoRoot = DEFAULT_REPO_ROOT) {
  const rel = path.isAbsolute(filePath)
    ? path.relative(repoRoot, filePath).replace(/\\/g, '/')
    : String(filePath).replace(/\\/g, '/');
  return loadLockedSessions(repoRoot).some((entry) => entry.relativePath === rel);
}

export function maskUrls(text) {
  const urls = [];
  const masked = String(text || '').replace(/https?:\/\/[^\s)）」』>]+/g, (url) => {
    const token = `__URL_${urls.length}__`;
    urls.push(url);
    return token;
  });
  return { masked, urls };
}

export function unmaskUrls(text, urls) {
  return String(text || '').replace(/__URL_(\d+)__/g, (_, idx) => urls[Number(idx)] ?? '');
}

export function assertRawTextPreserved(beforeSession, afterSession) {
  const beforeMap = new Map();
  for (const p of beforeSession?.paragraphs || []) {
    for (const s of p.sentences || []) {
      if (typeof s.rawText === 'string') beforeMap.set(s.id, s.rawText);
    }
  }
  for (const p of afterSession?.paragraphs || []) {
    for (const s of p.sentences || []) {
      if (beforeMap.has(s.id) && s.rawText !== beforeMap.get(s.id)) {
        throw new Error(`rawText mutation detected on sentence ${s.id}`);
      }
    }
  }
}

export function syncContentOverview(session, timestamp = new Date().toISOString()) {
  if (!session?.contentOverview) return session;
  const normalized = normalizeCandidateEvidence(session.contentOverview, session);
  const hydrated = hydrateEvidenceQuotes(normalized, session);
  hydrated.sourceDigest = computeSourceDigest(session);
  hydrated.generatedAt = timestamp;
  session.contentOverview = hydrated;
  return session;
}
