<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  nextSessionId?: string;
  nextSessionTitle?: string;
}>();

const emit = defineEmits<{
  (e: 'next'): void;
}>();

const countdown = ref(10);
const isCancelled = ref(false);
let timer: any = null;

onMounted(() => {
  if (props.nextSessionId) {
    timer = setInterval(() => {
      if (isCancelled.value) return;
      countdown.value--;
      if (countdown.value <= 0) {
        clearInterval(timer);
        emit('next');
      }
    }, 1000);
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function cancelCountdown() {
  isCancelled.value = true;
  if (timer) clearInterval(timer);
}

function handleNextImmediate() {
  if (timer) clearInterval(timer);
  emit('next');
}
</script>

<template>
  <div v-if="nextSessionId" class="end-of-session-card">
    <div class="card-badge">🎉 本講研讀完畢</div>
    <h4 class="next-title">即將進入下一講：{{ nextSessionTitle || `第 ${nextSessionId} 講` }}</h4>

    <div v-if="!isCancelled" class="countdown-actions">
      <button
        id="next-session-countdown-btn"
        class="btn-countdown"
        @click="handleNextImmediate"
      >
        立即前往下一講 ({{ countdown }}s)
      </button>
      <button
        id="cancel-countdown-btn"
        class="btn-cancel-countdown"
        @click="cancelCountdown"
      >
        暫停自動播放
      </button>
    </div>

    <div v-else class="manual-action">
      <p class="cancelled-text">已暫停自動跳轉。</p>
      <button class="btn-countdown" @click="handleNextImmediate">
        前往下一講
      </button>
    </div>
  </div>
</template>

<style scoped>
.end-of-session-card {
  margin: 32px 0 16px;
  padding: 24px;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e2d9c8);
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}
.card-badge {
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--accent-color, #9a3412);
  background: rgba(154, 52, 18, 0.08);
  padding: 4px 12px;
  border-radius: 999px;
  margin-bottom: 12px;
}
.next-title {
  margin: 0 0 16px;
  font-size: 1.15rem;
  color: var(--text-main, #2b2520);
}
.countdown-actions, .manual-action {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
}
.btn-countdown {
  padding: 10px 20px;
  background: var(--accent-color, #9a3412);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.btn-countdown:hover {
  opacity: 0.9;
}
.btn-cancel-countdown {
  padding: 10px 16px;
  background: #eae3d2;
  border: 1px solid #dcd1be;
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
  color: var(--text-main, #2b2520);
}
.cancelled-text {
  margin: 0;
  color: var(--text-muted, #7c7267);
  font-size: 0.9rem;
}
</style>
