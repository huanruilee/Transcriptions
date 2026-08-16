/**
 * toc.js - Table of Contents Accordion & Seeking
 * Renders nested collapsible <details> menu, supports course/book scope toggle,
 * and highlights the section(s) matching the currently active session.
 */

let currentActiveSessionId = null;
let currentScope = 'course'; // 'course' | 'book'

export function renderTOC(sections, onSeekTo) {
  const container = document.getElementById('toc-container');
  if (!container) return;

  if (!sections || sections.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.textContent = '';

  const details = document.createElement('details');
  details.className = 'toc-accordion';

  const summary = document.createElement('summary');
  summary.textContent = '📑 科判章節目錄 (點擊即刻跳轉播放)';
  details.appendChild(summary);

  const scopeToggle = document.createElement('div');
  scopeToggle.className = 'toc-scope-toggle';

  const courseBtn = document.createElement('button');
  courseBtn.className = `toc-scope-btn ${currentScope === 'course' ? 'active' : ''}`;
  courseBtn.dataset.scope = 'course';
  courseBtn.textContent = '本課科判';
  scopeToggle.appendChild(courseBtn);

  const bookBtn = document.createElement('button');
  bookBtn.className = `toc-scope-btn ${currentScope === 'book' ? 'active' : ''}`;
  bookBtn.dataset.scope = 'book';
  bookBtn.textContent = '全書總科判';
  scopeToggle.appendChild(bookBtn);

  details.appendChild(scopeToggle);

  const treeRoot = document.createElement('ul');
  treeRoot.className = 'toc-tree';
  treeRoot.id = 'toc-tree-root';
  renderSectionNodes(sections, currentScope === 'course', treeRoot);
  details.appendChild(treeRoot);

  container.appendChild(details);

  // Scope toggle binding
  container.querySelectorAll('.toc-scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentScope = btn.dataset.scope;
      // Re-render with new scope, preserving active highlight
      renderTOC(sections, onSeekTo);
      applyActiveHighlight(currentActiveSessionId);
    });
  });

  // Bind click handlers
  container.querySelectorAll('.toc-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetSession = link.dataset.sessionId;
      const timestamp = parseFloat(link.dataset.timestamp);
      onSeekTo(targetSession, timestamp);
    });
  });

  // Apply active highlight if we already know the session
  if (currentActiveSessionId) {
    applyActiveHighlight(currentActiveSessionId);
  }
}

/**
 * Highlight the TOC node(s) matching the given sessionId.
 * In 'course' scope, only nodes for that session are shown (already filtered).
 * In 'book' scope, matching nodes get the .active class + scroll into view.
 */
export function applyActiveHighlight(sessionId) {
  currentActiveSessionId = sessionId;
  const container = document.getElementById('toc-container');
  if (!container) return;

  // Clear previous active
  container.querySelectorAll('.toc-link.active').forEach(el => el.classList.remove('active'));

  // Highlight all links whose data-session-id matches
  const matches = container.querySelectorAll(`.toc-link[data-session-id="${sessionId}"]`);
  matches.forEach(el => {
    el.classList.add('active');
    // Scroll the first match into view (centered) so user sees current position
    if (el === matches[0]) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

/**
 * Render TOC nodes into the given parent <ul>. When scope === 'course', only
 * show nodes belonging to the active session (plus their ancestors so the
 * hierarchy is preserved). Dynamic titles are set via textContent.
 */
function renderSectionNodes(nodes, courseOnly, parentUl) {
  nodes.forEach(node => {
    const hasChildren = node.children && node.children.length > 0;
    const nodeSession = node.sessionId;

    // In course scope, filter to nodes matching active session
    if (courseOnly && currentActiveSessionId && nodeSession !== currentActiveSessionId) {
      // If this node has children that match, keep it as a collapsed ancestor
      if (hasChildren && nodeContainsSession(node, currentActiveSessionId)) {
        const li = document.createElement('li');
        const details = document.createElement('details');
        details.className = 'toc-sub';
        const summary = document.createElement('summary');
        summary.className = 'toc-ancestor';
        summary.textContent = node.title;
        details.appendChild(summary);
        const childUl = document.createElement('ul');
        childUl.className = 'toc-tree';
        renderSectionNodes(node.children, true, childUl);
        details.appendChild(childUl);
        li.appendChild(details);
        parentUl.appendChild(li);
      }
      return;
    }

    const li = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'toc-link';
    link.dataset.sessionId = nodeSession;
    link.dataset.timestamp = String(node.timestamp);
    link.textContent = node.title;

    // M6.2 fix (Qwen F1): Visually mark timestamps that are 0 (= missing).
    // Reason: 40/43 zero-timestamps cannot be auto-derived from sentence.start
    // (all sessions start at 0.0 because audio-cpp ASR resets per-file).
    // UI shows "章節起點待補" instead of "0:00" so user knows it's not a real marker.
    if (node.timestamp === 0 && nodeSession) {
      const badge = document.createElement('span');
      badge.className = 'toc-timestamp-badge';
      badge.textContent = '章節起點待補';
      badge.title = '此子章節的真實起點需手動標註或 LLM 分析（sentence.start 全為 0.0）';
      link.appendChild(document.createTextNode(' '));
      link.appendChild(badge);
      link.classList.add('toc-timestamp-pending');
    }

    li.appendChild(link);

    if (hasChildren) {
      const childUl = document.createElement('ul');
      childUl.className = 'toc-tree';
      renderSectionNodes(node.children, courseOnly, childUl);
      li.appendChild(childUl);
    }

    parentUl.appendChild(li);
  });
}

function nodeContainsSession(node, sessionId) {
  if (node.sessionId === sessionId) return true;
  if (node.children) {
    return node.children.some(child => nodeContainsSession(child, sessionId));
  }
  return false;
}
