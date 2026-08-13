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
  container.innerHTML = `
    <details class="toc-accordion">
      <summary>📑 科判章節目錄 (點擊即刻跳轉播放)</summary>
      <div class="toc-scope-toggle">
        <button class="toc-scope-btn ${currentScope === 'course' ? 'active' : ''}" data-scope="course">本課科判</button>
        <button class="toc-scope-btn ${currentScope === 'book' ? 'active' : ''}" data-scope="book">全書總科判</button>
      </div>
      <ul class="toc-tree" id="toc-tree-root">
        ${renderSectionNodes(sections, currentScope === 'course')}
      </ul>
    </details>
  `;

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
 * Render TOC nodes. When scope === 'course', only show nodes belonging to the
 * active session (plus their ancestors so the hierarchy is preserved).
 */
function renderSectionNodes(nodes, courseOnly) {
  return nodes.map(node => {
    const hasChildren = node.children && node.children.length > 0;
    const nodeSession = node.sessionId;

    // In course scope, filter to nodes matching active session
    if (courseOnly && currentActiveSessionId && nodeSession !== currentActiveSessionId) {
      // If this node has children that match, keep it as a collapsed ancestor
      if (hasChildren && nodeContainsSession(node, currentActiveSessionId)) {
        return `
          <li>
            <details class="toc-sub">
              <summary class="toc-ancestor">${node.title}</summary>
              <ul class="toc-tree">${renderSectionNodes(node.children, true)}</ul>
            </details>
          </li>
        `;
      }
      return '';
    }

    return `
      <li>
        <a class="toc-link" data-session-id="${nodeSession}" data-timestamp="${node.timestamp}">
          ${node.title}
        </a>
        ${hasChildren ? `<ul class="toc-tree">${renderSectionNodes(node.children, courseOnly)}</ul>` : ''}
      </li>
    `;
  }).join('');
}

function nodeContainsSession(node, sessionId) {
  if (node.sessionId === sessionId) return true;
  if (node.children) {
    return node.children.some(child => nodeContainsSession(child, sessionId));
  }
  return false;
}
