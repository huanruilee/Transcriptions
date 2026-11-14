<template>
  <section
    v-if="scaffolding"
    class="study-scaffolding-panel"
    data-testid="study-scaffolding-panel"
  >
    <div class="scaffolding-header">
      <div class="scaffolding-title-row">
        <span class="scaffolding-badge">🧭 五層思辨學習鷹架</span>
        <button
          type="button"
          class="scaffolding-collapse-btn"
          data-testid="scaffolding-collapse-btn"
          @click="isExpanded = !isExpanded"
        >
          {{ isExpanded ? '▾ 收合學習鷹架' : '▸ 展開學習鷹架（偈頌映射・名相・定調・比較表・自測）' }}
        </button>
      </div>

      <div class="reading-mode-toggle" role="group" aria-label="閱讀模式切換">
        <button
          type="button"
          class="mode-btn"
          :class="{ active: readingMode === 'full' }"
          data-testid="mode-full-btn"
          @click="emit('update:readingMode', 'full')"
        >
          📖 完整共學實錄
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ active: readingMode === 'essence' }"
          data-testid="mode-essence-btn"
          @click="emit('update:readingMode', 'essence')"
        >
          ☸️ 精華法師開示
        </button>
      </div>
    </div>

    <div v-if="isExpanded" class="scaffolding-body">
      <div class="scaffolding-tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          class="scaffolding-tab"
          :class="{ active: activeTab === tab.id }"
          :data-testid="`scaffolding-tab-${tab.id}`"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab 1: 偈頌映射與名相 -->
      <div v-if="activeTab === 'verses'" class="scaffolding-tab-content">
        <div v-if="scaffolding.verses?.length" class="verses-block">
          <div v-for="v in scaffolding.verses" :key="v.id" class="verse-card">
            <span class="verse-label">{{ v.label }}</span>
            <p class="verse-text">{{ v.text }}</p>
          </div>
        </div>

        <h4 v-if="scaffolding.verseMappings?.length" class="sub-heading">📌 偈頌白話映射表</h4>
        <table v-if="scaffolding.verseMappings?.length" class="scaffolding-table">
          <thead>
            <tr>
              <th>偈頌短句</th>
              <th>白話意涵</th>
              <th>對應討論</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(m, idx) in scaffolding.verseMappings" :key="idx">
              <td class="mono-phrase">{{ m.phrase }}</td>
              <td>{{ m.meaning }}</td>
              <td>
                <button
                  type="button"
                  class="seek-chip"
                  @click="emit('seek', m.time)"
                >
                  ▶ {{ formatTime(m.time) }} · {{ m.questionRef }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <h4 v-if="scaffolding.glossary?.length" class="sub-heading">📚 核心名相預備站</h4>
        <div v-if="scaffolding.glossary?.length" class="glossary-grid">
          <div v-for="(g, idx) in scaffolding.glossary" :key="idx" class="glossary-card">
            <strong>{{ g.term }}</strong>
            <p>{{ g.definition }}</p>
          </div>
        </div>
      </div>

      <!-- Tab 2: 學員觀點地圖與法師定調 -->
      <div v-if="activeTab === 'compass'" class="scaffolding-tab-content">
        <div
          v-for="group in scaffolding.compassMaps"
          :key="group.questionNum"
          class="compass-group"
        >
          <h4 class="sub-heading">{{ group.title }}</h4>
          <ul class="compass-list">
            <li v-for="(item, idx) in group.items" :key="idx" class="compass-item">
              <div class="compass-item-head">
                <span class="verdict-badge" :class="`verdict-${item.verdict}`">
                  {{ item.verdictLabel }}
                </span>
                <strong>{{ item.speaker }}</strong>
                <button
                  type="button"
                  class="seek-chip"
                  @click="emit('seek', item.time)"
                >
                  ▶ {{ formatTime(item.time) }}
                </button>
              </div>
              <p class="compass-summary">{{ item.summary }}</p>
            </li>
          </ul>
        </div>
      </div>

      <!-- Tab 3: 思辨暫停站 -->
      <div v-if="activeTab === 'pause'" class="scaffolding-tab-content">
        <div
          v-for="(box, idx) in scaffolding.pauseBoxes"
          :key="idx"
          class="pause-box"
        >
          <div class="pause-box-head">
            <span class="pause-label">⏸️ 思辨暫停站 {{ idx + 1 }}</span>
            <button
              type="button"
              class="seek-chip"
              @click="emit('seek', box.time)"
            >
              ▶ {{ formatTime(box.time) }}
            </button>
          </div>
          <blockquote class="pause-question">{{ box.question }}</blockquote>
          <p class="pause-hint">💡 {{ box.hint }}</p>
        </div>
      </div>

      <!-- Tab 4: 結構化比較表 -->
      <div v-if="activeTab === 'tables'" class="scaffolding-tab-content">
        <div
          v-for="tbl in scaffolding.comparisonTables"
          :key="tbl.id"
          class="comparison-block"
        >
          <h4 class="sub-heading">{{ tbl.title }}</h4>
          <div class="table-scroll">
            <table class="scaffolding-table">
              <thead>
                <tr>
                  <th v-for="(h, i) in tbl.headers" :key="i">{{ h }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rIdx) in tbl.rows" :key="rIdx">
                  <td v-for="(cell, cIdx) in row" :key="cIdx">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Tab 5: 課後自我檢測 -->
      <div v-if="activeTab === 'selfCheck'" class="scaffolding-tab-content">
        <details
          v-for="(item, idx) in scaffolding.selfCheck"
          :key="idx"
          class="self-check-item"
        >
          <summary>{{ item.q }}</summary>
          <p class="self-check-answer">{{ item.a }}</p>
        </details>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export interface StudyScaffolding {
  verses?: Array<{ id: string; label: string; text: string }>;
  verseMappings?: Array<{ phrase: string; meaning: string; questionRef: string; time: number }>;
  glossary?: Array<{ term: string; definition: string }>;
  compassMaps?: Array<{
    questionNum: number;
    title: string;
    items: Array<{
      speaker: string;
      time: number;
      verdict: 'ok' | 'warn' | 'err';
      verdictLabel: string;
      summary: string;
    }>;
  }>;
  pauseBoxes?: Array<{ time: number; question: string; hint: string }>;
  comparisonTables?: Array<{
    id: string;
    title: string;
    headers: string[];
    rows: string[][];
  }>;
  selfCheck?: Array<{ q: string; a: string }>;
}

defineProps<{
  scaffolding?: StudyScaffolding | null;
  readingMode: 'full' | 'essence';
}>();

const emit = defineEmits<{
  (e: 'seek', time: number): void;
  (e: 'update:readingMode', mode: 'full' | 'essence'): void;
}>();

const isExpanded = ref(true);
const activeTab = ref<'verses' | 'compass' | 'pause' | 'tables' | 'selfCheck'>('verses');

const tabs = [
  { id: 'verses', label: '偈頌映射 & 名相' },
  { id: 'compass', label: '學員觀點與定調' },
  { id: 'pause', label: '思辨暫停站' },
  { id: 'tables', label: '比較表' },
  { id: 'selfCheck', label: '課後自測' },
] as const;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
</script>

<style scoped>
.study-scaffolding-panel {
  margin: 1rem 0 1.5rem;
  border: 1px solid #d7ccc8;
  border-radius: 12px;
  background: #fdfbf7;
  padding: 1rem 1.2rem;
}

.scaffolding-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.scaffolding-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.scaffolding-badge {
  font-weight: 700;
  color: #5d4037;
  font-size: 1rem;
}

.scaffolding-collapse-btn {
  border: 1px solid #d7ccc8;
  background: #fff;
  color: #5d4037;
  border-radius: 6px;
  padding: 0.25rem 0.65rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.reading-mode-toggle {
  display: inline-flex;
  border: 1px solid #d7ccc8;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.mode-btn {
  border: none;
  background: transparent;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
  color: #5d4037;
}

.mode-btn.active {
  background: #6d4c41;
  color: #fff;
  font-weight: 600;
}

.scaffolding-body {
  margin-top: 1rem;
}

.scaffolding-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  border-bottom: 1px solid #e0d6d1;
  padding-bottom: 0.6rem;
  margin-bottom: 1rem;
}

.scaffolding-tab {
  border: 1px solid #e0d6d1;
  background: #fff;
  color: #5d4037;
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.scaffolding-tab.active {
  background: #8d6e63;
  color: #fff;
  border-color: #8d6e63;
  font-weight: 600;
}

.verse-card {
  background: #fff8e1;
  border-left: 4px solid #ffb300;
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  margin-bottom: 0.6rem;
}

.verse-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #e65100;
}

.verse-text {
  margin: 0.25rem 0 0;
  font-weight: 600;
  color: #3e2723;
}

.sub-heading {
  margin: 1rem 0 0.5rem;
  font-size: 0.95rem;
  color: #4e342e;
}

.table-scroll {
  overflow-x: auto;
}

.scaffolding-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  background: #fff;
}

.scaffolding-table th,
.scaffolding-table td {
  border: 1px solid #e0d6d1;
  padding: 0.45rem 0.65rem;
  text-align: left;
}

.scaffolding-table th {
  background: #f3ece7;
  color: #4e342e;
}

.seek-chip {
  border: 1px solid #bcaaa4;
  background: #fff;
  color: #5d4037;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.78rem;
  cursor: pointer;
}

.seek-chip:hover {
  background: #efebe9;
}

.glossary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.6rem;
}

.glossary-card {
  background: #fff;
  border: 1px solid #e0d6d1;
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  font-size: 0.86rem;
}

.glossary-card p {
  margin: 0.3rem 0 0;
  color: #4e342e;
}

.compass-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.compass-item {
  background: #fff;
  border: 1px solid #e0d6d1;
  border-radius: 8px;
  padding: 0.55rem 0.8rem;
}

.compass-item-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.verdict-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
}

.verdict-ok {
  background: #e8f5e9;
  color: #2e7d32;
}

.verdict-warn {
  background: #fff8e1;
  color: #ef6c00;
}

.verdict-err {
  background: #ffebee;
  color: #c62828;
}

.compass-summary {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  color: #3e2723;
}

.pause-box {
  background: #fff;
  border: 1px solid #ffe082;
  border-left: 4px solid #ffa000;
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  margin-bottom: 0.65rem;
}

.pause-box-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pause-label {
  font-weight: 700;
  color: #e65100;
  font-size: 0.85rem;
}

.pause-question {
  margin: 0.45rem 0;
  font-weight: 600;
  color: #3e2723;
}

.pause-hint {
  margin: 0;
  font-size: 0.84rem;
  color: #6d4c41;
}

.self-check-item {
  background: #fff;
  border: 1px solid #e0d6d1;
  border-radius: 8px;
  padding: 0.55rem 0.8rem;
  margin-bottom: 0.5rem;
}

.self-check-item summary {
  cursor: pointer;
  font-weight: 600;
  color: #4e342e;
}

.self-check-answer {
  margin: 0.45rem 0 0;
  font-size: 0.88rem;
  color: #2e7d32;
}
</style>
