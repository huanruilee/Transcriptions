/**
 * Seek remote audio only after its metadata is available. Setting currentTime
 * while readyState is HAVE_NOTHING is unreliable across browsers.
 */
export function seekAndPlayAudio(audio, time) {
  if (!audio) return Promise.reject(new Error('Audio element is unavailable'));

  const seekAndPlay = () => {
    audio.currentTime = Math.max(0, Number(time) || 0);
    return Promise.resolve(audio.play());
  };

  if (audio.readyState >= 1) return seekAndPlay();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      seekAndPlay().then(resolve, reject);
    };
    const onError = () => {
      cleanup();
      reject(audio.error || new Error('Audio source failed to load'));
    };

    audio.addEventListener('loadedmetadata', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });
    audio.load();
  });
}
