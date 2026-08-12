/**
 * toc.js - Table of Contents Accordion & Seeking
 * Renders nested collapsible <details> menu and triggers audio seek + text scroll.
 */

export function renderTOC(sections, onSeekTo) {
  const container = document.getElementById('toc-container');
  if (!container) return;

  if (!sections || sections.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <details class="toc-accordion" open>
      <summary>📑 科判章節目錄 (點擊即刻跳轉播放)</summary>
      <ul class="toc-tree">
        ${renderSectionNodes(sections)}
      </ul>
    </details>
  `;

  // Bind click handlers
  container.querySelectorAll('.toc-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetSession = link.dataset.sessionId;
      const timestamp = parseFloat(link.dataset.timestamp);
      onSeekTo(targetSession, timestamp);
    });
  });
}

function renderSectionNodes(nodes) {
  return nodes.map(node => {
    const hasChildren = node.children && node.children.length > 0;
    return `
      <li>
        <a class="toc-link" data-session-id="${node.sessionId}" data-timestamp="${node.timestamp}">
          ${node.title}
        </a>
        ${hasChildren ? `<ul class="toc-tree">${renderSectionNodes(node.children)}</ul>` : ''}
      </li>
    `;
  }).join('');
}
