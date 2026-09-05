<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAnnotationStore } from '../stores/annotation';
import { probeSyncHealth, buildSyncPayload } from '../composables/useSyncBackend';

const props = defineProps<{
  courseId: string;
  sessionId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const annotationStore = useAnnotationStore();
const port = ref(9091);
const status = ref<'checking' | 'online' | 'offline'>('checking');
const syncMessage = ref('');
const isPushing = ref(false);

async function checkHealth() {
  status.value = 'checking';
  syncMessage.value = '正在探測本機同步服務器...';
  const ok = await probeSyncHealth(port.value);
  status.value = ok ? 'online' : 'offline';
  syncMessage.value = ok ? `已連線至 http://127.0.0.1:${port.value}` : `未能連線至連接埠 ${port.value}，請確認 sync_server.py 是否已啟動。`;
}

async function pushSync() {
  if (status.value !== 'online') {
    await checkHealth();
    if (status.value !== 'online') return;
  }
  isPushing.value = true;
  syncMessage.value = '正在推送校勘與筆記...';
  try {
    const payload = buildSyncPayload(
      props.courseId,
      props.sessionId,
      annotationStore.corrections,
      annotationStore.notes
    );
    const res = await fetch(`http://127.0.0.1:${port.value}/api/corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      syncMessage.value = '✅ 推送成功！已同步至本機後台。';
    } else {
      syncMessage.value = '⚠️ 推送失敗，服務器回應異常。';
    }
  } catch (err: any) {
    syncMessage.value = `❌ 推送錯誤: ${err.message}`;
  } finally {
    isPushing.value = false;
  }
}

onMounted(() => {
  checkHealth();
});
</script>

<template>
  <div id="sync-modal" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">⚡ 本機校勘同步設定</h3>
        <button class="modal-close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="status-row">
          <span class="label">服務端狀態：</span>
          <span
            id="sync-status-indicator"
            class="status-badge"
            :class="status"
          >
            {{ status === 'online' ? '● 在線 (Port ' + port + ')' : status === 'offline' ? '○ 離線' : '⋯ 探測中' }}
          </span>
          <button class="btn-sm btn-retry" @click="checkHealth">重新探測</button>
        </div>

        <div class="port-row">
          <label for="sync-port-input">服務器連接埠 (Port)：</label>
          <input
            id="sync-port-input"
            v-model.number="port"
            type="number"
            min="1024"
            max="65535"
            class="port-input"
          />
        </div>

        <div class="info-box">
          <p><strong>待同步項目：</strong></p>
          <ul>
            <li>已校訂句子：{{ Object.keys(annotationStore.corrections).length }} 句</li>
            <li>研讀心得筆記：{{ Object.keys(annotationStore.notes).length }} 則</li>
          </ul>
          <p class="status-msg">{{ syncMessage }}</p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="emit('close')">關閉</button>
        <button
          id="sync-push-btn"
          class="btn-primary"
          :disabled="isPushing"
          @click="pushSync"
        >
          {{ isPushing ? '推送中...' : '立即推送至本機服務端' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(3px);
}
.modal-card {
  background: var(--card-bg, #fdfbf7);
  border: 1px solid var(--border-color, #e2d9c8);
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  color: var(--text-main, #2b2520);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #e2d9c8);
  background: var(--surface-bg, #fafafa);
}
.modal-title {
  margin: 0;
  font-size: 1.15rem;
  color: var(--text-main, #2b2520);
}
.modal-close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: var(--text-muted, #7c7267);
}
.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: 0.95rem;
  background: var(--card-bg, #ffffff);
}
.status-row, .port-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: bold;
  font-size: 0.85rem;
}
.status-badge.online {
  background: var(--diff-ins-bg, #dcfce7);
  color: var(--diff-ins-text, #166534);
}
.status-badge.offline {
  background: var(--diff-del-bg, #fee2e2);
  color: var(--diff-del-text, #991b1b);
}
.status-badge.checking {
  background: var(--highlight-bg, #fef3c7);
  color: var(--accent-color, #92400e);
}
.btn-sm {
  padding: 4px 8px;
  font-size: 0.8rem;
  background: var(--surface-bg, #f1ebd8);
  border: 1px solid var(--border-color, #dcd1be);
  color: var(--text-main, #2b2520);
  border-radius: 4px;
  cursor: pointer;
}
.port-input {
  width: 90px;
  padding: 4px 8px;
  border: 1px solid var(--border-color, #dcd1be);
  background: var(--input-bg, #ffffff);
  color: var(--text-main, #2b2520);
  border-radius: 4px;
}
.info-box {
  background: var(--box-bg, rgba(0, 0, 0, 0.03));
  border: 1px solid var(--box-border, rgba(0, 0, 0, 0.08));
  padding: 12px;
  border-radius: 8px;
}
.info-box ul {
  margin: 6px 0;
  padding-left: 20px;
}
.status-msg {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--accent-color, #9a3412);
}
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color, #e2d9c8);
  background: var(--surface-bg, #fafafa);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn-cancel {
  padding: 8px 16px;
  background: var(--surface-bg, #eae3d2);
  border: 1px solid var(--border-color, #dcd1be);
  color: var(--text-main, #2b2520);
  border-radius: 6px;
  cursor: pointer;
}
.btn-primary {
  padding: 8px 18px;
  background: var(--accent-color, #9a3412);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
