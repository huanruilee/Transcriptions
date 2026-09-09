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
