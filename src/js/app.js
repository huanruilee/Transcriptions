import { renderSidebar, updateHeaderTitle } from './sidebar.js';
import { renderTOC, applyActiveHighlight, updateDoctrinalBreadcrumb, highlightTOCNodeByTime, findTOCNodeAtParagraphStart, openTOCBottomSheet } from './toc.js';
import { initSyncPlayer, updateSession, getCurrentTimeScaleRatio, highlightSentenceByTime, startSimulatedPlayback, cancelPendingAutoScroll, freezeAutoScroll, cyclePlaybackRate, loadSavedPlaybackRate, setPlaybackRate } from './syncPlayer.js';
import { initSearch } from './search.js';
import { initContextMenu } from './contextMenu.js';
import { formatAriaTime, safePlay } from './a11y.js';
import { openSentenceEditorModal, getCorrection, getNote, getAllCorrections, getAllNotes, exportNotesAsMarkdown } from './annotation.js';
import { initReviewRating } from './reviewRating.js';
import { openLocalSyncModal } from './localSync.js';

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
    initSidebarResizer();
    initMobileDrawer();
    initMobileActionSheet();
    initPlaybackRateControl();
    initFabReturnPlaying();
    initFontSizeControls();
    initSearch();
    initCourseOverview(); // P1: course overview entry
    initSidebarFilter();  // P2: sidebar filter
    initSessionNav();     // P0-3: prev/next session nav
    initModeToggle();     // Annotation & Proofread mode
    initExportNotes();    // Export notes button
    initLocalSyncButton(); // Local active learning sync bridge
    initTOCDrawerTrigger(); // Phase 1: mobile TOC drawer
    initTouchContextMenu();
    initReviewRating(() => {
      if (currentSessionData) {
        return {
          sessionId: currentSessionId,
          title: currentSessionData.title || `第 ${currentSessionId} 堂`,
          pageRange: currentSessionData.pageRange || (courseData?.sessions?.find(s => s.sessionId === currentSessionId)?.pageRange) || '',
          ...currentSessionData
        };
      }
      return courseData?.sessions?.find(s => s.sessionId === currentSessionId) || { sessionId: currentSessionId };
    });
    await loadCourseData();
  });
}

let catalogData = null;
let currentCourseId = 'ru-zhong-lun';
let currentCoursePath = 'courses/入中論善顯密意疏';
let isHashListenerAttached = false;

function parseHashRoute() {
  const raw = location.hash ? location.hash.replace(/^#/, '') : '';
  if (!raw) return { courseId: null, sessionId: null };
  if (raw.startsWith('session-')) {
    return { courseId: null, sessionId: raw.replace('session-', '') };
  }
  const params = new URLSearchParams(raw);
  return {
    courseId: params.get('course') || null,
    sessionId: params.get('session') || null
  };
}

async function loadCourseData(targetCourseId, targetSessionId) {
  try {
    try {
      const catResp = await fetch('courses/catalog.json');
      if (catResp.ok) {
        catalogData = await catResp.json();
      }
    } catch (_) {}

    const hashRoute = parseHashRoute();
    const effectiveCourseId = targetCourseId || hashRoute.courseId || (catalogData && catalogData.defaultCourseId) || 'ru-zhong-lun';

    if (catalogData && Array.isArray(catalogData.courses) && catalogData.courses.length > 0) {
      const found = catalogData.courses.find(c => c.id === effectiveCourseId || c.title === effectiveCourseId) || catalogData.courses[0];
      currentCourseId = found.id;
      currentCoursePath = found.path || `courses/${found.title}`;

      const courseSelect = document.getElementById('course-select');
      if (courseSelect) {
        courseSelect.innerHTML = catalogData.courses.map(c => 
          `<option value="${c.id}" ${c.id === currentCourseId ? 'selected' : ''}>📖 ${c.title}</option>`
        ).join('');
        if (!courseSelect._bound) {
          courseSelect._bound = true;
          courseSelect.addEventListener('change', async (e) => {
            const nextCourseId = e.target.value;
            if (nextCourseId !== currentCourseId) {
              currentSessionId = null;
              await loadCourseData(nextCourseId);
            }
          });
        }
      }
    }

    const courseResp = await fetch(`${currentCoursePath}/course.json`);
    courseData = await courseResp.json();

    const tocResp = await fetch(`${currentCoursePath}/toc.json`);
    tocData = await tocResp.json();

    try {
      const audioMapResp = await fetch(`${currentCoursePath}/audio_map.json`);
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
    const savedSession = targetSessionId || hashRoute.sessionId || (location.hash ? location.hash.replace('#session-', '') : (localStorage.getItem(`last_session_${currentCourseId}`) || localStorage.getItem('last_session_id') || '01'));
    const initialSession = (courseData.sessions && courseData.sessions.length > 0)
      ? (courseData.sessions.find(s => s.sessionId === savedSession) || courseData.sessions[0])
      : null;

    if (initialSession) {
      renderSidebar(getFilteredSessions(), initialSession.sessionId, switchSession, courseData.unavailableSessions);
      renderTOC(tocData?.sections || [], handleSeekTo);
      await switchSession(initialSession);
    } else {
      renderSidebar([], null, switchSession, courseData.unavailableSessions);
      renderTOC([], handleSeekTo);
      const article = document.getElementById('transcript-container');
      if (article) {
        article.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">本課程音檔與逐字稿籌備中，敬請期待。</div>';
      }
    }

    // Listen to browser back/forward (Bug 1.3 fix)
    if (!isHashListenerAttached) {
      isHashListenerAttached = true;
      window.addEventListener('hashchange', () => {
        const route = parseHashRoute();
        if (route.courseId && route.courseId !== currentCourseId) {
          loadCourseData(route.courseId, route.sessionId);
          return;
        }
        const targetId = route.sessionId || (location.hash ? location.hash.replace('#session-', '') : '');
        const target = courseData.sessions.find(s => s.sessionId === targetId);
        // Guard by sessionId, not object identity: the course index object and the
        // loaded session JSON object are never the same reference, so comparing
        // them directly would always be true and cause duplicate loads.
        if (target && currentSessionId !== targetId) switchSession(target);
      });
    }
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
      const targetUrl = session.jsonUrl || `${currentCoursePath}/sessions/session_${session.sessionId}.json`;
      resp = await fetch(targetUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      currentSessionData = await resp.json();
    }
    // Commit state only after successful fetch + parse
    currentSessionId = session.sessionId;
    localStorage.setItem('last_session_id', session.sessionId);
    localStorage.setItem(`last_session_${currentCourseId}`, session.sessionId);
    location.hash = (currentCourseId && currentCourseId !== 'ru-zhong-lun') ? `#course=${currentCourseId}&session=${session.sessionId}` : `#session-${session.sessionId}`;
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

    // Phase 2: Inline Doctrinal Anchor Card
    // If this paragraph's start timestamp coincides with a TOC node, inject
    // a slim card above the paragraph showing the doctrinal path.
    if (p.sentences && p.sentences.length > 0 && tocData && tocData.sections) {
      const paraStart = p.sentences[0].start || 0;
      const tocNode = findTOCNodeAtParagraphStart(paraStart, currentSessionId, 2);
      if (tocNode) {
        const anchorCard = document.createElement('div');
        anchorCard.className = 'toc-anchor-card';
        anchorCard.dataset.testid = `toc-anchor-${Math.floor(paraStart)}`;
        anchorCard.setAttribute('aria-label', `科判節點：${tocNode.title}`);

        const icon = document.createElement('span');
        icon.className = 'toc-anchor-icon';
        icon.textContent = '📌';
        anchorCard.appendChild(icon);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'toc-anchor-title';
        titleSpan.textContent = tocNode.title;
        anchorCard.appendChild(titleSpan);

        if (tocNode.page) {
          const pageBadge = document.createElement('span');
          pageBadge.className = 'toc-anchor-page';
          pageBadge.textContent = `p.${tocNode.page}`;
          anchorCard.appendChild(pageBadge);
        }

        const min = Math.floor(tocNode.timestamp / 60);
        const sec = Math.floor(tocNode.timestamp % 60).toString().padStart(2, '0');
        const tsBadge = document.createElement('span');
        tsBadge.className = 'toc-anchor-ts';
        tsBadge.textContent = `${min}:${sec}`;
        anchorCard.appendChild(tsBadge);

        container.appendChild(anchorCard);
      }
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

  // Display Last-Updated Datetime (Down to Seconds) & Local Model Verification Badge
  const dateStr = (sessionData._meta?.processed_at && sessionData._meta.processed_at.includes(':'))
    ? sessionData._meta.processed_at
    : (sessionData.lastUpdated && sessionData.lastUpdated.includes(':')
      ? sessionData.lastUpdated.replace('T', ' ').replace('Z', '')
      : (sessionData.lastUpdated || sessionData._meta?.last_updated || '2026-08-28'));
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
 * Desktop collapsible sidebar toggle with [ shortcut support.
 * Toggles .sidebar-collapsed on .app-layout; main content auto-expands to 100%.
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

  // Keyboard shortcut: [ toggles sidebar (when not editing input)
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key === '[') {
      e.preventDefault();
      layout.classList.toggle('sidebar-collapsed');
      updateExpandBtnVisibility();
    }
  });

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
 * Sidebar width resizer (200px ~ 420px) with mouse dragging.
 */
function initSidebarResizer() {
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('sidebar-resizer');
  if (!sidebar || !resizer) return;

  let isResizing = false;
  resizer.addEventListener('pointerdown', () => {
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('pointermove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.max(200, Math.min(e.clientX, 420));
    document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    sidebar.style.width = `${newWidth}px`;
  });

  window.addEventListener('pointerup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const w = sidebar.style.width;
      if (w) localStorage.setItem('sidebar_custom_width', w);
    }
  });

  const savedW = localStorage.getItem('sidebar_custom_width');
  if (savedW) {
    document.documentElement.style.setProperty('--sidebar-width', savedW);
    sidebar.style.width = savedW;
  }
}

/**
 * Mobile Navigation Drawer toggle with backdrop overlay.
 */
function initMobileDrawer() {
  const mobileBtn = document.getElementById('mobile-sidebar-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  const openDrawer = () => {
    sidebar.classList.add('drawer-open');
    if (overlay) overlay.classList.add('active');
  };

  const closeDrawer = () => {
    sidebar.classList.remove('drawer-open');
    if (overlay) overlay.classList.remove('active');
  };

  if (mobileBtn) mobileBtn.addEventListener('click', openDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);

  // Close drawer on selecting a session on mobile
  const sessionList = document.getElementById('session-list');
  if (sessionList) {
    sessionList.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && e.target.closest('.session-item')) {
        closeDrawer();
      }
    });
  }
}

/**
 * Mobile Action Sheet (⋯ 更多功能面板).
 */
function initMobileActionSheet() {
  const moreBtn = document.getElementById('mobile-more-btn');
  let sheet = document.getElementById('mobile-action-sheet');
  let overlay = document.getElementById('sidebar-overlay');

  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'mobile-action-sheet';
    sheet.className = 'mobile-action-sheet';
    sheet.innerHTML = `
      <div class="action-sheet-header">
        <div class="action-sheet-title">⚙️ 閱讀與輔助工具</div>
        <button class="action-sheet-close" id="action-sheet-close-btn">✕</button>
      </div>
      <div class="action-sheet-grid">
        <button class="action-sheet-btn" id="sheet-local-sync-btn">⚡ 本機學習同步</button>
        <button class="action-sheet-btn" id="sheet-export-notes-btn">📥 匯出研讀筆記</button>
        <button class="action-sheet-btn" id="sheet-session-rating-btn">⭐ 講次審核評分</button>
        <button class="action-sheet-btn" id="sheet-theme-toggle-btn">🌙 切換深淺模式</button>
        <button class="action-sheet-btn" id="sheet-course-overview-btn">🏠 課程總覽 (198講)</button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 4px;">
        <span style="font-size:0.9rem; color:var(--text-secondary);">字體大小：</span>
        <div style="display:flex; gap:8px; align-items:center;">
          <button id="sheet-font-dec" style="padding:6px 12px; border-radius:6px; border:1px solid #ccc; background:var(--bg-secondary, #eee); cursor:pointer;">A-</button>
          <span id="sheet-font-label" style="font-size:0.9rem; min-width:40px; text-align:center;">100%</span>
          <button id="sheet-font-inc" style="padding:6px 12px; border-radius:6px; border:1px solid #ccc; background:var(--bg-secondary, #eee); cursor:pointer;">A+</button>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
  }

  const openSheet = () => {
    sheet.classList.add('active');
    if (overlay) overlay.classList.add('active');
  };

  const closeSheet = () => {
    sheet.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
  };

  if (moreBtn) moreBtn.addEventListener('click', openSheet);
  const closeBtn = document.getElementById('action-sheet-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeSheet);

  document.getElementById('sheet-local-sync-btn')?.addEventListener('click', () => {
    closeSheet();
    openLocalSyncModal();
  });
  document.getElementById('sheet-export-notes-btn')?.addEventListener('click', () => {
    closeSheet();
    document.getElementById('export-notes-btn')?.click();
  });
  document.getElementById('sheet-session-rating-btn')?.addEventListener('click', () => {
    closeSheet();
    document.getElementById('session-rating-btn')?.click();
  });
  document.getElementById('sheet-theme-toggle-btn')?.addEventListener('click', () => {
    document.getElementById('theme-toggle')?.click();
  });
  document.getElementById('sheet-course-overview-btn')?.addEventListener('click', () => {
    closeSheet();
    document.getElementById('course-overview-btn')?.click();
  });
  document.getElementById('sheet-font-dec')?.addEventListener('click', () => {
    document.getElementById('font-decrease')?.click();
    const l = document.getElementById('font-size-label')?.textContent;
    if (l) document.getElementById('sheet-font-label').textContent = l;
  });
  document.getElementById('sheet-font-inc')?.addEventListener('click', () => {
    document.getElementById('font-increase')?.click();
    const l = document.getElementById('font-size-label')?.textContent;
    if (l) document.getElementById('sheet-font-label').textContent = l;
  });
}

/**
 * Playback rate selector button (1.0x / 1.2x / 1.5x / 2.0x).
 */
function initPlaybackRateControl() {
  const btn = document.getElementById('playback-rate-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      cyclePlaybackRate();
    });
  }
  loadSavedPlaybackRate();
}

/**
 * Floating Return-to-Playing FAB button.
 */
function initFabReturnPlaying() {
  const fab = document.getElementById('fab-return-playing');
  if (!fab) return;

  fab.addEventListener('click', () => {
    const activeEl = document.querySelector('.sentence.active');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fab.classList.remove('visible');
    }
  });
}

/**
 * Touch Context Menu integration (Long-press on sentences).
 */
function initTouchContextMenu() {
  initContextMenu({
    onPlay: (sentenceElem) => {
      const start = parseFloat(sentenceElem.getAttribute('data-start') || '0');
      handleSeekTo(start);
    },
    onNote: (sentenceElem) => {
      const idx = parseInt(sentenceElem.getAttribute('data-index') || '0', 10);
      const sentObj = allFlattenedSentences[idx];
      if (sentObj) {
        openSentenceEditorModal(currentSessionId, idx, sentObj, (updatedText) => {
          sentObj.text = updatedText;
          sentenceElem.textContent = updatedText;
        });
      }
    },
    onCopy: (sentenceElem) => {
      const text = sentenceElem.textContent.trim();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    }
  });
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
  heroTitle.textContent = `《${courseData?.title || '入中論善顯密意疏'}》多媒體學習平台`;
  hero.appendChild(heroTitle);
  const heroDesc = document.createElement('p');
  heroDesc.textContent = `${courseData?.lecturer || courseData?.master || '見悲青增格西'} 主講 · 音文雙向同步 · 逐字稿 + 章節目錄`;
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

/**
 * Initialize 1-Click Local Sync Button in Header
 */
function initLocalSyncButton() {
  const btn = document.getElementById('local-sync-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      openLocalSyncModal();
    });
  }
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
 * Mobile TOC drawer trigger.
 * Tapping the 📖 科判 button in footer or 📑 本課科判 in header opens the Bottom Sheet Drawer.
 */
function initTOCDrawerTrigger() {
  const footerBtn = document.getElementById('toc-drawer-trigger');
  if (footerBtn) {
    footerBtn.addEventListener('click', () => {
      openTOCBottomSheet();
    });
  }

  const mobileBtn = document.getElementById('mobile-toc-drawer-btn');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      openTOCBottomSheet();
    });
  }
}
