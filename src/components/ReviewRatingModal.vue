<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';

const props = defineProps<{
  courseId: string;
  sessionId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const STORAGE_KEY = 'transcriptions_session_ratings_v1';

const availableTags = [
  '佛學名相有誤',
  '漏句或多句',
  '時間戳未對齊',
  '科判標題需優化',
  '口語被過度文言化',
  '斷句不自然',
  '讀誦底本有錯字',
  '品質優良無問題',
];

const selectedScore = ref<number | null>(null);
const selectedTags = ref<string[]>([]);
const comment = ref('');
const submitSuccess = ref(false);
const ticketText = ref('');
const showTicketAlert = ref(false);

const hintText = computed(() => {
  if (!selectedScore.value) return '請點擊上方按鈕選擇 1～10 分（8 分以上為通過）';
  const s = selectedScore.value;
  if (s <= 4) {
    return `❌ ${s} 分：嚴重失真 / 需全量重審校勘`;
  } else if (s <= 7) {
    return `⚠️ ${s} 分：低於 8 分門檻（將自動指派 Agent 啟動深度 Review 與提分方案）`;
  } else {
    return `🟢 ${s} 分：8 分以上（品質優良，通過驗收 APPROVED）`;
  }
});

onMounted(() => {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const existing = all[props.sessionId];
    if (existing) {
      selectedScore.value = existing.score ?? null;
      selectedTags.value = existing.tags ?? [];
      comment.value = existing.notes ?? '';
    }
  } catch (_) {}
});

function handleScoreSelect(s: number) {
  selectedScore.value = s;
}

function handleTagToggle(t: string) {
  const idx = selectedTags.value.indexOf(t);
  if (idx >= 0) {
    selectedTags.value.splice(idx, 1);
  } else {
    selectedTags.value.push(t);
  }
}

function handleSubmit() {
  if (!selectedScore.value) {
    alert('請先點選 1～10 分的評分！');
    return;
  }

  const payload = {
    sessionId: props.sessionId,
    score: selectedScore.value,
    status: selectedScore.value >= 8 ? 'APPROVED' : 'NEEDS_IMPROVEMENT',
    tags: selectedTags.value,
    notes: comment.value.trim(),
    reviewer: 'Henry',
    updatedAt: new Date().toISOString(),
  };

  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[props.sessionId] = payload;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (_) {}

  if (selectedScore.value >= 8) {
    submitSuccess.value = true;
    setTimeout(() => {
      submitSuccess.value = false;
      emit('close');
    }, 900);
  } else {
    showTicketAlert.value = true;
    ticketText.value = `【逐字稿待改善工單】\n- 講次：第 ${props.sessionId} 堂\n- 評分：${selectedScore.value} / 10 分（低於 8 分門檻）\n- 標籤：${payload.tags.join(', ') || '無'}\n- 審核反饋：${payload.notes || '待進一步校對'}\n- 處置：系統已指派 Agent 啟動深度 Review 與提分方案。`;
  }
}

function copyTicket() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(ticketText.value).then(() => {
      alert('✅ 已複製工單內容！可以直接貼在對話中！');
      emit('close');
    });
  }
}

function exportAllRatings() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcriptions_ratings_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (_) {}
}
</script>

<template>
  <div id="review-rating-modal" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">📝 逐字稿線上審核與評分 (1～10 分)</h3>
        <button id="rating-modal-close" class="modal-close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <div class="session-info">
          <div class="session-title">📌 正在審核：第 {{ sessionId }} 堂</div>
          <div class="session-meta">講次 ID: <b>{{ sessionId }}</b> ｜ 8 分以上為通過門檻</div>
        </div>

        <div class="rating-section">
          <label class="rating-label">⭐ 給予本講綜合品質評分 (1 ~ 10 分)：</label>
          <div class="scale-chips">
            <button
              v-for="s in 10"
              :key="s"
              type="button"
              class="score-chip"
              :class="{
                selected: selectedScore === s,
                'score-low': s <= 4,
                'score-mid': s > 4 && s <= 7,
                'score-high': s > 7
              }"
              @click="handleScoreSelect(s)"
            >
              {{ s }}
            </button>
          </div>
          <div class="rating-hint" :class="{ 'text-warn': selectedScore && selectedScore < 8, 'text-success': selectedScore && selectedScore >= 8 }">
            {{ hintText }}
          </div>
        </div>

        <div class="rating-section">
          <label class="rating-label">🏷️ 具體問題分類（可多選）：</label>
          <div class="tags-container">
            <span
              v-for="t in availableTags"
              :key="t"
              class="rating-tag"
              :class="{ active: selectedTags.includes(t) }"
              @click="handleTagToggle(t)"
            >
              {{ t }}
            </span>
          </div>
        </div>

        <div class="rating-section">
          <label class="rating-label">✍️ 審核意見與改進反饋（選填）：</label>
          <textarea
            id="rating-notes-input"
            v-model="comment"
            class="rating-textarea"
            placeholder="例如：法師讀誦第 3 頌時有字詞漏掉、第 15 句名相辨析建議調整..."
          ></textarea>
        </div>

        <!-- Alert box for < 8 scores -->
        <div v-if="showTicketAlert" class="rating-alert-box">
          <div class="alert-title">⚠️ 評分低於 8 分（{{ selectedScore }} 分）— 改善工單已建立</div>
          <pre class="ticket-pre">{{ ticketText }}</pre>
          <button id="copy-ticket-btn" class="btn-primary copy-btn" @click="copyTicket">
            📋 複製工單內容（發給 Agent 深度 Review）
          </button>
        </div>

        <div v-if="submitSuccess" class="success-notice">
          🎉 評分已成功提交！本講獲評 {{ selectedScore }} 分，已正式標記為「通過驗收 (APPROVED)」。
        </div>
      </div>

      <div class="modal-footer">
        <button id="rating-export-btn" class="btn-outline" @click="exportAllRatings">
          📥 匯出評分紀錄
        </button>
        <div style="flex: 1;"></div>
        <button id="rating-cancel-btn" class="btn-cancel" @click="emit('close')">取消</button>
        <button id="rating-submit-btn" class="btn-primary" @click="handleSubmit">
          💾 儲存並提交審核
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
  background: var(--bg-color, #fdfbf7);
  border: 1px solid var(--border-color, #e2d9c8);
  border-radius: 12px;
  width: 90%;
  max-width: 540px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #e2d9c8);
}
.modal-title {
  margin: 0;
  font-size: 1.15rem;
  color: var(--text-main, #2b2520);
}
.modal-close-btn {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--text-muted, #7c7267);
}
.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 75vh;
  overflow-y: auto;
}
.session-info {
  background: rgba(0, 0, 0, 0.03);
  padding: 10px 12px;
  border-radius: 6px;
}
.session-title {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--primary-color, #2b2520);
}
.session-meta {
  font-size: 0.85rem;
  color: #7c7267;
  margin-top: 4px;
}
.rating-label {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 6px;
  display: block;
  color: var(--text-main, #2b2520);
}
.scale-chips {
  display: flex;
  gap: 6px;
}
.score-chip {
  flex: 1;
  padding: 8px 0;
  background: #f1ebd8;
  border: 1px solid #dcd1be;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.95rem;
  transition: all 0.15s ease;
}
.score-chip.selected {
  background: var(--accent-color, #9a3412);
  color: white;
  border-color: var(--accent-color, #9a3412);
  transform: scale(1.05);
}
.rating-hint {
  font-size: 0.85rem;
  margin-top: 6px;
  color: #7c7267;
}
.rating-hint.text-warn {
  color: #c62828;
  font-weight: 600;
}
.rating-hint.text-success {
  color: #2e7d32;
  font-weight: 600;
}
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rating-tag {
  display: inline-block;
  padding: 4px 10px;
  background: #f4ede1;
  border: 1px solid #dcd1be;
  border-radius: 16px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.rating-tag.active {
  background: var(--accent-color, #9a3412);
  color: white;
  border-color: var(--accent-color, #9a3412);
}
.rating-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid #dcd1be;
  border-radius: 6px;
  background: #ffffff;
  font-family: inherit;
  font-size: 0.9rem;
  min-height: 70px;
  resize: vertical;
}
.rating-alert-box {
  background: #fff5f5;
  border: 1px solid #ffcdd2;
  border-radius: 8px;
  padding: 12px;
}
.alert-title {
  font-weight: 700;
  color: #c62828;
  margin-bottom: 6px;
}
.ticket-pre {
  background: white;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #ffcdd2;
  font-family: monospace;
  font-size: 0.82rem;
  white-space: pre-wrap;
  margin: 0;
}
.copy-btn {
  margin-top: 10px;
  width: 100%;
}
.success-notice {
  background: #dcfce7;
  color: #166534;
  padding: 10px;
  border-radius: 6px;
  text-align: center;
  font-weight: 600;
}
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color, #e2d9c8);
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn-outline {
  padding: 8px 14px;
  background: none;
  border: 1px solid #dcd1be;
  border-radius: 6px;
  cursor: pointer;
}
.btn-cancel {
  padding: 8px 16px;
  background: #eae3d2;
  border: 1px solid #dcd1be;
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
</style>
