/**
 * search.js - Keyword Full-Text Search Engine
 */

export function initSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    const sentences = document.querySelectorAll('.sentence');

    sentences.forEach(el => {
      if (query && el.textContent.toLowerCase().includes(query)) {
        el.classList.add('search-hit');
      } else {
        el.classList.remove('search-hit');
      }
    });
  });
}
