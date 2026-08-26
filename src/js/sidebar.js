/**
 * sidebar.js - Session List Renderer
 * Formats 2A/2B session items and renders unique topic summaries.
 */

export function renderSidebar(sessions, activeSessionId, onSelectSession, unavailableSessions) {
  const container = document.getElementById('session-list');
  if (!container) return;

  container.textContent = '';

  // Map of unavailable sessionId -> note, for inserting disabled gap markers
  const unavailableMap = new Map();
  (unavailableSessions || []).forEach(u => unavailableMap.set(u.sessionId, u));

  sessions.forEach(session => {
    const li = document.createElement('li');
    li.className = `session-item ${session.sessionId === activeSessionId ? 'active' : ''}`;
    li.dataset.sessionId = session.sessionId;
    li.dataset.testid = `session-item-${session.sessionId}`;
    li.id = `session-${session.sessionId}`;

    // Format title badge: （85A）20180512 歸敬頌p6
    let periodText = session.periodLabel ? ` (${session.periodLabel})` : '';
    let mainLabel = session.sidebarLabel || `（${session.sessionId}）${(session.date || '').replace(/-/g, '')} ${session.pageRange || ''}`;

    const titleEl = document.createElement('div');
    titleEl.className = 'session-title';
    titleEl.textContent = mainLabel;

    const metaEl = document.createElement('div');
    metaEl.className = 'session-meta';
    metaEl.textContent = `第 ${session.sessionId} 堂${periodText} | ${session.date || ''} | ${session.pageRange || ''}`;

    li.appendChild(titleEl);
    li.appendChild(metaEl);

    if (session.summary) {
      const summaryEl = document.createElement('div');
      summaryEl.className = 'session-summary';
      summaryEl.textContent = session.summary;
      li.appendChild(summaryEl);
    }

    li.addEventListener('click', () => {
      if (typeof onSelectSession === 'function') {
        onSelectSession(session);
      }
    });

    container.appendChild(li);

    // Insert a disabled gap marker for any unavailable session that follows
    // this one in the A/B sequence (e.g. 99A → 99B unavailable).
    const nextId = nextSessionId(session.sessionId);
    if (nextId && unavailableMap.has(nextId)) {
      const gap = unavailableMap.get(nextId);
      const gapLi = document.createElement('li');
      gapLi.className = 'session-item session-unavailable';
      gapLi.setAttribute('aria-disabled', 'true');

      const gapTitle = document.createElement('div');
      gapTitle.className = 'session-title';
      gapTitle.textContent = `第 ${nextId} 堂 (缺音檔)`;

      const gapMeta = document.createElement('div');
      gapMeta.className = 'session-meta';
      gapMeta.textContent = gap.note || '音檔待補';

      gapLi.appendChild(gapTitle);
      gapLi.appendChild(gapMeta);
      container.appendChild(gapLi);
    }
  });
}

/**
 * Compute the next sessionId in the A/B sequence, or null if this is a B segment.
 * e.g. '99A' → '99B', '99B' → '100A'.
 */
function nextSessionId(sessionId) {
  const match = sessionId.match(/^(\d+)([AB])$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const sub = match[2];
  if (sub === 'A') return `${String(num).padStart(2, '0')}B`;
  return `${String(num + 1).padStart(2, '0')}A`;
}

export function updateHeaderTitle(session, exactFlydayUrl) {
  const titleEl = document.getElementById('active-session-title');
  if (!titleEl || !session) return;

  let periodText = session.periodLabel ? ` (${session.periodLabel})` : '';
  let fullTitle = `第 ${session.sessionId} 堂${periodText} | ${session.date || ''} | ${session.pageRange || ''}`;

  titleEl.textContent = '';

  const titleDiv = document.createElement('div');
  titleDiv.textContent = fullTitle;
  titleEl.appendChild(titleDiv);

  if (session.summary) {
    const summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'font-size: 0.95rem; font-weight: 500; color: var(--accent-color); margin-top: 6px;';
    summaryDiv.textContent = `🎯 主題：${session.summary}`;
    titleEl.appendChild(summaryDiv);
  }

  const externalAudioUrl = exactFlydayUrl || session.flydayAudioUrl || session.officialAudioUrl;

  if (externalAudioUrl) {
    const audioLinkDiv = document.createElement('div');
    audioLinkDiv.className = 'session-audio-link-container';
    audioLinkDiv.style.cssText = 'font-size: 0.88rem; font-weight: 400; color: var(--text-secondary, #666); margin-top: 6px; display: flex; align-items: center; gap: 6px;';
    
    const audioIcon = document.createElement('span');
    audioIcon.textContent = '🎧 原始音檔：';
    audioLinkDiv.appendChild(audioIcon);

    const audioA = document.createElement('a');
    audioA.href = externalAudioUrl;
    audioA.target = '_blank';
    audioA.rel = 'noopener noreferrer';
    audioA.textContent = `Flyday 官方音檔 (${session.sessionId}.MP3) ↗`;
    audioA.style.cssText = 'color: var(--primary-color, #1976d2); text-decoration: underline; font-weight: 600;';
    audioLinkDiv.appendChild(audioA);

    titleEl.appendChild(audioLinkDiv);
  }
}

