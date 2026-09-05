<script setup lang="ts">
defineProps<{
  x: number;
  y: number;
  sentenceText: string;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'play'): void;
  (e: 'copy'): void;
  (e: 'close'): void;
}>();
</script>

<template>
  <div class="touch-menu-backdrop" @click="emit('close')">
    <div
      class="touch-context-menu"
      :style="{ left: `${x}px`, top: `${y}px` }"
      @click.stop
    >
      <button class="menu-item" @click="emit('play')">
        <span class="icon">▶️</span> 播放此句
      </button>
      <button class="menu-item" @click="emit('edit')">
        <span class="icon">✏️</span> 校勘修訂
      </button>
      <button class="menu-item" @click="emit('copy')">
        <span class="icon">📋</span> 複製文字
      </button>
    </div>
  </div>
</template>

<style scoped>
.touch-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
}
.touch-context-menu {
  position: absolute;
  transform: translate(-50%, -100%);
  background: #ffffff;
  border: 1px solid var(--border-color, #e2d9c8);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  overflow: hidden;
  z-index: 1000;
}
.menu-item {
  padding: 8px 12px;
  background: transparent;
  border: none;
  font-size: 0.85rem;
  color: var(--text-main, #2b2520);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.menu-item:not(:last-child) {
  border-right: 1px solid var(--border-color, #e2d9c8);
}
.menu-item:hover, .menu-item:active {
  background: rgba(154, 52, 18, 0.08);
}
.icon {
  font-size: 0.9rem;
}
</style>
