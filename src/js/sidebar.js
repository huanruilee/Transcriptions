/**
 * sidebar.js - Authentic Doctrinal & Chronological Session List Renderer
 * Groups all 198 sessions according to actual historical lecture sequence & treatise chapters:
 * 1. 【2016 開篇概論】: 01 ~ 03B (p.63~66)
 * 2. 【第六現前地・破四生之理】: 04A ~ 40B (p.68~123)
 * 3. 【第六現前地・二諦與唯識釋難】: 41A ~ 60B (p.124~185)
 * 4. 【第六現前地・車喻破我執與十六空】: 61A ~ 78B (p.186~240)
 * 5. 【第七至十地 & 果地佛地功德】: 79A ~ 84B (p.241~285)
 * 6. 【2018 詳講・序論與歸敬頌】: 85A ~ 93B (p.6~18)
 * 7. 【2018 詳講・前五地波羅蜜多】: 94A ~ 110B (p.19~63)
 */

export const CHAPTER_GROUPS = [
  { id: 'ch-2018-homage', title: '【2018 詳講・序論與歸敬頌】', filterKey: '歸敬頌', range: '85A - 93B (p.6~18)', match: (num) => num >= 85 && num <= 93 },
  { id: 'ch-2018-five', title: '【2018 詳講・前五地波羅蜜多】', filterKey: '前五地', range: '94A - 110B (p.19~63)', match: (num) => num >= 94 && num <= 110 },
  { id: 'ch-intro', title: '【2016 開篇概論】', filterKey: '2016開篇', range: '01 - 03B (p.63~66)', match: (num) => num >= 1 && num <= 3 },
  { id: 'ch-six-1', title: '【第六現前地・破四生之理】', filterKey: '破四生', range: '04A - 40B (p.68~123)', match: (num) => num >= 4 && num <= 40 },
  { id: 'ch-six-2', title: '【第六現前地・二諦與唯識釋難】', filterKey: '二諦', range: '41A - 60B (p.124~185)', match: (num) => num >= 41 && num <= 60 },
  { id: 'ch-six-3', title: '【第六現前地・車喻破我執與十六空】', filterKey: '破我執', range: '61A - 78B (p.186~240)', match: (num) => num >= 61 && num <= 78 },
  { id: 'ch-post-six', title: '【第七至十地 & 果地佛地功德】', filterKey: '果地', range: '79A - 84B (p.241~285)', match: (num) => num >= 79 && num <= 84 }
];

// Persistent Set of expanded group IDs
const expandedGroups = new Set();
let hasInitializedAccordion = false;

function getSessionNum(sessionId) {
  const m = String(sessionId).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function findGroupForSession(sessionId) {
  const num = getSessionNum(sessionId);
  return CHAPTER_GROUPS.find(g => g.match(num)) || CHAPTER_GROUPS[0];
}

export function toggleAllAccordionGroups(expandAll = true) {
  if (expandAll) {
    CHAPTER_GROUPS.forEach(g => expandedGroups.add(g.id));
  } else {
    expandedGroups.clear();
  }
}

export function renderSidebar(sessions, activeSessionId, onSelectSession, unavailableSessions) {
  const container = document.getElementById('session-list');
  if (!container) return;

  container.textContent = '';

  // Map of unavailable sessionId -> note, for inserting disabled gap markers
  const unavailableMap = new Map();
  (unavailableSessions || []).forEach(u => unavailableMap.set(u.sessionId, u));

  // Determine if a search filter is currently active
  const searchInput = document.getElementById('sidebar-filter');
  const isSearchActive = searchInput && searchInput.value.trim().length > 0;

  // Auto-expand the active chapter on initial load or session switch
  if (activeSessionId) {
    const activeGroup = findGroupForSession(activeSessionId);
    if (activeGroup) {
      expandedGroups.add(activeGroup.id);
    }
  }

  // If first time and no active session, expand active or first chapter
  if (!hasInitializedAccordion) {
    expandedGroups.add('ch-2018-homage');
    expandedGroups.add('ch-intro');
    hasInitializedAccordion = true;
  }

  // Group sessions into chapters
  const groupedData = new Map();
  CHAPTER_GROUPS.forEach(g => groupedData.set(g.id, []));

  sessions.forEach(session => {
    const group = findGroupForSession(session.sessionId);
    if (group && groupedData.has(group.id)) {
      groupedData.get(group.id).push(session);
    } else {
      groupedData.get('ch-intro').push(session);
    }
  });

  // Render each chapter group
  CHAPTER_GROUPS.forEach(group => {
    const groupSessions = groupedData.get(group.id) || [];
    if (groupSessions.length === 0 && isSearchActive) return; // Hide empty groups during search

    const isExpanded = isSearchActive || expandedGroups.has(group.id);

    // Group wrapper
    const groupEl = document.createElement('li');
    groupEl.className = `accordion-group ${isExpanded ? 'expanded' : 'collapsed'}`;
    groupEl.id = `group-${group.id}`;

    // Accordion Header
    const headerEl = document.createElement('div');
    headerEl.className = 'accordion-header';
    headerEl.innerHTML = `
      <div class="accordion-title-block">
        <span class="accordion-icon">${isExpanded ? '▼' : '▶'}</span>
        <span class="accordion-title">${group.title}</span>
      </div>
      <div class="accordion-meta-block">
        <span class="accordion-badge">${groupSessions.length} 講</span>
      </div>
    `;

    headerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (expandedGroups.has(group.id)) {
        expandedGroups.delete(group.id);
      } else {
        expandedGroups.add(group.id);
      }
      renderSidebar(sessions, activeSessionId, onSelectSession, unavailableSessions);
    });

    groupEl.appendChild(headerEl);

    // Group Items Container
    const itemsUl = document.createElement('ul');
    itemsUl.className = 'accordion-content';
    if (!isExpanded) {
      itemsUl.style.display = 'none';
    }

    groupSessions.forEach(session => {
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

      itemsUl.appendChild(li);

      // Insert gap marker for unavailable next session if applicable
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
        itemsUl.appendChild(gapLi);
      }
    });

    groupEl.appendChild(itemsUl);
    container.appendChild(groupEl);
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
