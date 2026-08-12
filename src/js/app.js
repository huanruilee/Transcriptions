/**
 * app.js - Main Application Orchestrator
 */

import { renderSidebar, updateHeaderTitle } from './sidebar.js';
import { renderTOC } from './toc.js';
import { initSyncPlayer } from './syncPlayer.js';
import { initSearch } from './search.js';

let courseData = null;
let tocData = null;
let currentSessionData = null;
let allFlattenedSentences = [];

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
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
    const savedSession = localStorage.getItem('last_session_id') || location.hash.replace('#session-', '');
    const initialSession = courseData.sessions.find(s => s.sessionId === savedSession) || courseData.sessions[0];

    renderSidebar(courseData.sessions, initialSession.sessionId, switchSession);
    renderTOC(tocData.sections, handleSeekTo);
    await switchSession(initialSession);
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

  // Click-to-Seek binding
  container.querySelectorAll('.sentence').forEach((el, idx) => {
    el.addEventListener('click', () => {
      const audio = document.getElementById('audio-element');
      if (audio) {
        audio.currentTime = allFlattenedSentences[idx].start;
        audio.play();
      }
    });
  });
}

function setupAudioPlayer(audioUrl) {
  const audio = document.getElementById('audio-element');
  const nowPlaying = document.getElementById('now-playing-title');
  if (!audio) return;

  audio.src = audioUrl;
  if (nowPlaying && currentSessionData) {
    nowPlaying.textContent = currentSessionData.title;
  }

  initSyncPlayer(audio, allFlattenedSentences, handleNextSession);
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
  if (targetSession) {
    switchSession(targetSession).then(() => {
      const audio = document.getElementById('audio-element');
      if (audio) {
        audio.currentTime = timestamp;
        audio.play();
      }
    });
  }
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    btn.textContent = document.body.classList.contains('dark-mode') ? '☀️ 淺色模式' : '🌙 深色模式';
  });
}
