/**
 * review.js - Web Review Console Engine
 * Handles Passkey authentication, audio snippet playback, diff rendering, and patch application.
 */

import { computeSentenceDiff } from './annotation.js';

const MASTER_PASSKEY_HASH = 'geshe2026'; // Default admin passkey

export function verifyAdminPasskey(passkey) {
  if (!passkey) return false;
  return passkey.trim() === MASTER_PASSKEY_HASH;
}

export function calculateAudioSliceRange(start, end, maxDuration = 3600.0, padding = 1.5) {
  const safeStart = Math.max(0.0, start - padding);
  const safeEnd = Math.min(maxDuration, end + padding);
  return {
    start: Number(safeStart.toFixed(2)),
    end: Number(safeEnd.toFixed(2)),
    targetDuration: Number((safeEnd - safeStart).toFixed(2))
  };
}

export function applyReviewPatchToSession(sessionData, patch) {
  if (!sessionData || !patch || !patch.sentenceId) return sessionData;
  const clone = JSON.parse(JSON.stringify(sessionData));

  let found = false;
  if (clone.paragraphs) {
    for (const p of clone.paragraphs) {
      if (p.sentences) {
        for (const s of p.sentences) {
          if (s.id === patch.sentenceId) {
            s.text = patch.correctedText;
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
  }
  return clone;
}

export function playAudioSlice(audioElement, start, end) {
  if (!audioElement) return;
  try {
    audioElement.currentTime = start;
    audioElement.play();

    const checkInterval = setInterval(() => {
      if (audioElement.currentTime >= end || audioElement.paused) {
        audioElement.pause();
        clearInterval(checkInterval);
      }
    }, 100);
  } catch (e) {
    console.error('Audio slice play error:', e);
  }
}
