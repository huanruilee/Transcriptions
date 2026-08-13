/**
 * app.js - Main Application Orchestrator
 */

import { renderSidebar, updateHeaderTitle } from './sidebar.js';
import { renderTOC } from './toc.js';
import { initSyncPlayer, updateSession, getCurrentTimeScaleRatio } from './syncPlayer.js';
import { initSearch } from './search.js';

let courseData = null;
let tocData = null;
let currentSessionData = null;
let allFlattenedSentences = [];

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  initMobileSidebarToggle();
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

    renderSidebar(courseData.sessions, initialSession.sessionId, switchSession);
    renderTOC(tocData.sections, handleSeekTo);
    await switchSession(initialSession);

    // Listen to browser back/forward (Bug 1.3 fix)
    window.addEventListener('hashchange', () => {
      const targetId = location.hash.replace('#session-', '');
      const target = courseData.sessions.find(s => s.sessionId === targetId);
      if (target && target !== currentSessionData) switchSession(target);
    });
  } catch (err) {
    console.error('Failed to initialize course data:', err);
  }
}

async function switchSession(session) {
  if (!session) return;

  localStorage.setItem('last_session_id', session.sessionId);
  location.hash = `#session-${session.sessionId}`;

  renderSidebar(courseData.sessions, session.sessionId, switchSession);
  updateHeaderTitle(session);

  // Close mobile sidebar on selection
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');

  try {
    const resp = await fetch(session.jsonUrl);
    currentSessionData = await resp.json();
    renderTranscript(currentSessionData);
    setupAudioPlayer(session.audioUrl);
  } catch (err) {
    console.error(`Failed to load session ${session.sessionId}:`, err);
  }
}

function renderTranscript(sessionData) {
  const container = document.getElementById('transcript-container');
  if (!container) return;

  allFlattenedSentences = [];
  let sentCounter = 0;
  let html = '';

  sessionData.paragraphs.forEach(p => {
    html += `<p class="transcript-paragraph" id="${p.id}">`;
    p.sentences.forEach(s => {
      const idx = sentCounter++;
      allFlattenedSentences.push(s);
      html += `<span class="sentence" id="sent-${idx}" data-start="${s.start}" data-end="${s.end}">${s.text}</span> `;
    });
    html += `</p>`;
  });

  container.innerHTML = html;

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

  switchSession(targetSession).then(() => {
    const audio = document.getElementById('audio-element');
    if (!audio) return;

    // Wait for metadata before setting currentTime (Bug 1.2 fix)
    const applySeek = () => {
      const ratio = getCurrentTimeScaleRatio();
      const targetTime = ratio > 0 ? (timestamp * ratio) : timestamp;
      audio.currentTime = targetTime;
      audio.play();

      // Smooth-scroll to target paragraph (Bug 8.1 fix)
      const targetParaId = findParagraphByTime(timestamp);
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
