<template>
  <section class="transcript-overview" aria-labelledby="transcript-overview-title">
    <div class="transcript-overview__header">
      <div>
        <span class="transcript-overview__eyebrow">閱讀前先掌握</span>
        <h2 id="transcript-overview-title">本講內容導讀</h2>
      </div>
      <span class="transcript-overview__source">
        {{ overview.source === 'reviewed' ? '人工整理' : '依既有逐字稿資料整理' }}
      </span>
    </div>

    <div class="transcript-overview__grid">
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
import type { TranscriptOverview } from '../composables/useTranscriptOverview';

defineProps<{
  overview: TranscriptOverview;
}>();
</script>

<style scoped>
.transcript-overview {
  margin: 18px 0 26px;
  padding: 20px;
  border: 1px solid rgba(53, 104, 89, 0.28);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(53, 104, 89, 0.09), rgba(197, 155, 39, 0.08));
}

.transcript-overview__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
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
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.5);
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
    gap: 8px;
  }

  .transcript-overview__grid {
    grid-template-columns: 1fr;
  }
}
</style>
