/**
 * sidebar.js - Session List Renderer
 * Formats 2A/2B session items and renders unique topic summaries.
 */

export function renderSidebar(sessions, activeSessionId, onSelectSession) {
  const container = document.getElementById('session-list');
  if (!container) return;

  container.innerHTML = '';

  sessions.forEach(session => {
    const li = document.createElement('li');
    li.className = `session-item ${session.sessionId === activeSessionId ? 'active' : ''}`;
    
    // Format title badge
    let periodText = session.periodLabel ? ` (${session.periodLabel})` : '';
    let mainLabel = `第 ${session.sessionId} 堂${periodText}`;

    li.innerHTML = `
      <div class="session-title">${mainLabel}</div>
      <div class="session-meta">${session.date || ''} | ${session.pageRange || ''}</div>
      ${session.summary ? `<div class="session-summary">${session.summary}</div>` : ''}
    `;

    li.addEventListener('click', () => {
      if (typeof onSelectSession === 'function') {
        onSelectSession(session);
      }
    });

    container.appendChild(li);
  });
}

export function updateHeaderTitle(session) {
  const titleEl = document.getElementById('active-session-title');
  if (!titleEl || !session) return;

  let periodText = session.periodLabel ? ` (${session.periodLabel})` : '';
  let fullTitle = `第 ${session.sessionId} 堂${periodText} | ${session.date || ''} | ${session.pageRange || ''}`;

  titleEl.innerHTML = `
    <div>${fullTitle}</div>
    ${session.summary ? `<div style="font-size: 0.95rem; font-weight: 500; color: var(--accent-color); margin-top: 6px;">🎯 主題：${session.summary}</div>` : ''}
  `;
}
