export function toPlayableAudioUrl(url, basePath = '/') {
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== 'drive.usercontent.google.com') return url;
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${base}remote-audio?url=${encodeURIComponent(url)}`;
}
