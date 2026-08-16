/**
 * app.js - Main Application Orchestrator
 */

import { renderSidebar, updateHeaderTitle } from './sidebar.js';
import { renderTOC, applyActiveHighlight } from './toc.js';
import { initSyncPlayer, updateSession, getCurrentTimeScaleRatio } from './syncPlayer.js';
import { initSearch } from './search.js';

let courseData = null;
let tocData = null;
let currentSessionData = null;
let currentSessionId = null;
let allFlattenedSentences = [];

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  initSidebarToggle();
  initMobileSidebarToggle();
  initFontSizeControls();
  initSearch();
  await loadCourseData();
});

async function loadCourseData() {
  try {
    const courseResp = await fetch('courses/入中論善顯密意疏/course.json');
    courseData = await courseResp.json();

    const tocResp = await fetch('courses/入中論善顯密意疏/toc.json');
    tocData = await tocResp.json();

    // Determine starting session (hash or localStorage or first)
    const savedSession = location.hash ? location.hash.replace('#session-', '') : (localStorage.getItem('last_session_id') || '01');
    const initialSession = courseData.sessions.find(s => s.sessionId === savedSession) || courseData.sessions[0];

    renderSidebar(courseData.sessions, initialSession.sessionId, switchSession, courseData.unavailableSessions);
    renderTOC(tocData.sections, handleSeekTo);
    await switchSession(initialSession);

    // Listen to browser back/forward (Bug 1.3 fix)
    window.addEventListener('hashchange', () => {
      const targetId = location.hash.replace('#session-', '');
      const target = courseData.sessions.find(s => s.sessionId === targetId);
      // Guard by sessionId, not object identity: the course index object and the
      // loaded session JSON object are never the same reference, so comparing
      // them directly would always be true and cause duplicate loads.
      if (target && currentSessionId !== targetId) switchSession(target);
    });
  } catch (err) {
    console.error('Failed to initialize course data:', err);
  }
}

async function switchSession(session) {
  if (!session) return;

  // Avoid re-loading the session that is already active (Issue #8 P1).
  // This also prevents the hashchange listener from triggering a second load
  // when switchSession() writes location.hash for the same session.
  if (currentSessionId === session.sessionId) return;

  // M6.1 fix (Group A1): Only commit currentSessionId after fetch succeeds,
  // to avoid dead-lock state if jsonUrl returns 404 (e.g. 99B unavailable audio).
  // Also catches network/parse errors (was silently failing before).
  const previousSessionId = currentSessionId;

  renderSidebar(courseData.sessions, session.sessionId, switchSession, courseData.unavailableSessions);
  updateHeaderTitle(session);
  applyActiveHighlight(session.sessionId);

  // Close mobile sidebar on selection
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');

  try {
    const resp = await fetch(session.jsonUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    currentSessionData = await resp.json();
    // Commit state only after successful fetch + parse
    currentSessionId = session.sessionId;
    localStorage.setItem('last_session_id', session.sessionId);
    location.hash = `#session-${session.sessionId}`;
    renderTranscript(currentSessionData);
    setupAudioPlayer(session.audioUrl);
  } catch (err) {
    console.error(`Failed to load session ${session.sessionId}:`, err);
    // Rollback UI highlight to previous session
    if (previousSessionId) {
      applyActiveHighlight(previousSessionId);
      updateHeaderTitle(courseData.sessions.find(s => s.sessionId === previousSessionId));
    }
    // M6.1 add: Toast user-visible error feedback
    showToast(`切換失敗：${session.sessionId}（${err.message}）。請確認音檔是否 available。`);
  }
}

/**
 * M6.1: Lightweight toast notification (avoids pulling in heavy toast libraries).
 * Auto-dismiss after 3s; supports multiple stacked toasts.
 */
function showToast(message) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = 'background:#c62828;color:#fff;padding:12px 16px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.2);max-width:320px;font-size:14px;line-height:1.4;';
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

function renderTranscript(sessionData) {
  const container = document.getElementById('transcript-container');
  if (!container) return;

  allFlattenedSentences = [];
  let sentCounter = 0;
  container.textContent = '';

  sessionData.paragraphs.forEach(p => {
    const pEl = document.createElement('p');
    pEl.className = 'transcript-paragraph';
    pEl.id = p.id;

    p.sentences.forEach(s => {
      const idx = sentCounter++;
      allFlattenedSentences.push(s);
      const span = document.createElement('span');
      span.className = 'sentence';
      span.id = `sent-${idx}`;
      span.dataset.start = String(s.start);
      span.dataset.end = String(s.end);
      span.textContent = s.text;
      pEl.appendChild(span);
      pEl.appendChild(document.createTextNode(' '));
    });

    container.appendChild(pEl);
  });

  // Click-to-Seek binding with Ratio Scaling
  container.querySelectorAll('.sentence').forEach((el, idx) => {
    el.addEventListener('click', () => {
      const audio = document.getElementById('audio-element');
      if (audio) {
        const ratio = getCurrentTimeScaleRatio();
        const rawStart = allFlattenedSentences[idx].start;
        const targetTime = ratio > 0 ? (rawStart * ratio) : rawStart;
        audio.currentTime = targetTime;
        audio.play();
      }
    });
  });

  // Re-apply search highlight on session switch (Bug 4.2 fix)
  const searchInput = document.getElementById('search-input');
  if (searchInput && searchInput.value.trim()) {
    searchInput.dispatchEvent(new Event('input'));
  }
}

function setupAudioPlayer(audioUrl) {
  const audio = document.getElementById('audio-element');
  const nowPlaying = document.getElementById('now-playing-title');
  if (!audio) return;

  audio.src = audioUrl;
  if (nowPlaying && currentSessionData) {
    nowPlaying.textContent = currentSessionData.title;
  }

  // Singleton pattern: init once on first call, then just update target
  initSyncPlayer();
  updateSession(audio, allFlattenedSentences, handleNextSession);
}

function handleNextSession() {
  const currentIdx = courseData.sessions.findIndex(s => s.sessionId === currentSessionData.sessionId);
  if (currentIdx !== -1 && currentIdx < courseData.sessions.length - 1) {
    const nextSession = courseData.sessions[currentIdx + 1];
    switchSession(nextSession).then(() => {
      const audio = document.getElementById('audio-element');
      if (audio) audio.play();
    });
  }
}

function handleSeekTo(targetSessionId, timestamp) {
  const targetSession = courseData.sessions.find(s => s.sessionId === targetSessionId);
  if (!targetSession) return;

  // M6.2 fix (Qwen F1): timestamp=0 means "missing/unannotated" — don't seek to 0.
  // Instead, switch session + show toast + scroll to first paragraph.
  const timestampPending = timestamp === 0;

  switchSession(targetSession).then(() => {
    const audio = document.getElementById('audio-element');
    if (!audio) return;

    // Wait for metadata before setting currentTime (Bug 1.2 fix)
    const applySeek = () => {
      if (timestampPending) {
        // Don't seek; just play from current position (defaults to 0).
        // Show toast so user knows the chapter timestamp is missing.
        showToast(`${targetSessionId} 章節起點未標註，目前從頭播放。`);
      } else {
        const ratio = getCurrentTimeScaleRatio();
        const targetTime = ratio > 0 ? (timestamp * ratio) : timestamp;
        audio.currentTime = targetTime;
      }
      audio.play();

      // Smooth-scroll to target paragraph (Bug 8.1 fix)
      const targetParaId = timestampPending ? currentSessionData.paragraphs[0].id : findParagraphByTime(timestamp);
      if (targetParaId) {
        const el = document.getElementById(targetParaId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    if (audio.readyState >= 1 && audio.duration > 0) {
      applySeek();
    } else {
      audio.addEventListener('loadedmetadata', applySeek, { once: true });
    }
  });
}

function findParagraphByTime(timestamp) {
  if (!currentSessionData || !currentSessionData.paragraphs) return null;
  for (const p of currentSessionData.paragraphs) {
    if (timestamp >= p.start && timestamp <= p.end) {
      return p.id;
    }
  }
  return null;
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    btn.textContent = document.body.classList.contains('dark-mode') ? '☀️ 淺色模式' : '🌙 深色模式';
  });
}

function initMobileSidebarToggle() {
  const btn = document.getElementById('mobile-sidebar-btn');
  const sidebar = document.querySelector('.sidebar');
  if (!btn || !sidebar) return;

  btn.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });
}

/**
 * Desktop collapsible sidebar toggle.
 * Toggles .sidebar-collapsed on .app-layout; main content auto-expands to 100%.
 * Default: expanded on desktop (>1024px), collapsed on smaller screens.
 */
function initSidebarToggle() {
  const btn = document.getElementById('sidebar-toggle');
  const layout = document.querySelector('.app-layout');
  if (!btn || !layout) return;

  // Default state based on viewport width
  const isDesktop = window.innerWidth > 1024;
  if (!isDesktop) {
    layout.classList.add('sidebar-collapsed');
  }

  btn.addEventListener('click', () => {
    layout.classList.toggle('sidebar-collapsed');
  });

  // Persist preference
  const saved = localStorage.getItem('sidebar_collapsed');
  if (saved === 'true') {
    layout.classList.add('sidebar-collapsed');
  } else if (saved === 'false') {
    layout.classList.remove('sidebar-collapsed');
  }

  // Save on toggle
  const observer = new MutationObserver(() => {
    localStorage.setItem('sidebar_collapsed', layout.classList.contains('sidebar-collapsed') ? 'true' : 'false');
  });
  observer.observe(layout, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Font size controls (A- / A+).
 * Adjusts the transcript font size and persists the scale factor.
 */
function initFontSizeControls() {
  const decreaseBtn = document.getElementById('font-decrease');
  const increaseBtn = document.getElementById('font-increase');
  const label = document.getElementById('font-size-label');
  const transcript = document.getElementById('transcript-container');
  if (!decreaseBtn || !increaseBtn || !label || !transcript) return;

  const BASE = 1.1; // rem, matches .transcript-section font-size
  let scale = parseFloat(localStorage.getItem('font_scale') || '1');
  applyFontScale(scale);

  decreaseBtn.addEventListener('click', () => {
    scale = Math.max(0.8, +(scale - 0.1).toFixed(1));
    applyFontScale(scale);
  });

  increaseBtn.addEventListener('click', () => {
    scale = Math.min(1.6, +(scale + 0.1).toFixed(1));
    applyFontScale(scale);
  });

  function applyFontScale(s) {
    transcript.style.fontSize = `${(BASE * s).toFixed(2)}rem`;
    label.textContent = `${Math.round(s * 100)}%`;
    localStorage.setItem('font_scale', String(s));
  }
}
