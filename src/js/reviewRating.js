/**
 * reviewRating.js
 * 線上 1～10 分逐字稿品質審核、評分與改進回報系統
 */

const STORAGE_KEY = 'transcriptions_session_ratings_v1';

export function getStoredRatings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    return {};
  }
}

export function saveRating(sessionId, ratingData) {
  const ratings = getStoredRatings();
  ratings[sessionId] = {
    ...ratingData,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
  return ratings;
}

export function initReviewRating(getCurrentSessionCallback) {
  // Inject Dialog HTML if not already in DOM
  if (!document.getElementById('review-rating-modal')) {
    const modalHtml = `
      <div id="review-rating-modal" class="rating-modal-overlay" style="display: none;">
        <div class="rating-modal-card">
          <div class="rating-modal-header">
            <h3>📝 逐字稿線上審核與評分 (1～10 分)</h3>
            <button id="rating-modal-close" class="modal-close-btn">&times;</button>
          </div>

          <div class="rating-modal-body">
            <div class="rating-session-info" id="rating-session-info">
              <!-- Rendered dynamically -->
            </div>

            <div class="rating-section">
              <label class="rating-label">⭐ 給予本講綜合品質評分 (1 ~ 10 分)：</label>
              <div class="rating-scale-container" id="rating-scale-container">
                <!-- 1 ~ 10 score buttons -->
              </div>
              <div class="rating-hint-text" id="rating-hint-text">請點擊上方按鈕選擇 1～10 分</div>
            </div>

            <div class="rating-section">
              <label class="rating-label">🏷️ 具體問題分類（可多選）：</label>
              <div class="rating-tags-container" id="rating-tags-container">
                <span class="rating-tag" data-tag="佛學名相有誤">佛學名相有誤</span>
                <span class="rating-tag" data-tag="漏句或多句">漏句或多句</span>
                <span class="rating-tag" data-tag="時間戳未對齊">時間戳未對齊</span>
                <span class="rating-tag" data-tag="科判標題需優化">科判標題需優化</span>
                <span class="rating-tag" data-tag="口語被過度文言化">口語被過度文言化</span>
                <span class="rating-tag" data-tag="斷句不自然">斷句不自然</span>
                <span class="rating-tag" data-tag="讀誦底本有錯字">讀誦底本有錯字</span>
                <span class="rating-tag" data-tag="品質優良無問題">品質優良無問題</span>
              </div>
            </div>

            <div class="rating-section">
              <label class="rating-label">✍️ 審核意見與改進反饋（選填）：</label>
              <textarea id="rating-notes-input" class="rating-notes-input" placeholder="例如：法師讀誦第 3 頌時有字詞漏掉、第 15 句名相辨析建議調整..."></textarea>
            </div>

            <!-- Result alert box for < 8 scores -->
            <div id="rating-alert-box" class="rating-alert-box" style="display: none;"></div>
          </div>

          <div class="rating-modal-footer">
            <button id="rating-export-btn" class="btn btn-outline" title="匯出所有已評分講次紀錄">📥 匯出評分紀錄</button>
            <div style="flex: 1;"></div>
            <button id="rating-cancel-btn" class="btn btn-secondary">取消</button>
            <button id="rating-submit-btn" class="btn btn-primary">💾 儲存並提交審核</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  const modal = document.getElementById('review-rating-modal');
  const closeBtn = document.getElementById('rating-modal-close');
  const cancelBtn = document.getElementById('rating-cancel-btn');
  const submitBtn = document.getElementById('rating-submit-btn');
  const exportBtn = document.getElementById('rating-export-btn');
  const scaleContainer = document.getElementById('rating-scale-container');
  const hintText = document.getElementById('rating-hint-text');
  const tagsContainer = document.getElementById('rating-tags-container');
  const notesInput = document.getElementById('rating-notes-input');
  const sessionInfo = document.getElementById('rating-session-info');
  const alertBox = document.getElementById('rating-alert-box');

  let selectedScore = null;
  let selectedTags = new Set();
  let activeSessionId = null;

  // Render 1 ~ 10 Score Chips
  scaleContainer.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'score-chip';
    btn.dataset.score = i;
    btn.textContent = i;
    
    if (i <= 4) btn.classList.add('score-low');
    else if (i <= 7) btn.classList.add('score-mid');
    else btn.classList.add('score-high');

    btn.addEventListener('click', () => {
      selectedScore = i;
      document.querySelectorAll('.score-chip').forEach(c => c.classList.remove('selected'));
      btn.classList.add('selected');
      updateHint(i);
    });
    scaleContainer.appendChild(btn);
  }

  function updateHint(score) {
    if (score <= 4) {
      hintText.innerHTML = `<span style="color: #c62828; font-weight: 700;">❌ ${score} 分：嚴重失真 / 需全量重審校勘</span>`;
    } else if (score <= 7) {
      hintText.innerHTML = `<span style="color: #ef6c00; font-weight: 700;">⚠️ ${score} 分：低於 8 分門檻（將自動指派 Agent 啟動深度 Review 與提分方案）</span>`;
    } else {
      hintText.innerHTML = `<span style="color: #2e7d32; font-weight: 700;">🟢 ${score} 分：8 分以上（品質優良，通過驗收 APPROVED）</span>`;
    }
  }

  // Tag toggles
  tagsContainer.querySelectorAll('.rating-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const val = tag.dataset.tag;
      if (selectedTags.has(val)) {
        selectedTags.delete(val);
        tag.classList.remove('active');
      } else {
        selectedTags.add(val);
        tag.classList.add('active');
      }
    });
  });

  function openModal() {
    const session = getCurrentSessionCallback();
    if (!session) {
      alert('請先選擇並載入一個課程講次！');
      return;
    }

    activeSessionId = session.sessionId || session.id || 'current';
    const stored = getStoredRatings()[activeSessionId] || {};

    sessionInfo.innerHTML = `
      <div style="font-weight: 700; font-size: 1.1rem; color: var(--primary-color, #2c3e50);">
        📌 正在審核：${session.title || '第 ' + activeSessionId + ' 堂'}
      </div>
      <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">
        講次 ID: <b>${activeSessionId}</b> ｜ 頁碼: <b>${session.pageRange || 'p. --'}</b>
        ${stored.score ? `｜ 歷史評分：<b style="color: ${stored.score >= 8 ? '#2e7d32' : '#ef6c00'};">${stored.score} 分</b>` : ''}
      </div>
    `;

    // Restore stored values
    selectedScore = stored.score || null;
    selectedTags = new Set(stored.tags || []);
    notesInput.value = stored.notes || '';
    alertBox.style.display = 'none';

    document.querySelectorAll('.score-chip').forEach(c => {
      c.classList.toggle('selected', parseInt(c.dataset.score) === selectedScore);
    });

    tagsContainer.querySelectorAll('.rating-tag').forEach(tag => {
      tag.classList.toggle('active', selectedTags.has(tag.dataset.tag));
    });

    if (selectedScore) updateHint(selectedScore);
    else hintText.innerHTML = '請點擊上方按鈕選擇 1～10 分（8 分以上為通過）';

    modal.style.display = 'flex';
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  submitBtn.addEventListener('click', () => {
    if (!selectedScore) {
      alert('請先點選 1～10 分的評分！');
      return;
    }

    const payload = {
      sessionId: activeSessionId,
      score: selectedScore,
      status: selectedScore >= 8 ? 'APPROVED' : 'NEEDS_IMPROVEMENT',
      tags: Array.from(selectedTags),
      notes: notesInput.value.trim(),
      reviewer: 'Henry'
    };

    saveRating(activeSessionId, payload);

    if (selectedScore >= 8) {
      alert(`🎉 已成功提交評分！\n第 ${activeSessionId} 堂獲評 ${selectedScore} 分，已正式標記為「通過驗收 (APPROVED)」。`);
      closeModal();
    } else {
      // Score < 8: Provide Ticket format
      const ticketText = `【逐字稿待改善工單】\n- 講次：第 ${activeSessionId} 堂\n- 評分：${selectedScore} / 10 分（低於 8 分門檻）\n- 標籤：${payload.tags.join(', ') || '無'}\n- 審核反饋：${payload.notes || '待進一步校對'}\n- 處置：系統已指派 Agent 啟動深度 Review 與提分方案。`;

      alertBox.style.display = 'block';
      alertBox.innerHTML = `
        <div style="font-weight: 700; color: #c62828; margin-bottom: 6px;">
          ⚠️ 評分低於 8 分（${selectedScore} 分）— 改善工單已建立
        </div>
        <div style="font-size: 0.88rem; color: #444; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #ffcdd2; font-family: monospace; white-space: pre-wrap;">${ticketText}</div>
        <button id="copy-ticket-btn" class="btn btn-primary" style="margin-top: 10px; width: 100%;">📋 複製工單內容（發給 Agent 深度 Review）</button>
      `;

      document.getElementById('copy-ticket-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(ticketText).then(() => {
          alert('✅ 已複製工單內容！您可以直接貼在對話中，Agent 將立刻為您深入排查修復！');
          closeModal();
        });
      });
    }
  });

  exportBtn.addEventListener('click', () => {
    const data = getStoredRatings();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcriptions_ratings_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Attach to trigger button if present
  const headerBtn = document.getElementById('session-rating-btn');
  if (headerBtn) {
    headerBtn.addEventListener('click', openModal);
  }

  return { openModal, closeModal };
}
