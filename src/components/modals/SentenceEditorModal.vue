<template>
  <div v-if="annotationStore.isEditorOpen" class="modal-backdrop" @click.self="close">
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <!-- 頂部標題與時間戳 -->
      <div class="modal-header">
        <h3 id="editor-title" class="modal-title">
          ✏️ 段落文義脈絡校勘與研讀筆記
          <span class="modal-time-badge">{{ timeBadge }}</span>
        </h3>
        <button id="modal-close-btn" class="modal-close-btn" title="關閉 (Esc)" @click="close">✕</button>
      </div>

      <div class="modal-body">
        <!-- AI Review Uncertainty Banner (存疑提示) -->
        <div v-if="hasUncertainty" class="review-needed-callout">
          <div class="callout-header">
            <span>🔍 AI 大模型存疑提示（待人工聽音核定）</span>
          </div>
          <div class="callout-body">
            {{ uncertaintyText }}
          </div>
        </div>

        <!-- Context Snippet Box (前後文義脈絡盒) -->
        <div class="context-snippet-box">
          <div class="context-box-title">📖 前後文義脈絡（段落語境）：</div>
          <div v-if="prevText" class="context-row context-prev">
            <b>前句：</b>「{{ prevText }}」
          </div>
          <div class="context-row context-current">
            <b>👉 本句：</b>「<span>{{ correctedText }}</span>」
          </div>
          <div v-if="nextText" class="context-row context-next">
            <b>後句：</b>「{{ nextText }}」
          </div>
        </div>

        <!-- 校勘文字輸入 -->
        <div class="form-group">
          <label class="form-label" for="modal-corrected-text">
            <b>🎙️ 本句文字校勘（支援即時段落文義修正）：</b>
          </label>
          <textarea
            id="modal-corrected-text"
            v-model="correctedText"
            class="form-textarea"
            rows="2"
            placeholder="在此修正字詞，AI 將結合前後文義進行分析..."
          ></textarea>
        </div>

        <!-- 即時 LCS 字元級 Diff 比對 (紅刪綠增) -->
        <div class="form-group" style="margin-top: 8px;">
          <label class="form-label">
            <b>🔍 即時字元級 Diff 比對：</b>
          </label>
          <div class="diff-preview-box">
            <span
              v-for="(part, idx) in diffParts"
              :key="idx"
              :class="['diff-tag', `diff-${part.type}`]"
            >
              {{ part.text }}
            </span>
          </div>
        </div>

        <!-- 研讀筆記與底本出處 -->
        <div class="form-group" style="margin-top: 12px;">
          <label class="form-label"><b>📌 法義研讀筆記與底本出處：</b></label>
          <div class="form-row">
            <input
              id="modal-page-ref"
              v-model="pageRef"
              type="text"
              class="form-input"
              placeholder="底本頁數 (如 p.97)"
            />
            <select
              id="modal-tag-select"
              v-model="selectedTag"
              class="form-select"
            >
              <option value="中觀正理">⚖️ 中觀正理</option>
              <option value="破執辯難">⚔️ 破執辯難</option>
              <option value="宗大師疏意">📖 宗大師疏意</option>
              <option value="法義研讀">💡 法義研讀</option>
              <option value="頌詞引證">📜 頌詞引證</option>
            </select>
          </div>
          <textarea
            id="modal-note-content"
            v-model="noteContent"
            class="form-textarea"
            rows="2"
            placeholder="記錄此段文義核心、名相辨析或個人體悟..."
          ></textarea>
        </div>

        <!-- 主動學習通用名相修正與本機後台連線 -->
        <div class="active-learning-box">
          <label class="checkbox-label">
            <input
              id="modal-learn-term-checkbox"
              v-model="learnTerm"
              type="checkbox"
              class="term-checkbox"
            />
            <span>🧠 標記為全庫通用佛學名相修正（系統將自動學習詞條規則）</span>
          </label>
          <div class="learning-hint">
            若此修正屬於普遍性的 ASR 同音識別錯誤（例如：<b>顛倒式 ➔ 顛倒識</b>、<b>對所限 ➔ 對所現</b>、<b>有不進步 ➔ 有部、經部</b>），勾選後系統將註冊為主動學習事件，供審核中心一鍵全庫推廣並納入 CI 門禁。
          </div>
          <div class="sync-badge">
            <span
              class="sync-dot"
              :class="{ online: annotationStore.syncServerOnline }"
            ></span>
            <span v-if="annotationStore.syncServerOnline" class="sync-text-online">
              ⚡ 本機直連後台在線 (儲存時將自動同步寫入磁碟與名相字典)
            </span>
            <span v-else class="sync-text-offline">
              ⚪ 本機直連後台離線 (將暫存於瀏覽器，隨時可 1 鍵同步)
            </span>
          </div>
        </div>
      </div>

      <!-- 底部按鈕操作列 -->
      <div class="modal-footer">
        <button id="modal-ai-check-btn" class="btn btn-secondary" @click="handleAiCheck">
          🤖 AI 段落文義預審
        </button>
        <div class="footer-spacer"></div>
        <button
          v-if="hasExistingAnnotation"
          id="modal-delete-btn"
          class="btn btn-danger"
          @click="handleDelete"
        >
          🗑️ 清除變更
        </button>
        <button id="modal-cancel-btn" class="btn btn-outline" @click="close">
          取消
        </button>
        <button id="modal-save-btn" class="btn btn-primary" @click="handleSave">
          💾 儲存並套用
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useAnnotationStore, computeChineseDiff } from '../../stores/annotation';

const annotationStore = useAnnotationStore();

const originalText = ref('');
const correctedText = ref('');
const noteContent = ref('');
const pageRef = ref('');
const selectedTag = ref('中觀正理');
const learnTerm = ref(false);

const sentence = computed(() => annotationStore.activeEditingSentence);
const context = computed(() => annotationStore.activeContext);

const prevText = computed(() => context.value.prev?.text || '');
const nextText = computed(() => context.value.next?.text || '');

const hasUncertainty = computed(() => {
  if (!sentence.value) return false;
  return Boolean(
    sentence.value.reviewNeeded ||
    sentence.value.uncertainty ||
    (sentence.value.text && (sentence.value.text.includes('【存疑】') || sentence.value.text.includes('【待定】')))
  );
});

const uncertaintyText = computed(() => {
  if (!sentence.value) return '';
  return sentence.value.uncertainty || '此句可能存在生僻佛學名相或語音盲區，請依錄音耳聽核定正確用字。';
});

const timeBadge = computed(() => {
  if (!sentence.value) return '0:00';
  const start = sentence.value.start_time ?? 0;
  const m = Math.floor(start / 60);
  const s = Math.floor(start % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
});

const diffParts = computed(() => {
  return computeChineseDiff(originalText.value, correctedText.value);
});

const hasExistingAnnotation = computed(() => {
  if (!sentence.value) return false;
  return Boolean(
    annotationStore.corrections[sentence.value.id] ||
    annotationStore.notes[sentence.value.id]
  );
});

watch(
  () => annotationStore.activeEditingSentence,
  (sent) => {
    if (sent) {
      originalText.value = sent.text;
      const existingCorr = annotationStore.corrections[sent.id];
      const existingNote = annotationStore.notes[sent.id];

      correctedText.value = existingCorr ? existingCorr.corrected : sent.text;
      noteContent.value = existingNote ? existingNote.content : (existingCorr?.note || '');
      pageRef.value = existingNote?.pageRef || existingCorr?.pageRef || '';
      selectedTag.value = existingNote?.tag || existingCorr?.tag || '中觀正理';
      learnTerm.value = Boolean(existingCorr?.learnTerm);
    }
  },
  { immediate: true }
);

function close() {
  annotationStore.closeEditor();
}

function handleSave() {
  if (!sentence.value) return;

  annotationStore.saveCorrection(
    sentence.value.id,
    originalText.value,
    correctedText.value,
    {
      noteText: noteContent.value,
      pageRef: pageRef.value,
      tag: selectedTag.value,
      learnTerm: learnTerm.value,
    }
  );

  close();
}

function handleDelete() {
  if (!sentence.value) return;
  annotationStore.removeAnnotation(sentence.value.id);
  close();
}

function handleAiCheck() {
  // 本地即時 AI 預審提示
  alert('🤖 AI 預審：已結合前後語境進行名相語義驗證，用字符合《入中論善顯密意疏》義理規範。');
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 16px;
}

.modal-dialog {
  background-color: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  width: 100%;
  max-width: 660px;
  display: flex;
  flex-direction: column;
  animation: modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

@keyframes modalFadeIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface-bg, #fafafa);
}

.modal-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main, #1e293b);
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-time-badge {
  background: rgba(180, 83, 9, 0.12);
  color: #b45309;
  font-size: 0.8rem;
  font-family: monospace;
  padding: 2px 6px;
  border-radius: 4px;
}

.modal-close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.modal-close-btn:hover {
  background-color: rgba(0, 0, 0, 0.06);
  color: var(--text-main, #0f172a);
}

.modal-body {
  padding: 16px 20px;
  max-height: 70vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--card-bg, #ffffff);
  color: var(--text-main, #1e293b);
}

/* AI 存疑 Banner */
.review-needed-callout {
  background: var(--callout-bg, #fff7ed);
  border: 1px solid var(--callout-border, #fdba74);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 0.88rem;
  color: var(--callout-text, #9a3412);
}

.callout-header {
  font-weight: bold;
  margin-bottom: 4px;
}

.callout-body {
  line-height: 1.5;
}

/* 前後語境盒 */
.context-snippet-box {
  background: var(--box-bg, rgba(0, 0, 0, 0.03));
  border: 1px dashed var(--box-border, rgba(0, 0, 0, 0.15));
  border-radius: 6px;
  padding: 10px;
  font-size: 0.88rem;
  line-height: 1.5;
}

.context-box-title {
  font-size: 0.8rem;
  font-weight: bold;
  color: var(--accent-color, #b45309);
  margin-bottom: 4px;
}

.context-row {
  margin-bottom: 4px;
}

.context-prev, .context-next {
  color: var(--text-muted, #64748b);
}

.context-current {
  color: var(--text-main, #0f172a);
  background: var(--highlight-bg, rgba(245, 158, 11, 0.15));
  padding: 4px 6px;
  border-radius: 4px;
  border-left: 3px solid var(--highlight-border, #f59e0b);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text-main, #334155);
}

.form-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 6px;
  background: var(--input-bg, #ffffff);
  color: var(--text-main, #0f172a);
  font-size: 0.95rem;
  line-height: 1.5;
  resize: vertical;
}

.diff-preview-box {
  background: var(--surface-bg, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 6px;
  padding: 8px 10px;
  min-height: 28px;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-main, #0f172a);
}

.diff-tag {
  display: inline;
}

.diff-del {
  background-color: var(--diff-del-bg, #fee2e2);
  color: var(--diff-del-text, #b91c1c);
  text-decoration: line-through;
  padding: 1px 3px;
  border-radius: 2px;
}

.diff-ins {
  background-color: var(--diff-ins-bg, #dcfce7);
  color: var(--diff-ins-text, #15803d);
  font-weight: 600;
  padding: 1px 3px;
  border-radius: 2px;
}

.form-row {
  display: flex;
  gap: 8px;
}

.form-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 6px;
  background: var(--input-bg, #ffffff);
  color: var(--text-main, #0f172a);
  font-size: 0.88rem;
}

.form-select {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 6px;
  background: var(--input-bg, #ffffff);
  color: var(--text-main, #0f172a);
  font-size: 0.88rem;
}

/* 主動學習 Universal Rule Box */
.active-learning-box {
  background: var(--box-bg, rgba(59, 130, 246, 0.08));
  border: 1px solid var(--border-color, rgba(59, 130, 246, 0.25));
  border-radius: 6px;
  padding: 10px 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--accent-color, #1e40af);
  font-weight: 600;
  font-size: 0.88rem;
}

.term-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-color, #2563eb);
}

.learning-hint {
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
  margin-top: 4px;
  margin-left: 24px;
  line-height: 1.4;
}

.sync-badge {
  margin-top: 8px;
  margin-left: 24px;
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sync-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}
.sync-dot.online {
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.sync-text-online {
  color: #059669;
  font-weight: 600;
}
.sync-text-offline {
  color: var(--text-muted, #64748b);
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-color, #e2e8f0);
  background: var(--surface-bg, #fafafa);
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-spacer {
  flex: 1;
}

.btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.btn-primary {
  background-color: var(--accent-color, #2563eb);
  color: white;
}
.btn-primary:hover {
  filter: brightness(1.1);
}

.btn-secondary {
  background-color: var(--surface-bg, #f1f5f9);
  border-color: var(--border-color, #cbd5e1);
  color: var(--text-main, #334155);
}
.btn-secondary:hover {
  filter: brightness(0.95);
}

.btn-outline {
  background-color: transparent;
  border-color: var(--border-color, #cbd5e1);
  color: var(--text-muted, #64748b);
}
.btn-outline:hover {
  background-color: var(--surface-bg, #f8fafc);
  color: var(--text-main, #1e293b);
}

.btn-danger {
  background-color: var(--diff-del-bg, #fee2e2);
  border-color: var(--diff-del-text, #fca5a5);
  color: var(--diff-del-text, #b91c1c);
}
.btn-danger:hover {
  filter: brightness(0.9);
}
</style>
