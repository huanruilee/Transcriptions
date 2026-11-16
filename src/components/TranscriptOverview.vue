<template>
  <section class="transcript-overview" :class="{ 'is-collapsed': isCollapsed }" aria-labelledby="transcript-overview-title">
    <div class="transcript-overview__header" @click="toggleCollapse">
      <div class="transcript-overview__title-wrap">
        <span class="transcript-overview__eyebrow">閱讀前先掌握</span>
        <h2 id="transcript-overview-title">本講內容導讀</h2>
      </div>
      <div class="transcript-overview__header-actions">
        <span class="transcript-overview__source">
          {{ sourceLabel }}
        </span>
        <button
          type="button"
          class="transcript-overview__toggle-btn"
          :title="isCollapsed ? '展開本講導讀' : '收合本講導讀'"
          :aria-expanded="!isCollapsed"
        >
          {{ isCollapsed ? '展開 ▼' : '收合 ▲' }}
        </button>
      </div>
    </div>

    <div v-show="!isCollapsed" class="transcript-overview__grid">
      <section v-if="overview.mainPoints.length" class="transcript-overview__group">
        <h3>主要內容</h3>
        <ul>
          <li v-for="item in overview.mainPoints" :key="item">{{ item }}</li>
        </ul>
      </section>

      <section v-if="overview.discussionTopics.length" class="transcript-overview__group">
        <h3>討論議題</h3>
        <ul>
          <li v-for="item in overview.discussionTopics" :key="item">{{ item }}</li>
        </ul>
      </section>

      <section v-if="overview.referenceViews.length" class="transcript-overview__group">
        <h3>參考答案／觀點</h3>
        <ul>
          <li v-for="item in overview.referenceViews" :key="item">{{ item }}</li>
        </ul>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { TranscriptOverview } from '../composables/useTranscriptOverview';

const props = defineProps<{
  overview: TranscriptOverview;
}>();

const isCollapsed = ref(false);

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
}

const sourceLabel = computed(() => {
  if (props.overview.source === 'ai-reviewed') return 'AI 摘要・已通過引證檢查';
  if (props.overview.source === 'reviewed') return '人工整理';
  return '依既有逐字稿資料整理';
});
</script>

<style scoped>
.transcript-overview {
  margin: 18px 0 26px;
  padding: 20px;
  border: 1px solid rgba(53, 104, 89, 0.28);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(53, 104, 89, 0.09), rgba(197, 155, 39, 0.08));
  transition: all 0.2s ease;
}

.transcript-overview.is-collapsed {
  margin-bottom: 16px;
  padding: 12px 20px;
}

.transcript-overview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  cursor: pointer;
  user-select: none;
}

.transcript-overview.is-collapsed .transcript-overview__header {
  margin-bottom: 0;
}

.transcript-overview__header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.transcript-overview__toggle-btn {
  background: none;
  border: 1px solid rgba(53, 104, 89, 0.28);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.75rem;
  color: var(--primary-color, #356859);
  cursor: pointer;
  transition: all 0.15s;
}

.transcript-overview__toggle-btn:hover {
  background: rgba(53, 104, 89, 0.12);
}

.transcript-overview__eyebrow {
  display: block;
  margin-bottom: 3px;
  color: var(--text-muted);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
}

h2 {
  margin: 0;
  color: var(--primary-color);
  font-size: 1.2rem;
}

.transcript-overview__source {
  flex: 0 0 auto;
  padding: 3px 8px;
  border: 1px solid rgba(53, 104, 89, 0.24);
  border-radius: 999px;
  color: var(--text-main);
  background: var(--surface-bg);
  font-size: 0.72rem;
}

.transcript-overview__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.transcript-overview__group {
  padding: 12px 14px;
  border-radius: 9px;
  background: var(--surface-bg);
}

h3 {
  margin: 0 0 8px;
  color: var(--accent-color);
  font-size: 0.95rem;
}

ul {
  margin: 0;
  padding-left: 1.2rem;
  line-height: 1.55;
}

li + li {
  margin-top: 6px;
}

@media (max-width: 820px) {
  .transcript-overview {
    padding: 16px;
  }

  .transcript-overview__header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .transcript-overview__header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .transcript-overview__grid {
    grid-template-columns: 1fr;
  }
}
</style>
