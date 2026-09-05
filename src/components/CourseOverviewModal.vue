<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { filterOverviewSessions, type OverviewSessionItem } from '../composables/useCourseOverview';

const props = defineProps<{
  sessions: OverviewSessionItem[];
  currentSessionId: string;
  courseTitle: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', sessionId: string): void;
}>();

const query = ref('');
const lastSessionId = ref<string | null>(null);

onMounted(() => {
  try {
    lastSessionId.value = localStorage.getItem('last_session_id') || localStorage.getItem('transcriptions_last_session_id') || null;
  } catch (_) {}
});

const lastSession = computed(() => {
  if (!lastSessionId.value) return null;
  return props.sessions.find(s => s.session_id === lastSessionId.value) || null;
});

const filteredSessions = computed(() => {
  return filterOverviewSessions(props.sessions, query.value);
});

function handleSelect(sessionId: string) {
  emit('select', sessionId);
  emit('close');
}
</script>

<template>
  <div id="course-overview-modal" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <div class="header-left">
          <h3 class="modal-title">🗂️ 《{{ courseTitle }}》多媒體學習全景總覽</h3>
          <span class="count-badge">全套 {{ sessions.length }} 講</span>
        </div>
        <button class="modal-close-btn" @click="emit('close')">✕</button>
      </div>

      <!-- Hero Header matching V1 -->
      <div class="course-overview-hero">
        <div class="hero-desc">見悲青增格西 主講 · 音文雙向同步 · 逐字稿 + 科判目錄</div>
        <div class="hero-badges">
          <span class="hero-badge">📚 全套 {{ sessions.length }} 講</span>
          <span class="hero-badge">🎧 音文同步</span>
          <span class="hero-badge">📖 科判目錄</span>
        </div>
      </div>

      <!-- Continue Learning Card matching V1 -->
      <div v-if="lastSession" class="continue-learning-box">
        <div class="continue-text">
          ▶️ 您上次聽到：<strong>第 {{ lastSession.session_id }} 堂</strong> ({{ lastSession.date || '' }})
        </div>
        <button class="continue-btn" @click="handleSelect(lastSession.session_id)">
          繼續收聽
        </button>
      </div>

      <div class="filter-bar">
        <input
          v-model="query"
          type="search"
          class="overview-filter-input"
          placeholder="🔍 搜尋講次編號、底本頁碼或科判主題 (如: 02A, p.63, 發心)..."
        />
      </div>

      <div class="modal-body">
        <div class="overview-grid">
          <div
            v-for="s in filteredSessions"
            :key="s.session_id"
            class="overview-card"
            :class="{ active: s.session_id === currentSessionId }"
            :data-session-id="s.session_id"
            @click="handleSelect(s.session_id)"
          >
            <div class="card-top">
              <span class="session-badge">第 {{ s.session_id }} 堂</span>
              <span v-if="s.page" class="page-badge">{{ s.page }}</span>
            </div>
            <div class="card-title">{{ s.title || `第 ${s.session_id} 堂` }}</div>
            <div v-if="s.summary" class="card-summary">{{ s.summary }}</div>
            <div v-if="s.date" class="card-date">{{ s.date }}</div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <span class="tip-text">💡 點擊任意講次卡片即可立刻載入並開始研讀</span>
        <button class="btn-cancel" @click="emit('close')">← 返回閱讀器</button>
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
  width: 92%;
  max-width: 1000px;
  height: 88vh;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-color, #e2d9c8);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.modal-title {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-main, #2b2520);
}
.count-badge {
  background: var(--surface-bg, #f1ebd8);
  border: 1px solid var(--border-color, #dcd1be);
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--text-muted, #7c7267);
}
.modal-close-btn {
  background: none;
  border: none;
  font-size: 1.3rem;
  cursor: pointer;
  color: var(--text-muted, #7c7267);
}
.course-overview-hero {
  padding: 12px 24px;
  background: var(--box-bg, rgba(154, 52, 18, 0.04));
  border-bottom: 1px solid var(--border-color, #e2d9c8);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.hero-desc {
  font-size: 0.9rem;
  color: var(--text-main, #2b2520);
}
.hero-badges {
  display: flex;
  gap: 6px;
}
.hero-badge {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #dcd1be);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.78rem;
  color: var(--text-muted, #7c7267);
}
.continue-learning-box {
  margin: 10px 24px 0 24px;
  padding: 10px 16px;
  background: var(--surface-bg, #fff8f5);
  border: 1px solid var(--border-color, rgba(154, 52, 18, 0.2));
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.continue-text {
  font-size: 0.9rem;
  color: var(--text-main, #2b2520);
}
.continue-btn {
  padding: 6px 14px;
  background: var(--accent-color, #9a3412);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.filter-bar {
  padding: 10px 24px;
  border-bottom: 1px solid var(--border-color, #e2d9c8);
  background: var(--surface-bg, #faf8f5);
}
.overview-filter-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 14px;
  border: 1px solid var(--border-color, #dcd1be);
  border-radius: 8px;
  background: var(--input-bg, #ffffff);
  color: var(--text-main, #2b2520);
  font-size: 0.95rem;
  outline: none;
}
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  background: var(--bg-color, #fdfbf7);
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.overview-card {
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e5dccb);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.overview-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent-color, #9a3412);
  box-shadow: 0 4px 12px rgba(154, 52, 18, 0.1);
}
.overview-card.active {
  border-color: var(--accent-color, #9a3412);
  background: var(--surface-bg, #fff8f5);
  box-shadow: 0 0 0 2px var(--accent-color, #9a3412);
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.session-badge {
  font-weight: bold;
  font-size: 0.88rem;
  color: var(--accent-color, #9a3412);
}
.page-badge {
  font-size: 0.72rem;
  color: var(--text-muted, #7c7267);
  background: var(--surface-bg, #f4ede1);
  border: 1px solid var(--border-color, #e2d9c8);
  padding: 2px 5px;
  border-radius: 4px;
}
.card-title {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-main, #2b2520);
  line-height: 1.35;
}
.card-summary {
  font-size: 0.75rem;
  color: var(--accent-color, #9a3412);
  line-height: 1.3;
}
.card-date {
  font-size: 0.72rem;
  color: var(--text-muted, #a89f91);
  margin-top: auto;
}
.modal-footer {
  padding: 12px 24px;
  border-top: 1px solid var(--border-color, #e2d9c8);
  background: var(--surface-bg, #faf8f5);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tip-text {
  font-size: 0.85rem;
  color: var(--text-muted, #7c7267);
}
.btn-cancel {
  padding: 8px 16px;
  background: var(--surface-bg, #eae3d2);
  border: 1px solid var(--border-color, #dcd1be);
  color: var(--text-main, #2b2520);
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}
</style>
