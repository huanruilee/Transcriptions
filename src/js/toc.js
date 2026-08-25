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
      // Auto-collapse TOC accordion after selection
      details.open = false;
      onSeekTo(targetSession, timestamp);
    });
    // M6.3 a11y: Keyboard activation (Enter / Space) for role="button"
    link.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const targetSession = link.dataset.sessionId;
        const timestamp = parseFloat(link.dataset.timestamp);
        // Auto-collapse TOC accordion after selection
        details.open = false;
        onSeekTo(targetSession, timestamp);
      }
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
    // M6.3 a11y (AGY review): <a href> is natively focusable + keyboard-activatable,
    // so NO role="button" and NO tabindex=0 needed (avoids "Link Button" double
    // announcement). href is a hash so middle-click "open in new tab" works
    // semantically (the click handler still e.preventDefault()s for same-tab nav).
    link.href = `#session-${nodeSession}-t${node.timestamp}`;
    link.setAttribute('aria-label', `跳到 ${nodeSession} 章節：${node.title}`);
    link.dataset.sessionId = nodeSession;
    link.dataset.timestamp = String(node.timestamp);
    link.textContent = node.title;
    li.appendChild(link);

    // Show session badge if session is present
    if (nodeSession) {
      const sessionBadge = document.createElement('span');
      sessionBadge.className = 'toc-session-badge';
      sessionBadge.textContent = nodeSession;
      sessionBadge.title = `第 ${nodeSession} 堂音檔講次`;
      link.appendChild(document.createTextNode(' '));
      link.appendChild(sessionBadge);
    }

    // Show clean page badge if page is present
    if (node.page) {
      const pageBadge = document.createElement('span');
      pageBadge.className = 'toc-page-badge';
      pageBadge.textContent = `p.${node.page}`;
      pageBadge.title = `論典第 ${node.page} 頁`;
      link.appendChild(document.createTextNode(' '));
      link.appendChild(pageBadge);
    }

    // Show timestamp badge if positive timestamp exists
    if (node.timestamp > 0) {
      const min = Math.floor(node.timestamp / 60);
      const sec = Math.floor(node.timestamp % 60).toString().padStart(2, '0');
      const badge = document.createElement('span');
      badge.className = 'toc-timestamp-badge';
      badge.textContent = `${min}:${sec}`;
      badge.title = `點擊跳轉至 ${min}:${sec}`;
      link.appendChild(document.createTextNode(' '));
      link.appendChild(badge);
    }

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
