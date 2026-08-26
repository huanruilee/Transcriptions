/**
 * sidebar.js - Clean Sequential Session List Renderer
 * Renders sessions in natural sequential order (01, 02A, 02B, ... 110B)
 * Features:
 * 1. Compact card hierarchy (~42px height, micro-badges, single-line text ellipsis)
 * 2. Active state with theme accent border
 * 3. Smooth auto-scrolling to active session
 * 4. Fast search and filter support
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

    // Compact Title & Badge Formatting
    const mainLabel = session.sidebarLabel || `（${session.sessionId}）${(session.date || '').replace(/-/g, '')} ${session.pageRange || ''}`;

    const titleEl = document.createElement('div');
    titleEl.className = 'session-title';
    titleEl.textContent = mainLabel;
    if (session.summary) {
      titleEl.title = `🎯 主題：${session.summary}`;
    }

    const metaEl = document.createElement('div');
    metaEl.className = 'session-meta';
    metaEl.innerHTML = `
      <span class="meta-badge meta-session">第 ${session.sessionId} 堂</span>
      ${session.pageRange ? `<span class="meta-badge meta-page">${session.pageRange}</span>` : ''}
      ${session.date ? `<span class="meta-date">${session.date}</span>` : ''}
    `;

    li.appendChild(titleEl);
    li.appendChild(metaEl);

    li.addEventListener('click', () => {
      if (typeof onSelectSession === 'function') {
        onSelectSession(session);
      }
    });

    container.appendChild(li);

    // Insert gap marker for unavailable next session if applicable (e.g. 99A → 99B)
    const nextId = nextSessionId(session.sessionId);
    if (nextId && unavailableMap.has(nextId)) {
      const gap = unavailableMap.get(nextId);
      const gapLi = document.createElement('li');
      gapLi.className = 'session-item session-unavailable';
      gapLi.setAttribute('aria-disabled', 'true');

      const gapTitle = document.createElement('div');
      gapTitle.className = 'session-title';
      gapTitle.textContent = `（${nextId}）音檔待補`;

      const gapMeta = document.createElement('div');
      gapMeta.className = 'session-meta';
      gapMeta.innerHTML = `<span class="meta-badge meta-unavailable">第 ${nextId} 堂 ｜ ${gap.note || '原音檔缺講'}</span>`;

      gapLi.appendChild(gapTitle);
      gapLi.appendChild(gapMeta);
      container.appendChild(gapLi);
    }
  });

  // Smooth scroll into view for active session item
  if (activeSessionId) {
    setTimeout(() => {
      const activeEl = container.querySelector(`.session-item.active`);
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        try {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) {}
      }
    }, 50);
  }
}

/**
 * Compute the next sessionId in the A/B sequence
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
