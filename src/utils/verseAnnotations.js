function canonicalSessionId(rawId) {
  const value = String(rawId ?? '').trim();
  return /^\d+$/.test(value) ? String(Number(value)) : value;
}

export function selectVerseAnnotations(document, activeSessionId) {
  if (!document || !activeSessionId) return [];

  const targetId = canonicalSessionId(activeSessionId);
  if (Array.isArray(document.manifests)) {
    const manifest = document.manifests.find(
      ({ sessionId }) => canonicalSessionId(sessionId) === targetId,
    );
    return Array.isArray(manifest?.annotations) ? manifest.annotations : [];
  }

  if (canonicalSessionId(document.sessionId) !== targetId) return [];
  return Array.isArray(document.annotations) ? document.annotations : [];
}
