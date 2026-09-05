<script setup lang="ts">
import { ref, computed } from 'vue';

export interface TOCNodeData {
  id?: string;
  title: string;
  timestamp?: number;
  start_time?: number;
  end_time?: number;
  page?: number | string;
  sessionId?: string;
  sessionIds?: string[];
  children?: TOCNodeData[];
  [key: string]: any;
}

const props = defineProps<{
  tocNodes: TOCNodeData[];
  activeSessionId: string;
  currentTime?: number;
}>();

const emit = defineEmits<{
  (e: 'seek', targetSession: string, timestamp: number): void;
}>();

const isOpen = ref(false);
const currentScope = ref<'course' | 'book'>('course');

// Popover state
const popoverState = ref<{
  visible: boolean;
  sessions: string[];
  anchorX: number;
  anchorY: number;
} | null>(null);

function toggleOpen() {
  isOpen.value = !isOpen.value;
}

function handleNodeClick(node: TOCNodeData, e: MouseEvent) {
  e.preventDefault();
  const targetSession = node.sessionId || props.activeSessionId;
  const ts = typeof node.timestamp === 'number' ? node.timestamp : (node.start_time ?? 0);
  isOpen.value = false;
  emit('seek', targetSession, ts);
}

function handleSessionBadgeClick(sid: string, e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
  window.location.hash = `#session-${sid}`;
}

function openPopover(sessions: string[], e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  popoverState.value = {
    visible: true,
    sessions,
    anchorX: Math.max(8, rect.left + window.scrollX - 10),
    anchorY: rect.bottom + window.scrollY + 4,
  };
}

function closePopover() {
  popoverState.value = null;
}

function selectPopoverSession(sid: string) {
  closePopover();
  window.location.hash = `#session-${sid}`;
}

function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function nodeContainsSession(node: TOCNodeData, targetSession: string): boolean {
  if (node.sessionId === targetSession) return true;
  if (Array.isArray(node.sessionIds) && node.sessionIds.includes(targetSession)) return true;
  if (node.children && node.children.length > 0) {
    return node.children.some(c => nodeContainsSession(c, targetSession));
  }
  return false;
}

function getNodeSessions(node: TOCNodeData): string[] {
  if (Array.isArray(node.sessionIds) && node.sessionIds.length > 0) {
    return node.sessionIds;
  }
  if (node.sessionId) {
    return [node.sessionId];
  }
  return [];
}
</script>

<template>
  <div id="toc-container" class="toc-container-wrapper">
    <details id="toc-accordion-root" class="toc-accordion" :open="isOpen">
      <summary @click.prevent="toggleOpen">
        📑 科判章節目錄 (點擊即刻跳轉播放)
      </summary>

      <div class="toc-scope-toggle">
        <button
          type="button"
          class="toc-scope-btn"
          :class="{ active: currentScope === 'course' }"
          data-scope="course"
          data-testid="toc-scope-course"
          @click="currentScope = 'course'"
        >
          本課科判
        </button>
        <button
          type="button"
          class="toc-scope-btn"
          :class="{ active: currentScope === 'book' }"
          data-scope="book"
          data-testid="toc-scope-book"
          @click="currentScope = 'book'"
        >
          全書總科判
        </button>
      </div>

      <ul id="toc-tree-root" class="toc-tree">
        <!-- 遞迴渲染節點 -->
        <template v-for="(node, idx) in tocNodes" :key="node.id || idx">
          <!-- Course scope: 如果不是本講，但子孫有本講，渲染為折疊祖先 toc-ancestor -->
          <li
            v-if="currentScope === 'course' && !getNodeSessions(node).includes(activeSessionId) && nodeContainsSession(node, activeSessionId)"
          >
            <details class="toc-sub" open>
              <summary class="toc-ancestor">{{ node.title }}</summary>
              <ul class="toc-tree">
                <template v-for="(c1, c1Idx) in node.children" :key="c1.id || c1Idx">
                  <li v-if="currentScope === 'course' && !getNodeSessions(c1).includes(activeSessionId) && nodeContainsSession(c1, activeSessionId)">
                    <details class="toc-sub" open>
                      <summary class="toc-ancestor">{{ c1.title }}</summary>
                      <ul class="toc-tree">
                        <template v-for="(c2, c2Idx) in c1.children" :key="c2.id || c2Idx">
                          <li v-if="getNodeSessions(c2).includes(activeSessionId)">
                            <a
                              class="toc-link"
                              :class="{
                                active: getNodeSessions(c2).includes(activeSessionId),
                                'toc-timestamp-pending': !c2.timestamp || c2.timestamp === 0
                              }"
                              :href="'#session-' + activeSessionId + (c2.timestamp ? '-t' + c2.timestamp : '')"
                              :data-session-id="c2.sessionId || activeSessionId"
                              :data-timestamp="String(c2.timestamp || 0)"
                              :data-testid="'toc-node-' + c2.title.substring(0, 8).replace(/\s/g, '')"
                              @click="handleNodeClick(c2, $event)"
                            >
                              {{ c2.title }}
                              <span
                                v-for="sid in (getNodeSessions(c2).includes(activeSessionId) ? [activeSessionId] : [getNodeSessions(c2)[0]])"
                                :key="sid"
                                class="toc-session-badge"
                                :class="{ active: sid === activeSessionId }"
                                @click="handleSessionBadgeClick(sid, $event)"
                              >
                                {{ sid }}
                              </span>
                              <button
                                v-if="getNodeSessions(c2).filter(s => s !== activeSessionId).length > 0"
                                type="button"
                                class="toc-badge-collapsed"
                                data-testid="toc-badge-collapsed"
                                @click="openPopover(getNodeSessions(c2), $event)"
                              >
                                +{{ getNodeSessions(c2).filter(s => s !== activeSessionId).length }} 講 ▾
                              </button>
                              <span v-if="c2.page" class="toc-page-badge">p.{{ c2.page }}</span>
                              <span v-if="c2.timestamp && c2.timestamp > 0" class="toc-timestamp-badge">
                                {{ formatTime(c2.timestamp) }}
                              </span>
                            </a>
                          </li>
                        </template>
                      </ul>
                    </details>
                  </li>
                  <li v-else-if="currentScope === 'book' || getNodeSessions(c1).includes(activeSessionId)">
                    <a
                      class="toc-link"
                      :class="{
                        active: getNodeSessions(c1).includes(activeSessionId),
                        'toc-timestamp-pending': !c1.timestamp || c1.timestamp === 0
                      }"
                      :href="'#session-' + (c1.sessionId || activeSessionId) + (c1.timestamp ? '-t' + c1.timestamp : '')"
                      :data-session-id="c1.sessionId || activeSessionId"
                      :data-timestamp="String(c1.timestamp || 0)"
                      :data-testid="'toc-node-' + c1.title.substring(0, 8).replace(/\s/g, '')"
                      @click="handleNodeClick(c1, $event)"
                    >
                      {{ c1.title }}
                      <span
                        v-for="sid in (getNodeSessions(c1).includes(activeSessionId) ? [activeSessionId] : [getNodeSessions(c1)[0]])"
                        :key="sid"
                        class="toc-session-badge"
                        :class="{ active: sid === activeSessionId }"
                        @click="handleSessionBadgeClick(sid, $event)"
                      >
                        {{ sid }}
                      </span>
                      <button
                        v-if="getNodeSessions(c1).filter(s => s !== activeSessionId).length > 0"
                        type="button"
                        class="toc-badge-collapsed"
                        data-testid="toc-badge-collapsed"
                        @click="openPopover(getNodeSessions(c1), $event)"
                      >
                        +{{ getNodeSessions(c1).filter(s => s !== activeSessionId).length }} 講 ▾
                      </button>
                      <span v-if="c1.page" class="toc-page-badge">p.{{ c1.page }}</span>
                      <span v-if="c1.timestamp && c1.timestamp > 0" class="toc-timestamp-badge">
                        {{ formatTime(c1.timestamp) }}
                      </span>
                    </a>
                  </li>
                </template>
              </ul>
            </details>
          </li>

          <!-- 否則正常顯示節點 -->
          <li
            v-else-if="currentScope === 'book' || getNodeSessions(node).includes(activeSessionId)"
          >
            <a
              class="toc-link"
              :class="{
                active: getNodeSessions(node).includes(activeSessionId),
                'toc-timestamp-pending': !node.timestamp || node.timestamp === 0
              }"
              :href="'#session-' + (node.sessionId || activeSessionId) + (node.timestamp ? '-t' + node.timestamp : '')"
              :data-session-id="node.sessionId || activeSessionId"
              :data-timestamp="String(node.timestamp || 0)"
              :data-testid="'toc-node-' + node.title.substring(0, 8).replace(/\s/g, '')"
              @click="handleNodeClick(node, $event)"
            >
              {{ node.title }}
              <!-- Pinned badge -->
              <span
                v-if="getNodeSessions(node).length > 0"
                class="toc-session-badge"
                :class="{ active: (getNodeSessions(node).includes(activeSessionId) ? activeSessionId : getNodeSessions(node)[0]) === activeSessionId }"
                @click="handleSessionBadgeClick(getNodeSessions(node).includes(activeSessionId) ? activeSessionId : getNodeSessions(node)[0], $event)"
              >
                {{ getNodeSessions(node).includes(activeSessionId) ? activeSessionId : getNodeSessions(node)[0] }}
              </span>
              <!-- Ghost button -->
              <button
                v-if="getNodeSessions(node).filter(s => s !== (getNodeSessions(node).includes(activeSessionId) ? activeSessionId : getNodeSessions(node)[0])).length > 0"
                type="button"
                class="toc-badge-collapsed"
                data-testid="toc-badge-collapsed"
                @click="openPopover(getNodeSessions(node), $event)"
              >
                +{{ getNodeSessions(node).filter(s => s !== (getNodeSessions(node).includes(activeSessionId) ? activeSessionId : getNodeSessions(node)[0])).length }} 講 ▾
              </button>
              <span v-if="node.page" class="toc-page-badge">p.{{ node.page }}</span>
              <span v-if="node.timestamp && node.timestamp > 0" class="toc-timestamp-badge">
                {{ formatTime(node.timestamp) }}
              </span>
            </a>

            <!-- 子層節點遞迴 -->
            <ul v-if="node.children && node.children.length > 0" class="toc-tree">
              <template v-for="(child, cIdx) in node.children" :key="child.id || cIdx">
                <li v-if="currentScope === 'book' || getNodeSessions(child).includes(activeSessionId) || nodeContainsSession(child, activeSessionId)">
                  <a
                    class="toc-link"
                    :class="{
                      active: getNodeSessions(child).includes(activeSessionId),
                      'toc-timestamp-pending': !child.timestamp || child.timestamp === 0
                    }"
                    :href="'#session-' + (child.sessionId || activeSessionId) + (child.timestamp ? '-t' + child.timestamp : '')"
                    :data-session-id="child.sessionId || activeSessionId"
                    :data-timestamp="String(child.timestamp || 0)"
                    :data-testid="'toc-node-' + child.title.substring(0, 8).replace(/\s/g, '')"
                    @click="handleNodeClick(child, $event)"
                  >
                    {{ child.title }}
                    <span
                      v-if="getNodeSessions(child).length > 0"
                      class="toc-session-badge"
                      :class="{ active: (getNodeSessions(child).includes(activeSessionId) ? activeSessionId : getNodeSessions(child)[0]) === activeSessionId }"
                      @click="handleSessionBadgeClick(getNodeSessions(child).includes(activeSessionId) ? activeSessionId : getNodeSessions(child)[0], $event)"
                    >
                      {{ getNodeSessions(child).includes(activeSessionId) ? activeSessionId : getNodeSessions(child)[0] }}
                    </span>
                    <button
                      v-if="getNodeSessions(child).filter(s => s !== (getNodeSessions(child).includes(activeSessionId) ? activeSessionId : getNodeSessions(child)[0])).length > 0"
                      type="button"
                      class="toc-badge-collapsed"
                      data-testid="toc-badge-collapsed"
                      @click="openPopover(getNodeSessions(child), $event)"
                    >
                      +{{ getNodeSessions(child).filter(s => s !== (getNodeSessions(child).includes(activeSessionId) ? activeSessionId : getNodeSessions(child)[0])).length }} 講 ▾
                    </button>
                    <span v-if="child.page" class="toc-page-badge">p.{{ child.page }}</span>
                    <span v-if="child.timestamp && child.timestamp > 0" class="toc-timestamp-badge">
                      {{ formatTime(child.timestamp) }}
                    </span>
                  </a>

                  <!-- 深度 3 遞迴 -->
                  <ul v-if="child.children && child.children.length > 0" class="toc-tree">
                    <template v-for="(sub, sIdx) in child.children" :key="sub.id || sIdx">
                      <li v-if="currentScope === 'book' || getNodeSessions(sub).includes(activeSessionId)">
                        <a
                          class="toc-link"
                          :class="{
                            active: getNodeSessions(sub).includes(activeSessionId),
                            'toc-timestamp-pending': !sub.timestamp || sub.timestamp === 0
                          }"
                          :href="'#session-' + (sub.sessionId || activeSessionId) + (sub.timestamp ? '-t' + sub.timestamp : '')"
                          :data-session-id="sub.sessionId || activeSessionId"
                          :data-timestamp="String(sub.timestamp || 0)"
                          :data-testid="'toc-node-' + sub.title.substring(0, 8).replace(/\s/g, '')"
                          @click="handleNodeClick(sub, $event)"
                        >
                          {{ sub.title }}
                          <span
                            v-if="getNodeSessions(sub).length > 0"
                            class="toc-session-badge"
                            :class="{ active: (getNodeSessions(sub).includes(activeSessionId) ? activeSessionId : getNodeSessions(sub)[0]) === activeSessionId }"
                            @click="handleSessionBadgeClick(getNodeSessions(sub).includes(activeSessionId) ? activeSessionId : getNodeSessions(sub)[0], $event)"
                          >
                            {{ getNodeSessions(sub).includes(activeSessionId) ? activeSessionId : getNodeSessions(sub)[0] }}
                          </span>
                          <span v-if="sub.page" class="toc-page-badge">p.{{ sub.page }}</span>
                          <span v-if="sub.timestamp && sub.timestamp > 0" class="toc-timestamp-badge">
                            {{ formatTime(sub.timestamp) }}
                          </span>
                        </a>
                      </li>
                    </template>
                  </ul>
                </li>
              </template>
            </ul>
          </li>
        </template>
      </ul>
    </details>

    <!-- Teleport Popover -->
    <Teleport to="body">
      <div
        v-if="popoverState && popoverState.visible"
        class="toc-popover"
        role="tooltip"
        :style="{ top: `${popoverState.anchorY}px`, left: `${popoverState.anchorX}px` }"
      >
        <div class="toc-popover-title">相關講次 ({{ popoverState.sessions.length }})</div>
        <div class="toc-popover-list">
          <button
            v-for="sid in popoverState.sessions"
            :key="sid"
            type="button"
            class="popover-session-item"
            :class="{ active: sid === activeSessionId }"
            :title="'切換至第 ' + sid + ' 講'"
            @click="selectPopoverSession(sid)"
          >
            {{ sid }}
          </button>
        </div>
      </div>
      <!-- Backdrop for popover click outside -->
      <div
        v-if="popoverState && popoverState.visible"
        class="popover-backdrop"
        @click="closePopover"
      ></div>
    </Teleport>
  </div>
</template>

<style scoped>
.toc-container-wrapper {
  margin-bottom: 20px;
}
.toc-accordion {
  background-color: var(--card-bg, #fdfbf7);
  border: 1px solid var(--border-color, #e2d9c8);
  border-left: 4px solid var(--accent-color, #9a3412);
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 20px;
}
.toc-accordion summary {
  font-weight: 700;
  font-size: 1rem;
  color: var(--primary-color, #2b2520);
  cursor: pointer;
  user-select: none;
  outline: none;
}
.toc-scope-toggle {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  margin-bottom: 8px;
}
.toc-scope-btn {
  padding: 4px 10px;
  border: 1px solid var(--border-color, #dcd1be);
  background-color: var(--card-bg, #ffffff);
  color: var(--text-muted, #7c7267);
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
.toc-scope-btn.active {
  background-color: var(--accent-color, #9a3412);
  color: #ffffff;
  border-color: var(--accent-color, #9a3412);
}
.toc-tree {
  margin-top: 10px;
  padding-left: 14px;
  list-style: none;
}
.toc-tree li {
  margin: 6px 0;
}
.toc-ancestor {
  font-size: 0.88rem;
  color: var(--text-muted, #7c7267);
  font-weight: 600;
  cursor: pointer;
  margin: 4px 0;
}
.toc-link {
  color: var(--accent-color, #9a3412);
  text-decoration: none;
  font-weight: 500;
  cursor: pointer;
  font-size: 0.95rem;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 4px;
}
.toc-link:hover {
  text-decoration: underline;
  background-color: rgba(154, 52, 18, 0.05);
}
.toc-link.active {
  background-color: rgba(154, 52, 18, 0.12);
  color: var(--accent-color, #9a3412);
  font-weight: 700;
  border-left: 3px solid var(--accent-color, #9a3412);
  padding-left: 8px;
}
.toc-timestamp-pending {
  color: #999999;
  font-style: italic;
}
.toc-session-badge {
  display: inline-block;
  background: rgba(39, 174, 96, 0.12);
  color: #2e7d32;
  border: 1px solid rgba(39, 174, 96, 0.3);
  border-radius: 4px;
  padding: 0 5px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: monospace;
  cursor: pointer;
}
.toc-session-badge.active {
  background: #2e7d32;
  color: #ffffff;
  border-color: #2e7d32;
}
.toc-badge-collapsed {
  display: inline-flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted, #666666);
  border: 1px dashed rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 0 6px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}
.toc-badge-collapsed:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-main, #2b2520);
}
.toc-page-badge {
  display: inline-block;
  background: rgba(52, 152, 219, 0.12);
  color: #1976d2;
  border: 1px solid rgba(52, 152, 219, 0.3);
  border-radius: 4px;
  padding: 0 5px;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: monospace;
}
.toc-timestamp-badge {
  display: inline-block;
  background: #e8f4fd;
  color: #1976d2;
  border: 1px solid #bbdefb;
  border-radius: 3px;
  padding: 0 6px;
  font-size: 0.75rem;
  font-weight: 600;
}
.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1040;
}
.toc-popover {
  position: absolute;
  z-index: 1050;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 10px 12px;
  min-width: 180px;
  max-width: 280px;
}
.toc-popover-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted, #888888);
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #eeeeee);
  padding-bottom: 4px;
}
.toc-popover-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.popover-session-item {
  padding: 4px 8px;
  border-radius: 4px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.popover-session-item.active {
  background: #2e7d32;
  color: #ffffff;
  border-color: #2e7d32;
}
</style>
