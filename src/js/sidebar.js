/**
 * sidebar.js - Sidebar & Session Naming Refactoring
 * Renders sessions in format: 第 [X][A/B] 堂 (上/下) | YYYY-MM-DD | p.XX
 * Synchronizes title, URL hash, and localStorage.
 */

export function renderSidebar(sessions, activeSessionId, onSelectSession) {
  const container = document.getElementById('session-list');
  if (!container) return;

  container.innerHTML = '';

  sessions.forEach(session => {
    const li = document.createElement('li');
    li.className = `session-item ${session.sessionId === activeSessionId ? 'active' : ''}`;
    li.dataset.sessionId = session.sessionId;

    const subTag = session.subSession ? `${session.subSession}` : '';
    const label = session.periodLabel ? ` (${session.periodLabel})` : '';
    const formattedTitle = `第 ${session.sessionNum}${subTag} 堂${label}`;

    li.innerHTML = `
      <div class="session-title">${formattedTitle}</div>
      <div class="session-meta">${session.date} | ${session.pageRange}</div>
    `;

    li.addEventListener('click', () => {
      onSelectSession(session);
    });

    container.appendChild(li);
  });
}

export function updateHeaderTitle(session) {
  const titleEl = document.getElementById('active-session-title');
  if (titleEl && session) {
    const subTag = session.subSession ? `${session.subSession}` : '';
    const label = session.periodLabel ? ` (${session.periodLabel})` : '';
    titleEl.textContent = `第 ${session.sessionNum}${subTag} 堂 - ${session.date}${label} (${session.pageRange})`;
  }
}
