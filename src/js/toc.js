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

export function renderTOC(sections, onSeekTo, options = {}) {
  const container = document.getElementById('toc-container');
  if (!container) return;

  if (options.scope) currentScope = options.scope;
  if (options.activeSessionId) currentActiveSessionId = options.activeSessionId;

  if (!sections || sections.length === 0) {
    container.style.display = 'none';
    return;
  }

  _cachedSections = sections; // cache for breadcrumb/highlight updates

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

  // Phase 2 / Mobile Upgrade: initialize mobile bottom sheet
  initTOCBottomSheet(sections, onSeekTo, currentActiveSessionId);
}

/**
 * Highlight the TOC node(s) matching the given sessionId.
 * In 'course' scope, only nodes for that session are shown (already filtered).
 * In 'book' scope, matching nodes get the .active class + scroll into view.
 */
export function applyActiveHighlight(sessionId) {
  currentActiveSessionId = sessionId;
  const container = document.getElementById('toc-container');
  if (container) {
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

  // Update mobile bottom sheet with new session context if cached
  if (_cachedSections && _bottomSheetOnSeekTo) {
    initTOCBottomSheet(_cachedSections, _bottomSheetOnSeekTo, sessionId);
  }
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

      // A node is "active" if its own acoustic timestamp belongs to this session and <= t
      const isNodeAnchorForThisSession = node.sessionId === sessionId;
      if (isNodeAnchorForThisSession && ts <= t && ts > bestTimestamp) {
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
    link.className = 'toc-link';
    if (node.timestamp === 0 || !node.timestamp) {
      link.setAttribute('aria-disabled', 'true');
      link.href = `#session-${primarySession}`;
    } else {
      link.href = `#session-${primarySession}-t${node.timestamp}`;
    }
    link.setAttribute('aria-label', `跳到 ${primarySession} 章節：${node.title}`);
    link.dataset.sessionId = primarySession;
    link.dataset.timestamp = String(node.timestamp || 0);
    link.dataset.testid = `toc-node-${node.title.substring(0, 8).replace(/\s/g, '')}`;
    link.textContent = node.title;
    li.appendChild(link);

    // Show session badges (pinned active session + collapsed ghost badge)
    if (nodeSessions.length > 0) {
      renderSessionBadges(link, nodeSessions, currentActiveSessionId);
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
  if (Array.isArray(node.sessionIds) && node.sessionIds.includes(sessionId)) return true;
  if (node.children) {
    return node.children.some(child => nodeContainsSession(child, sessionId));
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Inline Doctrinal Anchor Card helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a paragraph's start timestamp and current sessionId, find the TOC node
 * whose timestamp matches within a small tolerance (<=2s). Returns the node
 * object if found, otherwise null. Used to inject inline doctrinal anchor cards.
 * @param {number} paragraphStart - paragraph start time in seconds (transcript scale)
 * @param {string} sessionId - active session ID
 * @param {number} [tolerance=2] - max seconds difference to consider a match
 * @returns {{title: string, timestamp: number, page?: number, sessionId?: string}|null}
 */
export function findTOCNodeAtParagraphStart(paragraphStart, sessionId, tolerance = 2) {
  if (!_cachedSections) return null;

  let match = null;

  function walk(nodes) {
    for (const node of nodes) {
      // Strict session match: acoustic timestamps are specific to the primary sessionId!
      const sessionMatch = node.sessionId === sessionId;
      const ts = typeof node.timestamp === 'number' ? node.timestamp : 0;

      if (sessionMatch && ts > 0 && Math.abs(ts - paragraphStart) <= tolerance) {
        match = { title: node.title, timestamp: ts, page: node.page, sessionId: node.sessionId };
      }

      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(_cachedSections);
  return match;
}

// ─────────────────────────────────────────────────────────────────────────────
// Desktop Tag Collapse & Popover Navigation
// ─────────────────────────────────────────────────────────────────────────────

let activePopover = null;

/**
 * Close any active session popover.
 */
export function closeActivePopover() {
  if (activePopover) {
    if (activePopover.anchor) {
      activePopover.anchor.setAttribute('aria-expanded', 'false');
    }
    if (activePopover.el && activePopover.el.parentNode) {
      activePopover.el.parentNode.removeChild(activePopover.el);
    }
    activePopover = null;
  }
}

/**
 * Toggle session popover next to anchor button.
 * @param {HTMLElement} anchorBtn
 * @param {string[]} allSessions
 * @param {string|null} activeSessionId
 */
export function togglePopover(anchorBtn, allSessions, activeSessionId) {
  if (activePopover && activePopover.anchor === anchorBtn) {
    closeActivePopover();
    return;
  }
  closeActivePopover();

  if (typeof document === 'undefined') return;

  const popover = document.createElement('div');
  popover.className = 'toc-popover';
  popover.setAttribute('role', 'tooltip');

  const title = document.createElement('div');
  title.className = 'toc-popover-title';
  title.textContent = `相關講次 (${allSessions.length})`;
  popover.appendChild(title);

  const list = document.createElement('div');
  list.className = 'toc-popover-list';

  allSessions.forEach(sid => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `popover-session-item ${sid === activeSessionId ? 'active' : ''}`;
    btn.textContent = sid;
    btn.title = `切換至第 ${sid} 講`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      closeActivePopover();
      if (typeof window !== 'undefined') {
        window.location.hash = `#session-${sid}`;
      }
    });
    list.appendChild(btn);
  });

  popover.appendChild(list);

  anchorBtn.setAttribute('aria-expanded', 'true');
  if (document.body) {
    document.body.appendChild(popover);
    const rect = typeof anchorBtn.getBoundingClientRect === 'function' ? anchorBtn.getBoundingClientRect() : null;
    const scrollY = typeof window !== 'undefined' ? (window.scrollY || 0) : 0;
    const scrollX = typeof window !== 'undefined' ? (window.scrollX || 0) : 0;
    const top = (rect ? rect.bottom : 0) + scrollY + 4;
    const left = Math.max(8, (rect ? rect.left : 0) + scrollX - 10);
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  } else if (anchorBtn.parentNode) {
    anchorBtn.parentNode.appendChild(popover);
  }

  activePopover = { el: popover, anchor: anchorBtn };
}

/**
 * Render pinned session badge + collapsed ghost button for remaining sessions.
 * @param {HTMLElement} link
 * @param {string[]} nodeSessions
 * @param {string|null} activeSessionId
 */
export function renderSessionBadges(link, nodeSessions, activeSessionId) {
  if (!nodeSessions || nodeSessions.length === 0 || typeof document === 'undefined') return;

  // Find pinned session: active session if present in nodeSessions, else first session
  const hasActive = activeSessionId && nodeSessions.includes(activeSessionId);
  const pinnedSession = hasActive ? activeSessionId : nodeSessions[0];

  // 1. Pinned badge
  const pinnedBadge = document.createElement('span');
  pinnedBadge.className = `toc-session-badge ${pinnedSession === activeSessionId ? 'active' : ''}`;
  pinnedBadge.textContent = pinnedSession;
  pinnedBadge.title = `點擊切換至 第 ${pinnedSession} 堂 講授段落`;
  pinnedBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (typeof window !== 'undefined') {
      window.location.hash = `#session-${pinnedSession}`;
    }
  });
  link.appendChild(document.createTextNode(' '));
  link.appendChild(pinnedBadge);

  // 2. Collapsed ghost button if multiple sessions
  const otherSessions = nodeSessions.filter(sid => sid !== pinnedSession);
  if (otherSessions.length > 0) {
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'toc-badge-collapsed';
    collapseBtn.dataset.testid = 'toc-badge-collapsed';
    collapseBtn.setAttribute('aria-haspopup', 'dialog');
    collapseBtn.setAttribute('aria-expanded', 'false');
    collapseBtn.title = `查看其餘 ${otherSessions.length} 個講次（點擊展開）`;
    collapseBtn.textContent = `+${otherSessions.length} 講 ▾`;

    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      togglePopover(collapseBtn, nodeSessions, activeSessionId);
    });

    link.appendChild(document.createTextNode(' '));
    link.appendChild(collapseBtn);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile Bottom Sheet Drawer for Course TOC
// ─────────────────────────────────────────────────────────────────────────────

let _bottomSheetSections = null;
let _bottomSheetOnSeekTo = null;

/**
 * Open the mobile TOC bottom sheet drawer.
 */
export function openTOCBottomSheet() {
  if (typeof document === 'undefined') return;
  const sheet = document.getElementById('toc-bottom-sheet');
  const backdrop = document.getElementById('toc-sheet-backdrop');
  if (sheet) sheet.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
  if (document.body) document.body.classList.add('toc-sheet-open');
}

/**
 * Close the mobile TOC bottom sheet drawer.
 */
export function closeTOCBottomSheet() {
  if (typeof document === 'undefined') return;
  const sheet = document.getElementById('toc-bottom-sheet');
  const backdrop = document.getElementById('toc-sheet-backdrop');
  if (sheet) sheet.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  if (document.body) document.body.classList.remove('toc-sheet-open');
}

/**
 * Return whether the mobile TOC bottom sheet drawer is currently open.
 * @returns {boolean}
 */
export function isBottomSheetOpen() {
  if (typeof document === 'undefined') return false;
  const sheet = document.getElementById('toc-bottom-sheet');
  return !!(sheet && sheet.classList.contains('open'));
}

/**
 * Initialize or update the mobile bottom sheet drawer.
 * @param {Array} sections - root sections array from toc.json
 * @param {Function} onSeekTo - callback (targetSession, timestamp)
 * @param {string|null} activeSessionId - currently active session ID
 */
export function initTOCBottomSheet(sections, onSeekTo, activeSessionId) {
  _bottomSheetSections = sections;
  _bottomSheetOnSeekTo = onSeekTo;

  if (typeof document === 'undefined') return;

  const sheet = document.getElementById('toc-bottom-sheet');
  const backdrop = document.getElementById('toc-sheet-backdrop');
  const mobileDrawerBtn = document.getElementById('mobile-toc-drawer-btn');

  // Filter nodes belonging to activeSessionId
  const sessionNodes = [];
  function collectSessionNodes(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      const sids = Array.isArray(n.sessionIds) && n.sessionIds.length > 0
        ? n.sessionIds
        : (n.sessionId ? [n.sessionId] : []);
      if (activeSessionId && sids.includes(activeSessionId)) {
        sessionNodes.push(n);
      }
      if (n.children && n.children.length > 0) {
        collectSessionNodes(n.children);
      }
    }
  }
  collectSessionNodes(sections);

  // Update header button label with matching section count
  if (mobileDrawerBtn) {
    const count = sessionNodes.length;
    mobileDrawerBtn.textContent = count > 0 ? `📑 本課科判 (${count})` : '📑 本課科判';
  }

  if (!sheet) return;

  sheet.innerHTML = '';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'sheet-drag-handle';
  sheet.appendChild(dragHandle);

  const header = document.createElement('div');
  header.className = 'sheet-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'sheet-title-group';

  const title = document.createElement('div');
  title.className = 'sheet-title';
  title.textContent = '📑 本課科判目錄';
  titleGroup.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.className = 'sheet-subtitle';
  subtitle.textContent = `講次：${activeSessionId || '未指定'}（共 ${sessionNodes.length} 個節點）`;
  titleGroup.appendChild(subtitle);

  header.appendChild(titleGroup);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sheet-close-btn';
  closeBtn.id = 'sheet-close-btn';
  closeBtn.setAttribute('aria-label', '關閉科判目錄');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => {
    closeTOCBottomSheet();
  });
  header.appendChild(closeBtn);

  sheet.appendChild(header);

  const body = document.createElement('div');
  body.className = 'sheet-body';

  if (sessionNodes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sheet-empty';
    empty.style.padding = '24px 16px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--text-muted, #777)';
    empty.textContent = '本講次尚無專屬科判節點';
    body.appendChild(empty);
  } else {
    const ul = document.createElement('ul');
    ul.className = 'sheet-node-list';

    sessionNodes.forEach(node => {
      const li = document.createElement('li');
      li.className = 'sheet-node-item';

      const info = document.createElement('div');
      info.className = 'sheet-node-info';

      const nodeTitle = document.createElement('span');
      nodeTitle.className = 'sheet-node-title';
      nodeTitle.textContent = node.title;
      info.appendChild(nodeTitle);

      if (node.page) {
        const pageSpan = document.createElement('span');
        pageSpan.className = 'toc-page-badge';
        pageSpan.textContent = `p.${node.page}`;
        info.appendChild(pageSpan);
      }

      li.appendChild(info);

      const ts = typeof node.timestamp === 'number' ? node.timestamp : 0;
      if (ts > 0) {
        const min = Math.floor(ts / 60);
        const sec = Math.floor(ts % 60).toString().padStart(2, '0');

        const tsBtn = document.createElement('button');
        tsBtn.type = 'button';
        tsBtn.className = 'sheet-timestamp-btn';
        tsBtn.dataset.sessionId = activeSessionId;
        tsBtn.dataset.timestamp = String(ts);
        tsBtn.setAttribute('aria-label', `跳至 ${min}:${sec} 播放`);
        tsBtn.innerHTML = `<span class="sheet-ts-icon">⏱️</span> ${min}:${sec}`;

        tsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeTOCBottomSheet();
          if (onSeekTo) {
            onSeekTo(activeSessionId, ts);
          }
        });

        li.appendChild(tsBtn);
      } else {
        const pending = document.createElement('span');
        pending.className = 'sheet-ts-pending';
        pending.textContent = '待標註';
        li.appendChild(pending);
      }

      ul.appendChild(li);
    });

    body.appendChild(ul);
  }

  sheet.appendChild(body);

  if (backdrop) {
    backdrop.onclick = () => {
      closeTOCBottomSheet();
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Accessibility Listeners (Escape & Outside Click)
// ─────────────────────────────────────────────────────────────────────────────

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (activePopover && activePopover.el && !activePopover.el.contains(e.target) && e.target !== activePopover.anchor) {
      closeActivePopover();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (activePopover) {
        closeActivePopover();
      }
      if (isBottomSheetOpen()) {
        closeTOCBottomSheet();
      }
    }
  });
}

