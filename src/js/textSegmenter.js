/**
 * textSegmenter.js - Automatic Text Segmentation Algorithm
 * Segments raw subtitle/transcript items into structured paragraphs (<p>)
 * based on pause duration (>1.5s) and semantic punctuation / transition words.
 */

export function segmentSentences(sentences, pauseThresholdSeconds = 1.5) {
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return [];
  }

  const paragraphs = [];
  let currentGroup = [];
  let paragraphStart = sentences[0].start;

  const transitionWords = ['好', '嗯', '總之', '另外', '接下去', '第一', '第二', '因此', '對呀', '問題是'];

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    currentGroup.push(s);

    const isLast = (i === sentences.length - 1);
    let shouldBreak = false;

    if (!isLast) {
      const nextS = sentences[i + 1];
      const pauseDuration = nextS.start - s.end;

      // Rule 1: Pause > 1.5s
      if (pauseDuration >= pauseThresholdSeconds) {
        shouldBreak = true;
      }

      // Rule 2: Sentence count >= 3 and starts with a transition word
      if (currentGroup.length >= 3) {
        const startsWithTransition = transitionWords.some(w => nextS.text.trim().startsWith(w));
        if (startsWithTransition) {
          shouldBreak = true;
        }
      }
    } else {
      shouldBreak = true;
    }

    if (shouldBreak) {
      const paragraphEnd = s.end;
      paragraphs.push({
        id: `p-${paragraphs.length + 1}`,
        start: paragraphStart,
        end: paragraphEnd,
        sentences: currentGroup
      });
      currentGroup = [];
      if (!isLast) {
        paragraphStart = sentences[i + 1].start;
      }
    }
  }

  return paragraphs;
}
