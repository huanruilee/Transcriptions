<script setup lang="ts">
import { ref, computed, nextTick, defineComponent, h, type PropType } from 'vue';

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
  bookTocNodes?: TOCNodeData[];
  activeSessionId: string;
  currentTime?: number;
}>();

const emit = defineEmits<{
  (e: 'seek', targetSession: string, timestamp: number): void;
}>();

const isOpen = ref(false);
const currentScope = ref<'course' | 'book'>('course');

function getNodeTime(node: TOCNodeData): number {
  return typeof node.timestamp === 'number' ? node.timestamp : (node.start_time ?? 0);
}

function getNodePositionKey(node: TOCNodeData): string {
  return node.id || `${node.sessionId || ''}:${node.title}:${getNodeTime(node)}`;
}

const currentPositionNodeId = computed(() => {
  const primaryCandidates: TOCNodeData[] = [];
  const secondaryCandidates: TOCNodeData[] = [];
  function collect(nodes: TOCNodeData[]) {
    for (const node of nodes || []) {
      if (node.sessionId === props.activeSessionId) {
        primaryCandidates.push(node);
      } else if (getNodeSessions(node).includes(props.activeSessionId)) {
        secondaryCandidates.push(node);
      }
      if (node.children?.length) collect(node.children);
    }
  }
  collect(props.tocNodes);

  const candidates = primaryCandidates.length > 0 ? primaryCandidates : secondaryCandidates;
  const eligible = candidates
    .filter((node) => getNodeTime(node) > 0 && getNodeTime(node) <= (props.currentTime ?? 0))
    .sort((a, b) => getNodeTime(b) - getNodeTime(a));
  const best = eligible[0] || candidates[0];
  return best ? getNodePositionKey(best) : null;
});

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

async function revealCurrentPosition() {
  isOpen.value = true;
  currentScope.value = 'course';
  await nextTick();
  const target = currentPositionNodeId.value
    ? Array.from(document.querySelectorAll('[data-toc-position-id]'))
        .find((el) => el.getAttribute('data-toc-position-id') === currentPositionNodeId.value)
    : null;
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

defineExpose({ revealCurrentPosition });

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

const TOCNodeBranch: any = defineComponent({
  name: 'TOCNodeBranch',
  props: {
    nodes: {
      type: Array as PropType<TOCNodeData[]>,
      required: true,
    },
  },
  setup(branchProps) {
    return () =>
      (branchProps.nodes || []).map((node, idx) => {
        const key = node.id || `${node.title}-${idx}`;
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const sessions = getNodeSessions(node);
        const matchesActive = sessions.includes(props.activeSessionId);
        const containsActive = nodeContainsSession(node, props.activeSessionId);

        // Course scope: 祖先節點本身不屬於本講，但子孫包含本講 -> 渲染為折疊祖先 toc-ancestor
        if (props.currentScope === 'course' || currentScope.value === 'course') {
          if (!matchesActive && containsActive && hasChildren) {
            return h('li', { key }, [
              h('details', { class: 'toc-sub', open: true }, [
                h('summary', { class: 'toc-ancestor' }, node.title),
                h('ul', { class: 'toc-tree' }, [
                  h(TOCNodeBranch, { nodes: node.children! }),
                ]),
              ]),
            ]);
          }
          if (!matchesActive && !containsActive) {
            return null;
          }
        }

        const primarySid = matchesActive ? props.activeSessionId : (sessions[0] || node.sessionId || props.activeSessionId);
        const extraSessions = sessions.filter((s) => s !== primarySid);
        const ts = getNodeTime(node);
        const posKey = getNodePositionKey(node);

        const linkChildren: any[] = [node.title];

        if (sessions.length > 0) {
          linkChildren.push(
            h(
              'span',
              {
                class: ['toc-session-badge', { active: primarySid === props.activeSessionId }],
                onClick: (e: MouseEvent) => handleSessionBadgeClick(primarySid, e),
              },
              primarySid,
            ),
          );
        }

        if (extraSessions.length > 0) {
          linkChildren.push(
            h(
              'button',
              {
                type: 'button',
                class: 'toc-badge-collapsed',
                'data-testid': 'toc-badge-collapsed',
                onClick: (e: MouseEvent) => openPopover(sessions, e),
              },
              `+${extraSessions.length} 講 ▾`,
            ),
          );
        }

        if (node.page) {
          linkChildren.push(
            h('span', { class: 'toc-page-badge' }, `p.${node.page}`),
          );
        }

        if (ts > 0 && (node.sessionId === props.activeSessionId || currentScope.value === 'book')) {
          linkChildren.push(
            h('span', { class: 'toc-timestamp-badge' }, formatTime(ts)),
          );
        }

        const liChildren: any[] = [
          h(
            'a',
            {
              class: [
                'toc-link',
                {
                  active: matchesActive,
                  'toc-timestamp-pending': !ts || ts === 0,
                  'toc-current-position': currentPositionNodeId.value === posKey,
                },
              ],
              href: `#session-${node.sessionId || props.activeSessionId}${ts ? '-t' + ts : ''}`,
              'data-session-id': node.sessionId || props.activeSessionId,
              'data-timestamp': String(ts || 0),
              'data-testid': 'toc-node-' + node.title.substring(0, 8).replace(/\s/g, ''),
              'data-toc-position-id': posKey,
              onClick: (e: MouseEvent) => handleNodeClick(node, e),
            },
            linkChildren,
          ),
        ];

        if (hasChildren) {
          liChildren.push(
            h('ul', { class: 'toc-tree' }, [
              h(TOCNodeBranch, { nodes: node.children! }),
            ]),
          );
        }

        return h('li', { key }, liChildren);
      });
  },
});
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
        <TOCNodeBranch :nodes="currentScope === 'book' ? (bookTocNodes || tocNodes) : tocNodes" />
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
:deep(.toc-tree) {
  margin-top: 8px;
  padding-left: 14px;
  list-style: none;
}
:deep(.toc-tree li) {
  margin: 6px 0;
}
:deep(.toc-ancestor) {
  font-size: 0.88rem;
  color: var(--text-muted, #7c7267);
  font-weight: 600;
  cursor: pointer;
  margin: 4px 0;
}
:deep(.toc-link) {
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
:deep(.toc-link:hover) {
  text-decoration: underline;
  background-color: rgba(154, 52, 18, 0.05);
}
:deep(.toc-link.active) {
  background-color: rgba(154, 52, 18, 0.12);
  color: var(--accent-color, #9a3412);
  font-weight: 700;
  border-left: 3px solid var(--accent-color, #9a3412);
  padding-left: 8px;
}
:deep(.toc-link.toc-current-position) {
  outline: 2px solid var(--accent-color, #9a3412);
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgba(154, 52, 18, 0.12);
}
:deep(.toc-timestamp-pending) {
  color: #999999;
  font-style: italic;
}
:deep(.toc-session-badge) {
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
:deep(.toc-session-badge.active) {
  background: #2e7d32;
  color: #ffffff;
  border-color: #2e7d32;
}
:deep(.toc-badge-collapsed) {
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
:deep(.toc-badge-collapsed:hover) {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-main, #2b2520);
}
:deep(.toc-page-badge) {
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
:deep(.toc-timestamp-badge) {
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
