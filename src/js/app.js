import { renderSidebar, updateHeaderTitle } from './sidebar.js';
import { renderTOC, applyActiveHighlight, updateDoctrinalBreadcrumb, highlightTOCNodeByTime } from './toc.js';
import { initSyncPlayer, updateSession, getCurrentTimeScaleRatio, highlightSentenceByTime, startSimulatedPlayback, cancelPendingAutoScroll, freezeAutoScroll } from './syncPlayer.js';
import { initSearch } from './search.js';


import { formatAriaTime, safePlay } from './a11y.js';
import { openSentenceEditorModal, getCorrection, getNote, getAllCorrections, getAllNotes, exportNotesAsMarkdown } from './annotation.js';

let courseData = null;
let tocData = null;
let audioMapData = {};
let currentSessionData = null;
let currentSessionId = null;
let allFlattenedSentences = [];
let sessionLoading = false; // M6.3 (AGY review): race-condition guard for switchSession
let sidebarFilterValue = ''; // P2: sidebar filter state
let currentInteractionMode = 'listen'; // 'listen' | 'proofread'

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    initThemeToggle();
    initSidebarToggle();
    initMobileSidebarToggle();
    initFontSizeControls();
    initSearch();
    initCourseOverview(); // P1: course overview entry
    initSidebarFilter();  // P2: sidebar filter
    initSessionNav();     // P0-3: prev/next session nav
    initModeToggle();     // Annotation & Proofread mode
    initExportNotes();    // Export notes button
    initTOCDrawerTrigger(); // Phase 1: mobile TOC drawer
    await loadCourseData();
  });
}

async function loadCourseData() {
  try {
    const courseResp = await fetch('courses/入中論善顯密意疏/course.json');
    courseData = await courseResp.json();

    const tocResp = await fetch('courses/入中論善顯密意疏/toc.json');
    tocData = await tocResp.json();

    try {
      const audioMapResp = await fetch('courses/入中論善顯密意疏/audio_map.json');
      if (audioMapResp.ok) {
        audioMapData = await audioMapResp.json();
      }
    } catch (_) {}

    if (courseData && courseData.sessions && audioMapData) {
      courseData.sessions.forEach(s => {
        if (audioMapData[s.sessionId]) {
          s.flydayAudioUrl = audioMapData[s.sessionId];
          s.officialAudioUrl = audioMapData[s.sessionId];
        }
      });
    }

    // P0-1: Update course count in header + sidebar
    const totalSessions = courseData.sessions.length;
    const headerCount = document.getElementById('header-course-count');
    const sidebarCount = document.getElementById('sidebar-course-count');
    if (headerCount) headerCount.textContent = `(全 ${totalSessions} 講)`;
    if (sidebarCount) sidebarCount.textContent = `(全 ${totalSessions} 講)`;

    // Determine starting session (hash or localStorage or first)
    const savedSession = location.hash ? location.hash.replace('#session-', '') : (localStorage.getItem('last_session_id') || '01');
    const initialSession = courseData.sessions.find(s => s.sessionId === savedSession) || courseData.sessions[0];

    renderSidebar(getFilteredSessions(), initialSession.sessionId, switchSession, courseData.unavailableSessions);
    renderTOC(tocData.sections, handleSeekTo, {
      activeSessionId: initialSession.sessionId,
      scope: 'course',
    });
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

  // M6.3 (AGY review): Guard against race condition — if a load is already in
  // flight (fetch not yet resolved), ignore re-entry. Without this, rapid
  // clicks / hash changes during async fetch could trigger duplicate loads.
  if (sessionLoading) return;
  sessionLoading = true;

  // M6.1 fix (Group A1): Only commit currentSessionId after fetch succeeds,
  // to avoid dead-lock state if jsonUrl returns 404 (e.g. 99B unavailable audio).
  // Also catches network/parse errors (was silently failing before).
  const previousSessionId = currentSessionId;

  const flydayUrl = (audioMapData && audioMapData[session.sessionId]) || session.flydayAudioUrl || session.officialAudioUrl;

  renderSidebar(getFilteredSessions(), session.sessionId, switchSession, courseData.unavailableSessions);
  updateHeaderTitle(session, flydayUrl);
  updateBreadcrumb(session); // P0-2: breadcrumb
  applyActiveHighlight(session.sessionId);

  // Close mobile sidebar on selection
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');

  try {
    // Issue #11 v2 — feature-flagged pilot route. When ?pilot=<sid> is in
    // the URL, we fetch the v2-aligned payload instead of the production
    // session JSON. This lets the pilot run side-by-side without
    // overwriting production JSON.
    const pilotMatch = location.search.match(/[?&]pilot=([\w-]+)/);
    let resp;
    if (pilotMatch && session.sessionId === pilotMatch[1]) {
      const pilotUrl = `qa_27B/stage2v2_aligned_${session.sessionId}.json`;
      console.info(`[pilot] loading v2-aligned payload from ${pilotUrl}`);
      resp = await fetch(pilotUrl);
      if (!resp.ok) throw new Error(`pilot HTTP ${resp.status}`);
      currentSessionData = await resp.json();
      // Mark this session as loaded from the v2 pilot path so the UI can
      // optionally show a small "pilot v2" badge.
      currentSessionData._pilot_v2 = true;
    } else {
      resp = await fetch(session.jsonUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      currentSessionData = await resp.json();
    }
    // Commit state only after successful fetch + parse
    currentSessionId = session.sessionId;
    localStorage.setItem('last_session_id', session.sessionId);
    location.hash = `#session-${session.sessionId}`;
    if (tocData && tocData.sections) {
      renderTOC(tocData.sections, handleSeekTo, {
        activeSessionId: session.sessionId,
      });
    }
    renderTranscript(currentSessionData);
    setupAudioPlayer(resolveAudioUrl(session.audioUrl, null, session.sessionId));
  } catch (err) {
    console.error(`Failed to load session ${session.sessionId}:`, err);
    // Rollback UI highlight to previous session
    if (previousSessionId) {
      applyActiveHighlight(previousSessionId);
      updateHeaderTitle(courseData.sessions.find(s => s.sessionId === previousSessionId));
    }
    // M6.1 add: Toast user-visible error feedback
    showToast(`切換失敗：${session.sessionId}（${err.message}）。請確認音檔是否 available。`);
  } finally {
    sessionLoading = false;
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
    if (p.heading) {
      const headingEl = document.createElement('h3');
      headingEl.className = 'transcript-heading';
      headingEl.textContent = p.heading;
      container.appendChild(headingEl);
    }

    const pEl = document.createElement('p');
    pEl.className = 'transcript-paragraph';
    pEl.id = p.id || `p-${sentCounter}`;

    const allNotes = getAllNotes(currentSessionId);
    const allCorrs = getAllCorrections(currentSessionId);

    p.sentences.forEach(s => {
      const idx = sentCounter++;
      s.id = s.id || `sent-${idx}`;
      allFlattenedSentences.push(s);

      const corr = allCorrs[s.id];
      const note = allNotes[s.id];

      const span = document.createElement('span');
      span.className = 'sentence';
      span.id = s.id;
      span.dataset.start = String(s.start);
      span.dataset.end = String(s.end);
      span.textContent = corr ? corr.correctedText : s.text;

      span.title = corr ? `【已校勘】原音：${corr.originalText}（雙擊可再次校對）` : '點擊跳播 ｜ 連擊兩下（Double Click）進入校對與筆記';

      if (corr) {
        span.classList.add('has-correction');
      }

      if (note) {
        span.classList.add('has-note');
        const badge = document.createElement('span');
        badge.className = 'sentence-note-badge';
        badge.textContent = `📌 ${note.pageRef || '筆記'}`;
        badge.title = `${note.content}（點擊可編輯）`;
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerEditorModal(idx);
        });
        span.appendChild(badge);
      }

      span.tabIndex = idx === 0 ? 0 : -1;
      span.setAttribute('aria-label', `跳到音檔 ${formatAriaTime(s.start)}，雙擊進入校對`);
      pEl.appendChild(span);
      pEl.appendChild(document.createTextNode(' '));

      if (note) {
        const noteCard = document.createElement('div');
        noteCard.className = 'sentence-note-card';
        noteCard.innerHTML = `<b>📌 法義筆記 (${note.tag || '研讀'} ${note.pageRef ? '｜ ' + note.pageRef : ''})：</b> ${escapeHtml(note.content)} <span style="font-size:0.75rem; color:#b45309; cursor:pointer; margin-left:8px;" title="點擊編輯筆記">✏️ 編輯</span>`;
        noteCard.addEventListener('click', () => triggerEditorModal(idx));
        pEl.appendChild(noteCard);
      }
    });

    container.appendChild(pEl);
  });

  function triggerEditorModal(idx) {
    freezeAutoScroll(1200);
    cancelPendingAutoScroll();
    const audio = document.getElementById('audio-element');
    if (audio && !audio.paused) audio.pause();
    const sentObj = allFlattenedSentences[idx];
    const prevSent = idx > 0 ? allFlattenedSentences[idx - 1] : null;
    const nextSent = idx < allFlattenedSentences.length - 1 ? allFlattenedSentences[idx + 1] : null;

    openSentenceEditorModal(currentSessionId, sentObj, () => {
      renderTranscript(currentSessionData);
    }, () => {
      renderTranscript(currentSessionData);
    }, { prev: prevSent, next: nextSent });
  }

  // Click-to-Seek and Double-Click-to-Proofread binding
  const sentenceEls = container.querySelectorAll('.sentence');
  sentenceEls.forEach((el, idx) => {
    let lastTapTime = 0;
    let lastClickTime = 0;

    // Single Click: Jump & Play (freezes auto-scroll for 600ms to allow double-click without jitter)
    el.addEventListener('click', (e) => {
      // 1. Immediately freeze any scrolling (timeupdate/seek/smooth scroll) for 600ms
      freezeAutoScroll(600);

      const now = Date.now();
      // Fast double-click detector (450ms window)
      if (now - lastClickTime < 450 && lastClickTime > 0) {
        e.preventDefault();
        freezeAutoScroll(1500);
        triggerEditorModal(idx);
        lastClickTime = 0;
        return;
      }
      lastClickTime = now;

      const rawStart = allFlattenedSentences[idx].start;
      highlightSentenceByTime(rawStart);

      const audio = document.getElementById('audio-element');
      if (audio) {
        const ratio = getCurrentTimeScaleRatio();
        const targetTime = ratio > 0 ? (rawStart * ratio) : rawStart;

        const applySeekAndPlay = () => {
          try {
            audio.currentTime = targetTime;
          } catch (_) {}
          safePlay(audio, undefined, () => {
            startSimulatedPlayback(rawStart);
          });
        };

        if (audio.readyState >= 1) {
          applySeekAndPlay();
        } else {
          audio.addEventListener('loadedmetadata', () => {
            try {
              audio.currentTime = targetTime;
            } catch (_) {}
          }, { once: true });
          safePlay(audio, undefined, () => {
            startSimulatedPlayback(rawStart);
          });
        }
      }
    });

    // Double Click: Enter Proofreading & Notes Modal
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      freezeAutoScroll(1500);
      triggerEditorModal(idx);
    });



    // Mobile / Touch Double Tap Support
    el.addEventListener('touchend', (e) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapTime;
      if (tapLength < 350 && tapLength > 0) {
        e.preventDefault();
        triggerEditorModal(idx);
      }
      lastTapTime = currentTime;
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      } else if (e.key === 'e' || e.key === 'E') {
        // Hotkey 'E' to edit active sentence
        e.preventDefault();
        triggerEditorModal(idx);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = idx + delta;
        if (nextIdx >= 0 && nextIdx < sentenceEls.length) {
          const next = sentenceEls[nextIdx];
          el.tabIndex = -1;
          next.tabIndex = 0;
          next.focus();
          next.click();
        }
      }
    });
  });

  // Re-apply search highlight on session switch (Bug 4.2 fix)
  const searchInput = document.getElementById('search-input');
  if (searchInput && searchInput.value.trim()) {
    searchInput.dispatchEvent(new Event('input'));
  }

  // Display Last-Updated Date & Local Model Verification Badge
  const dateStr = sessionData.lastUpdated || sessionData._meta?.last_updated || (sessionData._meta?.processed_at ? sessionData._meta.processed_at.split(' ')[0] : '2026-08-25');
  const metaFooter = document.createElement('div');
  metaFooter.className = 'transcript-update-footer';
  metaFooter.innerHTML = `
    <span class="meta-item">📅 逐字稿最後更新：<strong>${dateStr}</strong></span>
    <span class="meta-item">✨ 本地大模型（Qwen3.8-27B）深度校對與科判對齊</span>
  `;
  container.appendChild(metaFooter);

  // P0-3: End-of-session card (next session + back to overview)
  appendEndSessionCard(sessionData);
}

/**
 * P0-3: Append an "end of session" card at the bottom of the transcript,
 * offering "next session" and "back to course overview" actions.
 */
function appendEndSessionCard(sessionData) {
  const container = document.getElementById('transcript-container');
  if (!container || !courseData) return;

  // Remove any existing end-session card
  const existing = container.querySelector('.end-session-card');
  if (existing) existing.remove();

  const currentIdx = courseData.sessions.findIndex(s => s.sessionId === sessionData.sessionId);
  const hasNext = currentIdx !== -1 && currentIdx < courseData.sessions.length - 1;
  const nextSession = hasNext ? courseData.sessions[currentIdx + 1] : null;

  const card = document.createElement('div');
  card.className = 'end-session-card';

  const h3 = document.createElement('h3');
  h3.textContent = '🎉 本講結束';
  card.appendChild(h3);

  const actions = document.createElement('div');
  actions.className = 'end-session-actions';

  if (nextSession) {
    const nextBtn = document.createElement('button');
    nextBtn.className = 'end-session-btn primary';
    nextBtn.textContent = `➡️ 進入下一講 第 ${nextSession.sessionId} 堂`;
    nextBtn.addEventListener('click', () => switchSession(nextSession));
    actions.appendChild(nextBtn);
  }

  const overviewBtn = document.createElement('button');
  overviewBtn.className = 'end-session-btn secondary';
  overviewBtn.textContent = '🏠 返回 198 講總目錄';
  overviewBtn.addEventListener('click', () => showCourseOverview());
  actions.appendChild(overviewBtn);

  card.appendChild(actions);
  container.appendChild(card);
}

export function resolveAudioUrl(url, customBase, sessionId, mapOverride) {
  const map = mapOverride || audioMapData;
  if (sessionId && map && map[sessionId]) {
    return map[sessionId];
  }
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const base = customBase || (courseData && courseData.audioBaseUrl);
  if (base) {
    const cleanBase = base.replace(/\/+$/, '');
    const cleanUrl = url.replace(/^\/+/, '');
    return `${cleanBase}/${cleanUrl}`;
  }
  return url;
}

function setupAudioPlayer(audioUrl) {
  const audio = document.getElementById('audio-element');
  const nowPlaying = document.getElementById('now-playing-title');
  if (!audio) return;

  audio.src = audioUrl;
  if (nowPlaying && currentSessionData) {
    nowPlaying.textContent = currentSessionData.title;
  }

  // Phase 1: throttled time-update callback for breadcrumb & TOC node sync (~2Hz)
  let lastBreadcrumbUpdate = 0;
  const onTimeUpdate = (rawAudioTime) => {
    const now = Date.now();
    if (now - lastBreadcrumbUpdate < 500) return; // throttle to 2 Hz
    lastBreadcrumbUpdate = now;
    // Convert audio time → transcript time using the already-imported ratio fn
    const ratio = getCurrentTimeScaleRatio();
    const transcriptTime = ratio > 0 ? rawAudioTime / ratio : rawAudioTime;
    if (tocData && tocData.sections) {
      updateDoctrinalBreadcrumb(transcriptTime, currentSessionId);
      highlightTOCNodeByTime(transcriptTime, currentSessionId);
    }
  };

  // Singleton pattern: init once on first call, then just update target.
  // Issue #11 v2 — when the loaded session came from the pilot v2 payload,
  // pass pilot_v2:true so updateSession forces ratio = 1.0 (no legacy
  // fallback scaling, since v2 timestamps are already audio-grounded).
  initSyncPlayer();
  updateSession(audio, allFlattenedSentences, handleNextSession, {
    pilot_v2: currentSessionData && currentSessionData._pilot_v2 === true,
    onTimeUpdate,
  });
}

function handleNextSession() {
  const currentIdx = courseData.sessions.findIndex(s => s.sessionId === currentSessionData.sessionId);
  if (currentIdx !== -1 && currentIdx < courseData.sessions.length - 1) {
    const nextSession = courseData.sessions[currentIdx + 1];
    switchSession(nextSession).then(() => {
      const audio = document.getElementById('audio-element');
      if (audio) safePlay(audio, undefined, showToast);
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

    const applySeek = () => {
      if (timestampPending) {
        // Don't seek; just play from current position (defaults to 0).
        showToast(`${targetSessionId} 章節起點未標註，目前從頭播放。`);
        highlightSentenceByTime(0);
      } else {
        highlightSentenceByTime(timestamp);
        const ratio = getCurrentTimeScaleRatio();
        const targetTime = ratio > 0 ? (timestamp * ratio) : timestamp;
        try {
          audio.currentTime = targetTime;
        } catch (_) {}
      }

      safePlay(audio, undefined, () => {
        // Missing audio fallback: start simulated playback
        startSimulatedPlayback(timestampPending ? 0 : timestamp);
      });

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
      // In offline/mock mode loadedmetadata may not fire, trigger immediately
      applySeek();
    }
  });
}

function findParagraphByTime(timestamp) {
  if (!currentSessionData || !currentSessionData.paragraphs || currentSessionData.paragraphs.length === 0) return null;
  if (timestamp <= 0) return currentSessionData.paragraphs[0].id;
  
  // Exact interval check
  for (const p of currentSessionData.paragraphs) {
    if (timestamp >= p.start && timestamp <= p.end) {
      return p.id;
    }
  }
  
  // Closest paragraph preceding or nearest timestamp
  let bestPara = currentSessionData.paragraphs[0];
  let minDiff = Math.abs(currentSessionData.paragraphs[0].start - timestamp);
  for (const p of currentSessionData.paragraphs) {
    const diff = Math.abs(p.start - timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      bestPara = p;
    }
  }
  return bestPara ? bestPara.id : null;
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
  const btn = document.getElementById('sidebar-toggle') || document.getElementById('sidebar-toggle-btn');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  const layout = document.querySelector('.app-layout') || document.body;
  if (!btn && !expandBtn) return;

  const updateExpandBtnVisibility = () => {
    if (!expandBtn) return;
    const isCollapsed = layout.classList.contains('sidebar-collapsed');
    expandBtn.style.display = isCollapsed ? 'block' : 'none';
  };

  if (btn) {
    btn.addEventListener('click', () => {
      layout.classList.toggle('sidebar-collapsed');
      updateExpandBtnVisibility();
    });
  }

  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      layout.classList.remove('sidebar-collapsed');
      updateExpandBtnVisibility();
    });
  }

  // Persist preference
  const saved = localStorage.getItem('sidebar_collapsed');
  if (saved === 'true') {
    layout.classList.add('sidebar-collapsed');
  } else if (saved === 'false') {
    layout.classList.remove('sidebar-collapsed');
  }
  updateExpandBtnVisibility();

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

/**
 * P0-2: Update breadcrumb navigation with the current session.
 */
function updateBreadcrumb(session) {
  const current = document.getElementById('breadcrumb-current');
  if (!current || !session) return;
  let periodText = session.periodLabel ? ` (${session.periodLabel})` : '';
  current.textContent = `第 ${session.sessionId} 堂${periodText}`;
}

/**
 * P1: Initialize the course overview entry button.
 */
function initCourseOverview() {
  const btn = document.getElementById('course-overview-btn');
  const breadcrumbHome = document.getElementById('breadcrumb-home');
  if (btn) btn.addEventListener('click', () => showCourseOverview());
  if (breadcrumbHome) breadcrumbHome.addEventListener('click', (e) => {
    e.preventDefault();
    showCourseOverview();
  });
}

/**
 * P1: Show the course overview landing page (198-session grid + continue learning).
 * Replaces the reader content with a full course map so users see the whole course.
 */
function showCourseOverview() {
  const reader = document.querySelector('.reader-container');
  if (!reader || !courseData) return;

  // Hide TOC + transcript, show overview
  const tocContainer = document.getElementById('toc-container');
  const transcript = document.getElementById('transcript-container');
  const activeTitle = document.getElementById('active-session-title');
  const breadcrumb = document.querySelector('.breadcrumb');
  if (tocContainer) tocContainer.style.display = 'none';
  if (transcript) transcript.style.display = 'none';
  if (activeTitle) activeTitle.style.display = 'none';
  if (breadcrumb) breadcrumb.style.display = 'none';

  // Build overview container
  let overview = document.getElementById('course-overview');
  if (!overview) {
    overview = document.createElement('div');
    overview.id = 'course-overview';
    overview.className = 'course-overview';
    reader.appendChild(overview);
  }
  overview.style.display = 'block';
  overview.textContent = '';

  // Back button
  const back = document.createElement('a');
  back.className = 'course-overview-back';
  back.textContent = '← 返回閱讀器';
  back.addEventListener('click', () => hideCourseOverview());
  overview.appendChild(back);

  // Hero
  const hero = document.createElement('div');
  hero.className = 'course-overview-hero';
  const heroTitle = document.createElement('h1');
  heroTitle.textContent = '《入中論善顯密意疏》多媒體學習平台';
  hero.appendChild(heroTitle);
  const heroDesc = document.createElement('p');
  heroDesc.textContent = '見無法師 主講 · 音文雙向同步 · 逐字稿 + 章節目錄';
  hero.appendChild(heroDesc);
  const badges = document.createElement('div');
  badges.className = 'course-overview-badges';
  const total = courseData.sessions.length;
  const badge1 = document.createElement('span');
  badge1.className = 'course-overview-badge';
  badge1.textContent = `📚 全套 ${total} 講`;
  const badge2 = document.createElement('span');
  badge2.className = 'course-overview-badge';
  badge2.textContent = '🎧 音文同步';
  const badge3 = document.createElement('span');
  badge3.className = 'course-overview-badge';
  badge3.textContent = '📖 科判目錄';
  badges.appendChild(badge1);
  badges.appendChild(badge2);
  badges.appendChild(badge3);
  hero.appendChild(badges);
  overview.appendChild(hero);

  // Continue learning card (P2: localStorage progress)
  const lastSessionId = localStorage.getItem('last_session_id');
  const lastSession = lastSessionId ? courseData.sessions.find(s => s.sessionId === lastSessionId) : null;
  if (lastSession) {
    const cont = document.createElement('div');
    cont.className = 'continue-learning';
    const contText = document.createElement('div');
    contText.className = 'continue-learning-text';
    contText.textContent = `▶️ 您上次聽到：第 ${lastSession.sessionId} 堂 (${lastSession.date || ''})`;
    const contBtn = document.createElement('button');
    contBtn.className = 'continue-learning-btn';
    contBtn.textContent = '繼續收聽';
    contBtn.addEventListener('click', () => {
      hideCourseOverview();
      switchSession(lastSession);
    });
    cont.appendChild(contText);
    cont.appendChild(contBtn);
    overview.appendChild(cont);
  }

  // Session grid
  const section = document.createElement('div');
  section.className = 'course-overview-section';
  const sectionTitle = document.createElement('h2');
  sectionTitle.textContent = `📚 全部 ${total} 講`;
  section.appendChild(sectionTitle);
  const grid = document.createElement('div');
  grid.className = 'course-overview-grid';

  courseData.sessions.forEach(session => {
    const card = document.createElement('div');
    card.className = 'course-overview-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `第 ${session.sessionId} 堂`);

    const title = document.createElement('div');
    title.className = 'course-overview-card-title';
    title.textContent = `第 ${session.sessionId} 堂`;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'course-overview-card-meta';
    meta.textContent = `${session.date || ''} | ${session.pageRange || ''}`;
    card.appendChild(meta);

    if (session.summary) {
      const summary = document.createElement('div');
      summary.className = 'course-overview-card-summary';
      summary.textContent = session.summary;
      card.appendChild(summary);
    }

    const open = () => {
      hideCourseOverview();
      switchSession(session);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    grid.appendChild(card);
  });

  section.appendChild(grid);
  overview.appendChild(section);

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * P1: Hide the course overview and restore the reader.
 */
function hideCourseOverview() {
  const overview = document.getElementById('course-overview');
  const tocContainer = document.getElementById('toc-container');
  const transcript = document.getElementById('transcript-container');
  const activeTitle = document.getElementById('active-session-title');
  const breadcrumb = document.querySelector('.breadcrumb');
  if (overview) overview.style.display = 'none';
  if (tocContainer) tocContainer.style.display = '';
  if (transcript) transcript.style.display = '';
  if (activeTitle) activeTitle.style.display = '';
  if (breadcrumb) breadcrumb.style.display = '';
}

/**
 * P2: Return sessions filtered by the sidebar filter value.
 * Matches sessionId, date, pageRange, or summary (case-insensitive).
 */
function getFilteredSessions() {
  if (!courseData) return [];
  if (!sidebarFilterValue) return courseData.sessions;
  const q = sidebarFilterValue;

  return courseData.sessions.filter(s => {
    const haystack = [
      s.sessionId, s.date, s.pageRange, s.summary, s.title,
      s.periodLabel, s.subSession
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * P2: Initialize the sidebar filter (quick search by session id, date, page or summary).
 */
function initSidebarFilter() {
  const input = document.getElementById('sidebar-filter');
  if (!input) return;

  input.addEventListener('input', () => {
    sidebarFilterValue = input.value.trim().toLowerCase();
    if (courseData) {
      renderSidebar(getFilteredSessions(), currentSessionId, switchSession, courseData.unavailableSessions);
    }
  });
}

/**
 * P0-3: Initialize prev/next session navigation buttons in the player bar.
 */
function initSessionNav() {
  const prevBtn = document.getElementById('prev-session-btn');
  const nextBtn = document.getElementById('next-session-btn');
  if (prevBtn) prevBtn.addEventListener('click', () => navigateSession(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateSession(1));
}

/**
 * P0-3: Navigate to the previous/next session.
 */
function navigateSession(delta) {
  if (!courseData || !currentSessionId) return;
  const currentIdx = courseData.sessions.findIndex(s => s.sessionId === currentSessionId);
  if (currentIdx === -1) return;
  const targetIdx = currentIdx + delta;
  if (targetIdx < 0 || targetIdx >= courseData.sessions.length) return;
  switchSession(courseData.sessions[targetIdx]);
}

/**
 * Initialize Annotation & Proofreading Mode Toggle
 */
function initModeToggle() {
  const btn = document.getElementById('mode-toggle-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (currentInteractionMode === 'listen') {
      currentInteractionMode = 'proofread';
      btn.textContent = '📝 校對與筆記中';
      btn.classList.add('mode-active');
      showToast('已切換為「📝 校對與筆記模式」：點擊任意句子即可展開編輯與 AI 預審！');
    } else {
      currentInteractionMode = 'listen';
      btn.textContent = '🎧 聆聽模式';
      btn.classList.remove('mode-active');
      showToast('已切換為「🎧 聆聽模式」：點擊句子即刻跳播。');
    }
  });
}

/**
 * Initialize Export Notes as Markdown
 */
function initExportNotes() {
  const btn = document.getElementById('export-notes-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!currentSessionId || !currentSessionData) return;
    const md = exportNotesAsMarkdown(currentSessionId, currentSessionData);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `善顯密意疏_第${currentSessionId}堂_研讀筆記與校對紀錄.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`✅ 已成功匯出 第 ${currentSessionId} 堂 Markdown 研讀筆記！`);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * ============================================================================
 * Zero-Token Browser Test Harness (__TEST_API__)
 * Allows fast headless tests and in-browser diagnostics without burning LLM tokens.
 * ============================================================================
 */
if (typeof window !== 'undefined') {
  window.__TEST_API__ = {
    getCourseData: () => courseData,
    getCurrentSession: () => currentSessionData,
    getCurrentSessionId: () => currentSessionId,
    getInteractionMode: () => currentInteractionMode,
    getFlattenedSentences: () => allFlattenedSentences,
    switchSessionById: async (id) => {
      const s = courseData?.sessions?.find(x => x.sessionId === id);
      if (s) await switchSession(s);
      return s;
    },
    setInteractionMode: (mode) => {
      if (currentInteractionMode !== mode) {
        document.getElementById('mode-toggle-btn')?.click();
      }
      return currentInteractionMode;
    },
    openSentenceEditor: (sentIndex = 0) => {
      const sent = allFlattenedSentences[sentIndex];
      if (sent) {
        openSentenceEditorModal(currentSessionId, sent, () => renderTranscript(currentSessionData), () => renderTranscript(currentSessionData));
        return true;
      }
      return false;
    },
    runSelfDiagnostics: async () => {
      const results = [];
      const log = (name, pass, detail) => results.push({ name, pass, detail });

      try {
        // 1. Check Course Data
        log('1. Course Data Loaded', courseData && courseData.sessions.length >= 198, `${courseData?.sessions?.length} sessions`);
        
        // 2. Switch to 03A
        await window.__TEST_API__.switchSessionById('03A');
        const s03a = window.__TEST_API__.getCurrentSession();
        log('2. Switch to 03A', s03a && s03a.sessionId === '03A' && s03a.paragraphs.length > 0, `${s03a?.paragraphs?.length} paragraphs rendered`);

        // 3. Verify Mode Toggle
        window.__TEST_API__.setInteractionMode('proofread');
        log('3. Mode Toggle (Proofread)', window.__TEST_API__.getInteractionMode() === 'proofread', 'current mode is proofread');

        // 4. Open Sentence Editor Modal
        const opened = window.__TEST_API__.openSentenceEditor(0);
        const modal = document.getElementById('sentence-editor-modal');
        log('4. Sentence Editor Modal Open', opened && modal !== null, modal ? 'modal in DOM' : 'modal missing');

        // 5. Test AI Check Button
        if (modal) {
          const aiBtn = modal.querySelector('#modal-ai-check-btn');
          aiBtn?.click();
          await new Promise(r => setTimeout(r, 500));
          const aiBox = modal.querySelector('#modal-ai-preview');
          log('5. AI Preview Render', aiBox && aiBox.style.display !== 'none', aiBox?.textContent?.slice(0, 30));

          // Close modal
          modal.querySelector('#modal-cancel-btn')?.click();
        }

        // 6. Return Mode to Listen
        window.__TEST_API__.setInteractionMode('listen');
        log('6. Reset to Listen Mode', window.__TEST_API__.getInteractionMode() === 'listen', 'restored');

      } catch (err) {
        log('Fatal Test Error', false, err.message);
      }

      const allPassed = results.every(r => r.pass);
      console.log('🏁 [Self-Diagnostics Report]', allPassed ? '✅ ALL PASSED' : '❌ FAILURES DETECTED', results);
      return { passed: allPassed, results };
    }
  };

  // Auto-run if URL contains ?self-test=1
  if (typeof location !== 'undefined' && location.search.includes('self-test=1')) {
    window.addEventListener('load', () => {
      setTimeout(() => window.__TEST_API__.runSelfDiagnostics(), 800);
    });
  }
}

/**
 * Phase 1: Mobile TOC drawer trigger.
 * Tapping the 📖 科判 button in the footer scrolls the TOC accordion into view
 * and opens it so the user can see the current doctrinal position.
 */
function initTOCDrawerTrigger() {
  const btn = document.getElementById('toc-drawer-trigger');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const tocContainer = document.getElementById('toc-container');
    const accordion = tocContainer && tocContainer.querySelector('.toc-accordion');
    if (accordion) {
      accordion.open = true;
      accordion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}
