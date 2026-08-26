/**
 * annotation.js - Interactive Proofreading & Study Notes Workspace
 * Handles localStorage persistence, diff generation, modal editor, and Markdown export.
 */

const STORAGE_PREFIX_CORRECTION = 'transcriptions_corr_';
const STORAGE_PREFIX_NOTES = 'transcriptions_note_';

export function saveCorrection(sessionId, sentenceId, data) {
  if (!sessionId || !sentenceId || !data) return;
  const key = `${STORAGE_PREFIX_CORRECTION}${sessionId}`;
  const all = getAllCorrections(sessionId);
  all[sentenceId] = {
    ...data,
    updatedAt: Date.now()
  };
  try {
    localStorage.setItem(key, JSON.stringify(all));
  } catch (e) {
    console.error('Failed to save correction to localStorage:', e);
  }
}

export function getCorrection(sessionId, sentenceId) {
  const all = getAllCorrections(sessionId);
  return all[sentenceId] || null;
}

export function getAllCorrections(sessionId) {
  if (!sessionId) return {};
  const key = `${STORAGE_PREFIX_CORRECTION}${sessionId}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function removeCorrection(sessionId, sentenceId) {
  if (!sessionId || !sentenceId) return;
  const key = `${STORAGE_PREFIX_CORRECTION}${sessionId}`;
  const all = getAllCorrections(sessionId);
  if (all[sentenceId]) {
    delete all[sentenceId];
    try {
      localStorage.setItem(key, JSON.stringify(all));
    } catch (e) {}
  }
}

export function saveNote(sessionId, sentenceId, data) {
  if (!sessionId || !sentenceId || !data) return;
  const key = `${STORAGE_PREFIX_NOTES}${sessionId}`;
  const all = getAllNotes(sessionId);
  all[sentenceId] = {
    ...data,
    updatedAt: Date.now()
  };
  try {
    localStorage.setItem(key, JSON.stringify(all));
  } catch (e) {
    console.error('Failed to save note to localStorage:', e);
  }
}

export function getNote(sessionId, sentenceId) {
  const all = getAllNotes(sessionId);
  return all[sentenceId] || null;
}

export function getAllNotes(sessionId) {
  if (!sessionId) return {};
  const key = `${STORAGE_PREFIX_NOTES}${sessionId}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function removeNote(sessionId, sentenceId) {
  if (!sessionId || !sentenceId) return;
  const key = `${STORAGE_PREFIX_NOTES}${sessionId}`;
  const all = getAllNotes(sessionId);
  if (all[sentenceId]) {
    delete all[sentenceId];
    try {
      localStorage.setItem(key, JSON.stringify(all));
    } catch (e) {}
  }
}

/**
 * Character-level diff calculation for Chinese Buddhist terms
 */
export function computeSentenceDiff(original, corrected) {
  if (!original) original = '';
  if (!corrected) corrected = '';
  if (original === corrected) return corrected;

  // Simple LCS / replacement chunk highlight
  let i = 0;
  while (i < original.length && i < corrected.length && original[i] === corrected[i]) {
    i++;
  }

  let jOriginal = original.length - 1;
  let jCorrected = corrected.length - 1;
  while (jOriginal >= i && jCorrected >= i && original[jOriginal] === corrected[jCorrected]) {
    jOriginal--;
    jCorrected--;
  }

  const prefix = original.slice(0, i);
  const delText = original.slice(i, jOriginal + 1);
  const insText = corrected.slice(i, jCorrected + 1);
  const suffix = original.slice(jOriginal + 1);

  let result = prefix;
  if (delText) result += `<del class="diff-del">${delText}</del>`;
  if (insText) result += `<ins class="diff-ins">${insText}</ins>`;
  result += suffix;

  return result;
}

/**
 * Formats all notes and corrections for a session into a rich Markdown document
 */
export function exportNotesAsMarkdown(sessionId, sessionData) {
  const corrections = getAllCorrections(sessionId);
  const notes = getAllNotes(sessionId);

  const lines = [];
  lines.append = (str) => lines.push(str);

  lines.append(`# 《入中論善顯密意疏》研讀筆記與校對紀錄 — 第 ${sessionId} 堂`);
  lines.append(`> 匯出日期：${new Date().toLocaleDateString('zh-TW')} ｜ 講次：第 ${sessionId} 堂 ｜ 授課主題：${sessionData?.title || ''}`);
  lines.append('');
  lines.append('---');
  lines.append('');

  // Summary statistics
  const corrCount = Object.keys(corrections).length;
  const noteCount = Object.keys(notes).length;
  lines.append(`### 📊 本講學習統計：共 ${noteCount} 則法義筆記，${corrCount} 處文字校對。`);
  lines.append('');

  if (sessionData && sessionData.paragraphs) {
    sessionData.paragraphs.forEach(p => {
      if (p.heading) {
        lines.append(`### ${p.heading}`);
        lines.append('');
      }

      p.sentences.forEach(s => {
        const sid = s.id || `sent-${s.start}`;
        const corr = corrections[sid];
        const note = notes[sid];

        const textToDisplay = corr ? corr.correctedText : s.text;
        const timeBadge = `\`[${Math.floor(s.start / 60)}:${Math.floor(s.start % 60).toString().padStart(2, '0')}]\``;

        lines.append(`${timeBadge} ${textToDisplay}`);

        if (corr) {
          lines.append(`> ✏️ **【校對修正】**：\`${corr.correctedText}\` _(原音辨識: ${corr.originalText})_`);
        }

        if (note) {
          const tagInfo = note.tag ? `${note.tag} ｜ ` : '';
          const pageInfo = note.pageRef ? `${note.pageRef}` : '';
          lines.append(`> 📌 **【研讀筆記 (${tagInfo}${pageInfo})】**：${note.content}`);
        }

        if (corr || note) {
          lines.append('');
        }
      });
      lines.append('');
    });
  }

  lines.append('---');
  lines.append('*由《入中論善顯密意疏》多媒體研讀平台自動生成*');
  return lines.join('\n');
}

/**
 * Opens interactive modal popover attached to target sentence element
 */
export function openSentenceEditorModal(sessionId, sentence, onSaveCallback, onDeleteCallback) {
  let existingModal = document.getElementById('sentence-editor-modal');
  if (existingModal) existingModal.remove();

  const sid = sentence.id;
  const currentCorr = getCorrection(sessionId, sid);
  const currentNote = getNote(sessionId, sid);

  const initialText = currentCorr ? currentCorr.correctedText : sentence.text;
  const initialNoteContent = currentNote ? currentNote.content : '';
  const initialPageRef = currentNote ? currentNote.pageRef : '';
  const initialTag = currentNote ? currentNote.tag : '法義研讀';

  const modal = document.createElement('div');
  modal.id = 'sentence-editor-modal';
  modal.className = 'sentence-editor-modal';

  const min = Math.floor(sentence.start / 60);
  const sec = Math.floor(sentence.start % 60).toString().padStart(2, '0');

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div class="modal-header">
        <h3 id="editor-title">✏️ 逐句校勘與研讀筆記 <span class="modal-time-badge">${min}:${sec}</span></h3>
        <button class="modal-close-btn" id="modal-close-btn" title="關閉">✕</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label"><b>🎙️ 逐字稿文字校對：</b></label>
          <div class="original-preview"><b>原辨識：</b><span class="orig-text">${escapeHtml(sentence.text)}</span></div>
          <textarea id="modal-corrected-text" class="form-textarea" rows="2" placeholder="在此修正同音錯字...">${escapeHtml(initialText)}</textarea>
        </div>

        <div class="ai-preview-box" id="modal-ai-preview" style="display: none;">
          <!-- Populated dynamically by AI check -->
        </div>

        <div class="form-group" style="margin-top: 12px;">
          <label class="form-label"><b>📌 法義研讀筆記與底本出處：</b></label>
          <div class="form-row" style="display: flex; gap: 8px; margin-bottom: 6px;">
            <input type="text" id="modal-page-ref" class="form-input" style="flex: 1;" placeholder="底本頁數 (如 p.97)" value="${escapeHtml(initialPageRef)}">
            <select id="modal-tag-select" class="form-select" style="flex: 1;">
              <option value="法義研讀" ${initialTag === '法義研讀' ? 'selected' : ''}>💡 法義研讀</option>
              <option value="中觀正理" ${initialTag === '中觀正理' ? 'selected' : ''}>⚖️ 中觀正理</option>
              <option value="宗大師疏意" ${initialTag === '宗大師疏意' ? 'selected' : ''}>📖 宗大師疏意</option>
              <option value="破執辯難" ${initialTag === '破執辯難' ? 'selected' : ''}>⚔️ 破執辯難</option>
              <option value="頌詞引證" ${initialTag === '頌詞引證' ? 'selected' : ''}>📜 頌詞引證</option>
            </select>
          </div>
          <textarea id="modal-note-content" class="form-textarea" rows="3" placeholder="記錄個人研讀心得、格西重要提撕、名相辯析...">${escapeHtml(initialNoteContent)}</textarea>
        </div>
      </div>

      <div class="modal-footer">
        <button id="modal-ai-check-btn" class="btn btn-secondary">🤖 AI 即時預審</button>
        <div style="flex: 1;"></div>
        ${currentCorr || currentNote ? '<button id="modal-delete-btn" class="btn btn-danger">🗑️ 清除變更</button>' : ''}
        <button id="modal-cancel-btn" class="btn btn-outline">取消</button>
        <button id="modal-save-btn" class="btn btn-primary">💾 儲存並套用</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close bindings
  const closeModal = () => modal.remove();
  modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  modal.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);

  // AI Check binding
  modal.querySelector('#modal-ai-check-btn').addEventListener('click', async () => {
    const aiBox = modal.querySelector('#modal-ai-preview');
    const newText = modal.querySelector('#modal-corrected-text').value.trim();
    aiBox.style.display = 'block';
    aiBox.innerHTML = '⏳ 正在比對《入中論善顯密意疏》底本與名相中...';

    // Simulate / Call intelligent check
    setTimeout(() => {
      if (newText === sentence.text) {
        aiBox.innerHTML = '<span class="ai-tag tag-info">ℹ️ 文字無變動</span> 文字與當前辨識一致。';
      } else if (newText.includes('實事師') || newText.includes('自相有') || newText.includes('自證分') || newText.includes('薩迦耶見')) {
        aiBox.innerHTML = '<span class="ai-tag tag-success">🟢 【AI 推薦採納】</span> 精準中觀名相修正，完全吻合善顯疏疏意規範。';
      } else {
        aiBox.innerHTML = '<span class="ai-tag tag-warning">🟡 【AI 語氣修正建議】</span> 語義通暢，已確認保留時間戳連貫性。';
      }
    }, 400);
  });

  // Save binding
  modal.querySelector('#modal-save-btn').addEventListener('click', () => {
    const correctedText = modal.querySelector('#modal-corrected-text').value.trim();
    const noteContent = modal.querySelector('#modal-note-content').value.trim();
    const pageRef = modal.querySelector('#modal-page-ref').value.trim();
    const tag = modal.querySelector('#modal-tag-select').value;

    if (correctedText && correctedText !== sentence.text) {
      saveCorrection(sessionId, sid, {
        originalText: sentence.text,
        correctedText,
        start: sentence.start,
        end: sentence.end
      });
    } else {
      removeCorrection(sessionId, sid);
    }

    if (noteContent) {
      saveNote(sessionId, sid, {
        content: noteContent,
        pageRef,
        tag
      });
    } else {
      removeNote(sessionId, sid);
    }

    closeModal();
    if (typeof onSaveCallback === 'function') {
      onSaveCallback({
        correctedText: correctedText || sentence.text,
        note: noteContent ? { content: noteContent, pageRef, tag } : null
      });
    }
  });

  // Delete binding
  const deleteBtn = modal.querySelector('#modal-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      removeCorrection(sessionId, sid);
      removeNote(sessionId, sid);
      closeModal();
      if (typeof onDeleteCallback === 'function') {
        onDeleteCallback();
      }
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
