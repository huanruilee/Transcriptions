<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  isOpen: boolean;
  studyGuideUrl: string;
  sessionTitle?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const hasStudyGuide = computed(() => Boolean(props.studyGuideUrl));
</script>

<template>
  <aside
    class="study-guide-drawer"
    :class="{ open: isOpen && hasStudyGuide }"
    aria-label="研讀講記抽屜"
    data-testid="study-guide-drawer"
  >
    <div class="drawer-header">
      <div class="drawer-title-group">
        <span class="drawer-badge">📚 研讀講記</span>
        <h3 class="drawer-title">{{ sessionTitle || '研讀指南與逐字原話對照' }}</h3>
      </div>
      <div class="drawer-actions">
        <a
          v-if="studyGuideUrl"
          :href="studyGuideUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="external-link-btn"
          title="在新分頁開啟完整研讀講記"
        >
          ↗ 新分頁
        </a>
        <button
          type="button"
          class="close-btn"
          aria-label="關閉研讀講記抽屜"
          data-testid="close-study-guide-drawer"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="drawer-content">
      <iframe
        v-if="studyGuideUrl"
        :src="studyGuideUrl"
        class="study-guide-iframe"
        title="研讀講記全文內容"
        data-testid="study-guide-iframe"
      />
      <div v-else class="drawer-empty-state">
        <p>本講次尚未發布獨立研讀講記。</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.study-guide-drawer {
  position: fixed;
  top: 0;
  right: -560px;
  width: 540px;
  max-width: 90vw;
  height: 100vh;
  background: var(--card-bg, #ffffff);
  border-left: 1px solid var(--border-color, #e5e7eb);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  z-index: 1050;
  display: flex;
  flex-direction: column;
  transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.study-guide-drawer.open {
  right: 0;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-secondary, #fafaf9);
}

.drawer-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.drawer-badge {
  font-size: 0.82rem;
  font-weight: 700;
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.drawer-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drawer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.external-link-btn {
  font-size: 0.85rem;
  color: #4b5563;
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  transition: all 0.2s;
}

.external-link-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  color: #6b7280;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}

.close-btn:hover {
  background: #e5e7eb;
  color: #111827;
}

.drawer-content {
  flex: 1;
  width: 100%;
  height: calc(100% - 60px);
  overflow: hidden;
  position: relative;
}

.study-guide-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.drawer-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b7280;
  font-size: 0.95rem;
}

@media (max-width: 768px) {
  .study-guide-drawer {
    width: 100vw;
    max-width: 100vw;
    right: -100vw;
  }
}
</style>
