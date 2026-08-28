/**
 * search.js - Keyword Full-Text Search Engine
 *
 * Highlights matching sentences (.search-hit), shows a result count, and
 * supports next/previous navigation (Enter / Shift+Enter) plus Escape to clear.
 * The current match is marked with .search-current and scrolled into view.
 */

let currentMatchIndex = -1;
let currentMatches = [];

function clearMatches() {
  document.querySelectorAll('.sentence.search-hit').forEach(el => el.classList.remove('search-hit'));
  document.querySelectorAll('.sentence.search-current').forEach(el => el.classList.remove('search-current'));
  currentMatches = [];
  currentMatchIndex = -1;
}

function updateStatus() {
  const statusEl = document.getElementById('search-status');
  if (!statusEl) return;

  const query = document.getElementById('search-input').value.trim();
  if (!query) {
    statusEl.hidden = true;
    statusEl.textContent = '';
    return;
  }

  if (currentMatches.length === 0) {
    statusEl.hidden = false;
    statusEl.textContent = '無相符結果';
    return;
  }

  statusEl.hidden = false;
  statusEl.textContent = `${currentMatchIndex + 1}/${currentMatches.length} 筆`;
}

function scrollToCurrent() {
  if (currentMatchIndex < 0 || currentMatchIndex >= currentMatches.length) return;
  const el = currentMatches[currentMatchIndex];
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setCurrent(index) {
  document.querySelectorAll('.sentence.search-current').forEach(el => el.classList.remove('search-current'));
  currentMatchIndex = index;
  if (index >= 0 && index < currentMatches.length) {
    currentMatches[index].classList.add('search-current');
  }
  updateStatus();
  scrollToCurrent();
}

function runSearch(query) {
  clearMatches();
  if (!query) {
    updateStatus();
    return;
  }

  const sentences = document.querySelectorAll('.sentence');
  sentences.forEach(el => {
    if (el.textContent.toLowerCase().includes(query)) {
      el.classList.add('search-hit');
      currentMatches.push(el);
    }
  });

  if (currentMatches.length > 0) {
    setCurrent(0);
  } else {
    updateStatus();
  }
}

export function initSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    runSearch(query);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentMatches.length === 0) return;
      const step = e.shiftKey ? -1 : 1;
      const next = (currentMatchIndex + step + currentMatches.length) % currentMatches.length;
      setCurrent(next);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      searchInput.value = '';
      runSearch('');
      searchInput.blur();
    }
  });

  // Global Cmd+K / Ctrl+K search shortcut
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
        if (typeof searchInput.select === 'function') {
          searchInput.select();
        }
      }
    });
  }
}
