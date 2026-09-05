<script setup lang="ts">
import { computed } from 'vue';

export interface TOCNodeData {
  id?: string;
  title: string;
  timestamp?: number;
  page?: number | string;
  sessionId?: string;
  sessionIds?: string[];
  children?: TOCNodeData[];
  [key: string]: any;
}

const props = defineProps<{
  tocNodes: TOCNodeData[];
  activeSessionId: string;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'seek', targetSession: string, timestamp: number): void;
}>();

const sessionNodes = computed(() => {
  const result: TOCNodeData[] = [];
  function collect(nodes: TOCNodeData[]) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      const sids = Array.isArray(n.sessionIds) && n.sessionIds.length > 0
        ? n.sessionIds
        : (n.sessionId ? [n.sessionId] : []);
      if (props.activeSessionId && sids.includes(props.activeSessionId)) {
        result.push(n);
      }
      if (n.children && n.children.length > 0) {
        collect(n.children);
      }
    }
  }
  collect(props.tocNodes);
  return result;
});

function handleSeek(node: TOCNodeData) {
  const ts = typeof node.timestamp === 'number' ? node.timestamp : 0;
  emit('seek', props.activeSessionId, ts);
  emit('close');
}

function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
</script>

<template>
  <div>
    <!-- Backdrop -->
    <div
      id="toc-sheet-backdrop"
      class="toc-sheet-backdrop"
      data-testid="toc-sheet-backdrop"
      :class="{ open: isOpen }"
      @click="emit('close')"
    ></div>

    <!-- Drawer Sheet -->
    <div
      id="toc-bottom-sheet"
      class="toc-bottom-sheet"
      data-testid="toc-bottom-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="本課科判目錄"
      :class="{ open: isOpen }"
    >
      <div class="sheet-drag-handle"></div>
      <div class="sheet-header">
        <div class="sheet-title-group">
          <div class="sheet-title">📑 本課科判目錄</div>
          <div class="sheet-subtitle">講次：{{ activeSessionId }}（共 {{ sessionNodes.length }} 個節點）</div>
        </div>
        <button
          id="sheet-close-btn"
          class="sheet-close-btn"
          aria-label="關閉科判目錄"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="sheet-body">
        <div v-if="sessionNodes.length === 0" class="sheet-empty">
          本講次尚無專屬科判節點
        </div>
        <ul v-else class="sheet-node-list">
          <li
            v-for="(node, idx) in sessionNodes"
            :key="node.id || idx"
            class="sheet-node-item"
          >
            <div class="sheet-node-info">
              <span class="sheet-node-title">{{ node.title }}</span>
              <span v-if="node.page" class="toc-page-badge">p.{{ node.page }}</span>
            </div>

            <button
              v-if="node.timestamp && node.timestamp > 0"
              type="button"
              class="sheet-timestamp-btn"
              :data-session-id="activeSessionId"
              :data-timestamp="String(node.timestamp)"
              :aria-label="'跳至 ' + formatTime(node.timestamp) + ' 播放'"
              @click="handleSeek(node)"
            >
              <span class="sheet-ts-icon">⏱️</span> {{ formatTime(node.timestamp) }}
            </button>
            <span v-else class="sheet-ts-pending">待標註</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toc-sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1060;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s ease;
  backdrop-filter: blur(2px);
}
.toc-sheet-backdrop.open {
  opacity: 1;
  visibility: visible;
}
.toc-bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--card-bg, #fdfbf7);
  border-top: 1px solid var(--border-color, #e2d9c8);
  border-radius: 16px 16px 0 0;
  z-index: 1070;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.15);
}
.toc-bottom-sheet.open {
  transform: translateY(0);
}
.sheet-drag-handle {
  width: 40px;
  height: 4px;
  background: #dcd1be;
  border-radius: 2px;
  margin: 10px auto 4px auto;
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px 14px 20px;
  border-bottom: 1px solid var(--border-color, #e2d9c8);
}
.sheet-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main, #2b2520);
}
.sheet-subtitle {
  font-size: 0.82rem;
  color: var(--text-muted, #7c7267);
  margin-top: 2px;
}
.sheet-close-btn {
  background: none;
  border: none;
  font-size: 1.25rem;
  color: var(--text-muted, #7c7267);
  cursor: pointer;
  padding: 4px 8px;
}
.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.sheet-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted, #7c7267);
}
.sheet-node-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sheet-node-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2d9c8);
  border-radius: 8px;
}
.sheet-node-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}
.sheet-node-title {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-main, #2b2520);
}
.toc-page-badge {
  background: rgba(52, 152, 219, 0.12);
  color: #1976d2;
  border: 1px solid rgba(52, 152, 219, 0.3);
  border-radius: 4px;
  padding: 0 5px;
  font-size: 0.72rem;
  font-family: monospace;
}
.sheet-timestamp-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #e8f4fd;
  color: #1976d2;
  border: 1px solid #bbdefb;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px; /* WCAG touch target */
}
.sheet-ts-pending {
  color: #999;
  font-size: 0.8rem;
  font-style: italic;
}
</style>
