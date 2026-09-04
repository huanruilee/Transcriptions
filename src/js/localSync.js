/**
 * localSync.js - 1-Click Direct Sync Client to Local Active Learning Backend
 *
 * Connects the web UI to scripts/sync_server.py (http://127.0.0.1:9091).
 * Features:
 * 1. Health check & status polling (fails gracefully if offline).
 * 2. Real-time single sentence edit synchronization & active learning promotion.
 * 3. 1-Click batch synchronization from localStorage['learned_suggestions'] to local disk.
 * 4. Interactive Local Sync Hub Modal with instant feedback.
 */

export const DEFAULT_SYNC_URL = 'http://127.0.0.1:9091';

/**
 * Checks if the local sync backend is online
 */
export async function checkSyncServerStatus(serverUrl = DEFAULT_SYNC_URL, timeoutMs = 700) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${serverUrl}/api/status`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      return { online: true, data };
    }
    return { online: false, error: `HTTP ${res.status}` };
  } catch (e) {
    clearTimeout(timer);
    return { online: false, error: e.name === 'AbortError' ? '連線逾時' : '後台未啟動' };
  }
}

/**
 * Sends a single sentence correction to the local backend
 */
export async function syncCorrectionToLocalBackend(correctionData, serverUrl = DEFAULT_SYNC_URL) {
  try {
    const res = await fetch(`${serverUrl}/api/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(correctionData)
    });
    if (res.ok) {
      return await res.json();
    }
    return { success: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Sends batch correction events to the local backend
 */
export async function syncBatchToLocalBackend(events, serverUrl = DEFAULT_SYNC_URL) {
  try {
    const res = await fetch(`${serverUrl}/api/sync-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events })
    });
    if (res.ok) {
      return await res.json();
    }
    return { success: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Retrieves the count of pending suggestions in localStorage
 */
export function getPendingSuggestionsCount() {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const arr = JSON.parse(localStorage.getItem('learned_suggestions') || '[]');
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Displays a lightweight non-intrusive floating toast
 */
export function showSyncToast(message, type = 'info', durationMs = 3500) {
  let toast = document.getElementById('sync-hub-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sync-hub-toast';
    toast.className = 'sync-toast';
    document.body.appendChild(toast);
  }

  const bg = type === 'success' ? '#10b981' : type === 'warn' ? '#f59e0b' : '#2563eb';
  toast.style.backgroundColor = bg;
  toast.innerHTML = message;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
  }, durationMs);
}

/**
 * Opens the Interactive 1-Click Sync Hub Modal
 */
export async function openLocalSyncModal() {
  const existing = document.getElementById('local-sync-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'local-sync-modal';
  modal.className = 'modal-backdrop';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 540px; padding: 24px; border-radius: 12px;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color, #e2e8f0); padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 1.25rem;">
          ⚡ 1 鍵直連本機學習後台
        </h3>
        <button id="modal-sync-close-btn" style="background: none; border: none; font-size: 1.4rem; cursor: pointer; color: var(--text-secondary, #64748b);">✕</button>
      </div>

      <div class="modal-body" style="font-size: 0.92rem; line-height: 1.6;">
        <!-- Status Card -->
        <div id="sync-status-card" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 600;">本機後台狀態：</span>
            <span id="sync-status-indicator" style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #f59e0b;">
              <span class="status-dot ping"></span> 連線探測中...
            </span>
          </div>
          <div id="sync-status-details" style="font-size: 0.82rem; color: #64748b; margin-top: 6px;">
            位址: <code>${DEFAULT_SYNC_URL}</code>
          </div>
        </div>

        <!-- Pending Items Summary -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 0.8rem; color: #64748b;">瀏覽器待同步修訂</div>
            <div id="pending-count-display" style="font-size: 1.6rem; font-weight: 700; color: #2563eb; margin-top: 4px;">0</div>
          </div>
          <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 0.8rem; color: #64748b;">全庫已學習名相規則</div>
            <div id="global-terms-count-display" style="font-size: 1.6rem; font-weight: 700; color: #10b981; margin-top: 4px;">--</div>
          </div>
        </div>

        <!-- Action Result Log -->
        <div id="sync-action-log" style="display: none; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 0.84rem; color: #065f46;">
        </div>

        <!-- Help Guide if Offline -->
        <div id="sync-offline-guide" style="display: none; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 0.82rem; color: #92400e; line-height: 1.5;">
          <b>💡 如何啟動本機後台？</b><br>
          請在終端機倉庫根目錄執行：
          <pre style="background: #fef3c7; padding: 6px; border-radius: 4px; margin: 6px 0; font-family: monospace;">npm run sync-server</pre>
          啟動後即可實現網頁校正 1 鍵寫入磁碟並自動納入全庫詞典！
        </div>
      </div>

      <div class="modal-footer" style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid var(--border-color, #e2e8f0); padding-top: 14px;">
        <button id="clear-cache-btn" class="btn btn-outline" style="font-size: 0.85rem; color: #dc2626; border-color: #fca5a5;">🧹 清除已同步暫存</button>
        <button id="trigger-sync-btn" class="btn btn-primary" style="font-size: 0.85rem;" disabled>🔄 1 鍵同步至本機庫</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Bind close buttons
  const closeModal = () => modal.remove();
  modal.querySelector('#modal-sync-close-btn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  const statusIndicator = modal.querySelector('#sync-status-indicator');
  const statusDetails = modal.querySelector('#sync-status-details');
  const pendingCountDisplay = modal.querySelector('#pending-count-display');
  const globalTermsCountDisplay = modal.querySelector('#global-terms-count-display');
  const offlineGuide = modal.querySelector('#sync-offline-guide');
  const triggerBtn = modal.querySelector('#trigger-sync-btn');
  const clearBtn = modal.querySelector('#clear-cache-btn');
  const actionLog = modal.querySelector('#sync-action-log');

  // Update pending count
  const pendingCount = getPendingSuggestionsCount();
  if (pendingCountDisplay) pendingCountDisplay.textContent = String(pendingCount);

  // Probe server status
  const status = await checkSyncServerStatus();
  if (status.online) {
    statusIndicator.innerHTML = '🟢 <span style="color: #10b981;">後台在線 (Ready)</span>';
    statusDetails.innerHTML = `已連線: <code>${DEFAULT_SYNC_URL}</code> ｜ 講次庫涵蓋: <b>${status.data.totalSessions}</b> 講`;
    if (globalTermsCountDisplay) globalTermsCountDisplay.textContent = String(status.data.totalGlobalTerms || 0);
    offlineGuide.style.display = 'none';
    if (triggerBtn) {
      triggerBtn.disabled = pendingCount === 0;
      triggerBtn.textContent = pendingCount > 0 ? `🔄 1 鍵同步 (${pendingCount} 筆)` : '🔄 1 鍵同步 (已最新)';
    }
  } else {
    statusIndicator.innerHTML = '🔴 <span style="color: #ef4444;">後台未啟動 (Offline)</span>';
    statusDetails.innerHTML = `無法連線至 <code>${DEFAULT_SYNC_URL}</code> (${status.error || '離線'})`;
    offlineGuide.style.display = 'block';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = '❌ 後台未啟動';
    }
  }

  // Clear cache handler
  clearBtn?.addEventListener('click', () => {
    if (confirm('確定要清空瀏覽器中已暫存的校正建議嗎？')) {
      localStorage.removeItem('learned_suggestions');
      if (pendingCountDisplay) pendingCountDisplay.textContent = '0';
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = '🔄 1 鍵同步 (已最新)';
      }
      showSyncToast('🧹 已清除瀏覽器校對暫存！', 'info');
    }
  });

  // Trigger sync handler
  triggerBtn?.addEventListener('click', async () => {
    const raw = localStorage.getItem('learned_suggestions');
    if (!raw) return;

    let events = [];
    try {
      events = JSON.parse(raw);
    } catch {
      events = [];
    }

    if (!events.length) return;

    triggerBtn.disabled = true;
    triggerBtn.textContent = '⏳ 同步處理中...';

    const result = await syncBatchToLocalBackend(events);
    if (result.success) {
      // Clear synced items
      localStorage.removeItem('learned_suggestions');
      if (pendingCountDisplay) pendingCountDisplay.textContent = '0';

      actionLog.style.display = 'block';
      actionLog.innerHTML = `
        <b>🎉 同步成功！</b><br>
        • 共處理: <b>${result.totalEvents}</b> 筆校正<br>
        • 晉升全庫規則: <b>${result.promotedCount}</b> 條<br>
        • 語境特定隔離: <b>${result.contextSpecificCount}</b> 條<br>
        • 直接更新磁碟檔案: <b>${result.diskUpdatedCount}</b> 講
      `;

      triggerBtn.textContent = '✅ 同步完成';
      showSyncToast('🎉 成功直連本機後台，名相規則已自適應學習！', 'success');

      // Refresh server status to update term count
      const updatedStatus = await checkSyncServerStatus();
      if (updatedStatus.online && globalTermsCountDisplay) {
        globalTermsCountDisplay.textContent = String(updatedStatus.data.totalGlobalTerms || 0);
      }
    } else {
      alert(`同步失敗：${result.error || '未知錯誤'}`);
      triggerBtn.disabled = false;
      triggerBtn.textContent = '🔄 重新嘗試同步';
    }
  });
}
