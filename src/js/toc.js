/**
 * toc.js - Table of Contents Accordion & Seeking
 * Renders nested collapsible <details> menu, supports course/book scope toggle,
 * and highlights the section(s) matching the currently active session.
 *
 * Phase 1 Upgrade (Syllabus UX):
 *   - findAncestorChain(timestamp, sections): resolves the full doctrinal path at a given time
 *   - updateDoctrinalBreadcrumb(timestamp, sections): updates the sticky top breadcrumb bar
 *   - highlightTOCNodeByTime(timestamp): syncs TOC tree highlight to current playback position
 */

let currentActiveSessionId = null;
let currentScope = 'course'; // 'course' | 'book'
let _cachedSections = null;  // Phase 1: keep reference for time-driven updates
let _cachedSessionAnchors = null; // M4: separated playback/navigation anchors

export function renderTOC(tocInput, onSeekTo, options = {}) {
  const container = document.getElementById('toc-container');
  if (!container) return;

  const sections = Array.isArray(tocInput) ? tocInput : tocInput?.sections;
  const sessionAnchors = Array.isArray(tocInput?.sessionAnchors) ? tocInput.sessionAnchors : null;

  if (!sections || sections.length === 0) {
    container.style.display = 'none';
    return;
  }

  _cachedSections = sections; // cache for breadcrumb/highlight updates
  _cachedSessionAnchors = sessionAnchors;
  if (options.activeSessionId !== undefined) {
    currentActiveSessionId = options.activeSessionId;
  }
  if (options.scope === 'course' || options.scope === 'book') {
    currentScope = options.scope;
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
  courseBtn.dataset.testid = 'toc-scope-course';
  courseBtn.textContent = '本課科判';
  scopeToggle.appendChild(courseBtn);

  const bookBtn = document.createElement('button');
  bookBtn.className = `toc-scope-btn ${currentScope === 'book' ? 'active' : ''}`;
  bookBtn.dataset.scope = 'book';
  bookBtn.dataset.testid = 'toc-scope-book';
  bookBtn.textContent = '全書總科判';
  scopeToggle.appendChild(bookBtn);

  details.appendChild(scopeToggle);

  const treeRoot = document.createElement('ul');
  treeRoot.className = 'toc-tree';
  treeRoot.id = 'toc-tree-root';
  if (currentScope === 'course' && currentActiveSessionId && _cachedSessionAnchors) {
    renderSessionAnchorNodes(_cachedSessionAnchors, currentActiveSessionId, treeRoot);
  } else {
    renderSectionNodes(sections, currentScope === 'course', treeRoot);
  }
  details.appendChild(treeRoot);

  container.appendChild(details);

  // Scope toggle binding
  container.querySelectorAll('.toc-scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentScope = btn.dataset.scope;
      // Re-render with new scope, preserving active highlight
      renderTOC(tocInput, onSeekTo, {
        activeSessionId: currentActiveSessionId,
        scope: currentScope,
      });
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Doctrinal Breadcrumb & Real-time TOC Sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk the TOC tree and find the deepest node whose timestamp <= t,
 * returning the full ancestor chain from root to that leaf.
 * @param {number} t - current playback time in seconds (within current session)
 * @param {Array}  sections - root sections array from toc.json
 * @param {string} sessionId - the currently active session ID for filtering
 * @returns {Array<{title, timestamp, sessionId}>} ancestor chain, root → leaf
 */
export function findAncestorChain(t, sections, sessionId) {
  let bestChain = [];
  let bestTimestamp = -1;

  function walk(nodes, chain) {
    for (const node of nodes) {
      // Only consider nodes that belong to the active session
      const nodeSessions = Array.isArray(node.sessionIds) && node.sessionIds.length > 0
        ? node.sessionIds
        : (node.sessionId ? [node.sessionId] : []);

      if (sessionId && nodeSessions.length > 0 && !nodeSessions.includes(sessionId)) {
        // Recurse into children that might belong to this session
        if (node.children && node.children.length > 0) {
          walk(node.children, chain);
        }
        continue;
      }

      const ts = typeof node.timestamp === 'number' ? node.timestamp : 0;
      const currentChain = [...chain, { title: node.title, timestamp: ts, sessionId: node.sessionId }];

      // A node is "active" if its timestamp <= t and it's the deepest/latest such node
      if (ts <= t && ts > bestTimestamp) {
        bestTimestamp = ts;
        bestChain = [...currentChain];
      }

      if (node.children && node.children.length > 0) {
        walk(node.children, currentChain);
      }
    }
  }

  walk(sections, []);
  return bestChain;
}

/**
 * Format an ancestor chain array into a compact breadcrumb string.
 * Keeps at most maxDepth levels; truncates from the front if longer.
 */
export function formatBreadcrumb(chain, maxDepth = 5) {
  if (!chain || chain.length === 0) return '';
  const display = chain.length > maxDepth
    ? ['…', ...chain.slice(chain.length - maxDepth).map(n => n.title)]
    : chain.map(n => n.title);
  return display.join(' ❯ ');
}

/**
 * Update the sticky doctrinal breadcrumb bar (#toc-breadcrumb) based on
 * the current playback timestamp. Called by app.js on every timeupdate.
 * @param {number} t - current audio time in seconds (already scaled to transcript time)
 * @param {string} sessionId - active session ID
 */
export function updateDoctrinalBreadcrumb(t, sessionId) {
  const breadcrumbEl = document.getElementById('toc-breadcrumb');
  if (!breadcrumbEl || !_cachedSections) return;

  const chain = findAncestorChain(t, _cachedSections, sessionId);
  if (chain.length === 0) {
    breadcrumbEl.textContent = '';
    breadcrumbEl.style.display = 'none';
    return;
  }

  const text = formatBreadcrumb(chain, 5);

  // Only update DOM if content actually changed (avoid flicker on every frame)
  if (breadcrumbEl.dataset.lastText === text) return;
  breadcrumbEl.dataset.lastText = text;

  breadcrumbEl.innerHTML = '';
  breadcrumbEl.style.display = 'flex';

  const icon = document.createElement('span');
  icon.className = 'toc-breadcrumb-icon';
  icon.textContent = '📖';
  breadcrumbEl.appendChild(icon);

  const parts = chain.length > 5
    ? [{ title: '…' }, ...chain.slice(chain.length - 5)]
    : chain;

  parts.forEach((node, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'toc-breadcrumb-sep';
      sep.textContent = ' ❯ ';
      sep.setAttribute('aria-hidden', 'true');
      breadcrumbEl.appendChild(sep);
    }
    const span = document.createElement('span');
    span.className = i === parts.length - 1 ? 'toc-breadcrumb-leaf' : 'toc-breadcrumb-node';
    span.textContent = node.title;
    if (node.title !== '…') {
      span.title = `點擊展開科判目錄至「${node.title}」`;
    }
    breadcrumbEl.appendChild(span);
  });
}

/**
 * Highlight the TOC tree node closest to the current playback time.
 * Does NOT scroll the TOC panel (to avoid fighting user's manual scroll).
 * Called by app.js on timeupdate (throttled to ~2Hz).
 * @param {number} t - current transcript time in seconds
 * @param {string} sessionId - active session ID
 */
export function highlightTOCNodeByTime(t, sessionId) {
  const container = document.getElementById('toc-container');
  if (!container || !_cachedSections) return;

  const chain = findAncestorChain(t, _cachedSections, sessionId);
  if (chain.length === 0) return;

  const leafNode = chain[chain.length - 1];

  // Clear previous time-based highlights (distinct from session-based .active)
  container.querySelectorAll('.toc-link.toc-time-active').forEach(el => {
    el.classList.remove('toc-time-active');
  });

  // Find the link that matches leaf timestamp + sessionId
  const links = container.querySelectorAll('.toc-link');
  links.forEach(link => {
    const lts = parseFloat(link.dataset.timestamp || '0');
    const lsid = link.dataset.sessionId;
    if (Math.abs(lts - leafNode.timestamp) < 0.5 && lsid === (leafNode.sessionId || sessionId)) {
      link.classList.add('toc-time-active');
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal rendering helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render TOC nodes into the given parent <ul>. When scope === 'course', only
 * show nodes belonging to the active session (plus their ancestors so the
 * hierarchy is preserved). Dynamic titles are set via textContent.
 */

function renderSessionAnchorNodes(anchors, sessionId, parentUl) {
  const matchingAnchors = anchors.filter(anchor => anchor.sessionId === sessionId);

  if (matchingAnchors.length === 0) {
    const li = document.createElement('li');
    li.className = 'toc-empty';
    li.textContent = '本課尚未建立精準科判錨點';
    parentUl.appendChild(li);
    return;
  }

  const tree = buildAnchorTree(matchingAnchors);
  renderAnchorTree(tree, parentUl, sessionId);
}

function buildAnchorTree(anchors) {
  const root = [];
  const rootMap = new Map();

  for (const anchor of anchors) {
    const path = Array.isArray(anchor.outlinePath) && anchor.outlinePath.length > 0
      ? anchor.outlinePath
      : [anchor.title];
    let siblings = root;
    let siblingMap = rootMap;

    path.forEach((title, index) => {
      if (!siblingMap.has(title)) {
        const node = { title, children: [], childMap: new Map(), anchor: null };
        siblingMap.set(title, node);
        siblings.push(node);
      }
      const node = siblingMap.get(title);
      if (index === path.length - 1) {
        node.anchor = anchor;
      }
      siblings = node.children;
      siblingMap = node.childMap;
    });
  }

  return root;
}

function renderAnchorTree(nodes, parentUl, sessionId) {
  for (const node of nodes) {
    const li = document.createElement('li');
    if (node.anchor) {
      li.appendChild(createAnchorLink(node.anchor, sessionId));
    } else {
      const details = document.createElement('details');
      details.className = 'toc-sub';
      details.open = true;
      const summary = document.createElement('summary');
      summary.className = 'toc-ancestor';
      summary.textContent = node.title;
      details.appendChild(summary);
      const childUl = document.createElement('ul');
      childUl.className = 'toc-tree';
      renderAnchorTree(node.children, childUl, sessionId);
      details.appendChild(childUl);
      li.appendChild(details);
    }

    if (node.anchor && node.children.length > 0) {
      const childUl = document.createElement('ul');
      childUl.className = 'toc-tree';
      renderAnchorTree(node.children, childUl, sessionId);
      li.appendChild(childUl);
    }

    parentUl.appendChild(li);
  }
}

function createAnchorLink(anchor, sessionId) {
  const link = document.createElement('a');
  const timestampPending = anchor.timestamp === 0 || anchor.status === 'missing_timestamp';
  link.className = `toc-link${timestampPending ? ' toc-timestamp-pending' : ''}`;
  link.href = timestampPending ? `#session-${sessionId}` : `#session-${sessionId}-t${anchor.timestamp}`;
  link.setAttribute(
    'aria-label',
    timestampPending
      ? `${sessionId} 章節起點待補：${anchor.title}`
      : `跳到 ${sessionId} 章節：${anchor.title}`
  );
  if (timestampPending) {
    link.setAttribute('aria-disabled', 'true');
  }
  link.dataset.sessionId = sessionId;
  link.dataset.timestamp = String(anchor.timestamp);
  link.dataset.anchorId = anchor.anchorId;
  link.dataset.testid = `toc-anchor-${anchor.anchorId}`;
  link.textContent = anchor.title;

  const status = anchor.status || 'inferred';
  if (status === 'needs_review') {
    const badge = document.createElement('span');
    badge.className = 'toc-review-badge';
    badge.textContent = '待審';
    badge.title = anchor.reviewReason || '此科判錨點需人工複審';
    link.appendChild(document.createTextNode(' '));
    link.appendChild(badge);
  }

  if (anchor.page) {
    const pageBadge = document.createElement('span');
    pageBadge.className = 'toc-page-badge';
    pageBadge.textContent = `p.${anchor.page}`;
    pageBadge.title = `論典第 ${anchor.page} 頁`;
    link.appendChild(document.createTextNode(' '));
    link.appendChild(pageBadge);
  }

  if (anchor.timestamp > 0) {
    const min = Math.floor(anchor.timestamp / 60);
    const sec = Math.floor(anchor.timestamp % 60).toString().padStart(2, '0');
    const badge = document.createElement('span');
    badge.className = 'toc-timestamp-badge';
    badge.textContent = `${min}:${sec}`;
    badge.title = `點擊跳轉至 ${min}:${sec}`;
    link.appendChild(document.createTextNode(' '));
    link.appendChild(badge);
  } else {
    const badge = document.createElement('span');
    badge.className = 'toc-timestamp-pending-badge';
    badge.textContent = '起點待補';
    badge.title = '此科判尚未標定精準播放時間';
    link.appendChild(document.createTextNode(' '));
    link.appendChild(badge);
  }

  return link;
}

function renderSectionNodes(nodes, courseOnly, parentUl) {
  nodes.forEach(node => {
    const hasChildren = node.children && node.children.length > 0;
    const nodeSession = node.sessionId;

    const nodeSessions = Array.isArray(node.sessionIds) && node.sessionIds.length > 0 ? node.sessionIds : (nodeSession ? [nodeSession] : []);
    const nodeMatchesActive = currentActiveSessionId ? nodeSessions.includes(currentActiveSessionId) : false;

    // In course scope, filter to nodes matching active session
    if (courseOnly && currentActiveSessionId && !nodeMatchesActive) {
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

    const primarySession = nodeMatchesActive ? currentActiveSessionId : (nodeSessions[0] || nodeSession);

    const li = document.createElement('li');
    const link = document.createElement('a');
    const timestampPending = node.timestamp === 0;
    link.className = `toc-link${timestampPending ? ' toc-timestamp-pending' : ''}`;
    link.href = timestampPending ? `#session-${primarySession}` : `#session-${primarySession}-t${node.timestamp}`;
    link.setAttribute(
      'aria-label',
      timestampPending
        ? `${primarySession} 章節起點待補：${node.title}`
        : `跳到 ${primarySession} 章節：${node.title}`
    );
    if (timestampPending) {
      link.setAttribute('aria-disabled', 'true');
    }
    link.dataset.sessionId = primarySession;
    link.dataset.timestamp = String(node.timestamp);
    link.dataset.testid = `toc-node-${node.title.substring(0, 8).replace(/\s/g, '')}`;
    link.textContent = node.title;
    li.appendChild(link);

    // Show session badges (supporting multiple sessions if taught in multiple classes)
    if (nodeSessions.length > 0) {
      nodeSessions.forEach(sid => {
        const sessionBadge = document.createElement('span');
        sessionBadge.className = `toc-session-badge ${sid === currentActiveSessionId ? 'active' : ''}`;
        sessionBadge.textContent = sid;
        sessionBadge.title = `點擊切換至 第 ${sid} 堂 講授段落`;
        sessionBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          window.location.hash = `#session-${sid}`;
        });
        link.appendChild(document.createTextNode(' '));
        link.appendChild(sessionBadge);
      });
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
    } else if (timestampPending) {
      const badge = document.createElement('span');
      badge.className = 'toc-timestamp-pending-badge';
      badge.textContent = '起點待補';
      badge.title = '此科判尚未標定精準播放時間';
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
  if (Array.isArray(node.sessionIds) && node.sessionIds.includes(sessionId)) return true;
  if (node.children) {
    return node.children.some(child => nodeContainsSession(child, sessionId));
  }
  return false;
}
