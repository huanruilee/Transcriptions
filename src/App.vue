<template>
  <div class="app-root" :style="{ '--font-scale': uiStore.fontSizeRatio, '--sidebar-width': `${sidebarWidth}px` }">
    <!-- 頂部 3 段式導航欄 (Sticky Header) -->
    <header class="app-header">
      <div class="header-left">
        <button
          id="sidebar-toggle"
          class="icon-btn"
          aria-label="切換目錄"
          title="切換側邊欄 (捷徑: [ )"
          @click="toggleSidebar"
        >
          ☰
        </button>
        <div class="brand">
          <h1 class="brand-title">{{ currentCourseTitle }}</h1>
          <span class="course-badge">{{ currentCourseMaster }}</span>
        </div>
        <button
          id="course-overview-btn"
          class="header-btn overview-trigger-btn"
          title="開啟 219 講全景大網格總覽"
          @click="isOverviewModalOpen = true"
        >
          🗂️ 總覽
        </button>
      </div>

      <div class="header-center">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            id="search-input"
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="搜尋講記... (⌘K)"
            @keydown.enter.prevent="handleSearchKeydown"
          />
          <div v-if="searchMatches.length > 0" class="search-nav-tools">
            <span id="search-results-counter" class="results-count">
              {{ currentMatchIndex + 1 }} / {{ searchMatches.length }}
            </span>
            <button id="search-prev-btn" class="search-arrow-btn" @click="handlePrevMatch">▲</button>
            <button id="search-next-btn" class="search-arrow-btn" @click="handleNextMatch">▼</button>
          </div>
        </div>
      </div>

      <div class="header-right">
        <!-- 核心功能按鈕群 -->
        <button
          id="sync-modal-btn"
          class="header-btn"
          title="本機校勘同步 (Port 9091)"
          @click="isSyncModalOpen = true"
        >
          ⚡ 同步
        </button>

        <button
          id="export-notes-btn"
          class="header-btn"
          title="匯出當講校勘修訂與研讀心得為 Markdown 檔案"
          @click="handleExportNotes"
        >
          📥 筆記
        </button>

        <button
          id="review-modal-btn"
          class="header-btn"
          title="講次品質評分與回報"
          @click="isReviewModalOpen = true"
        >
          ⭐ 評分
        </button>

        <a
          href="review.html"
          target="_blank"
          class="header-btn review-center-link"
          title="開啟 AI 審核控制台"
        >
          🛡️ 審核
        </a>

        <!-- 主題切換 (紙墨雅緻 / 靜慮夜讀 / 貝葉古卷) -->
        <div class="theme-selector">
          <button
            id="theme-parchment-btn"
            class="theme-btn"
            :class="{ active: uiStore.theme === 'parchment' }"
            title="紙墨雅緻 (預設)"
            @click="setTheme('parchment')"
          >
            📜
          </button>
          <button
            id="theme-zen-btn"
            class="theme-btn"
            :class="{ active: uiStore.theme === 'zen-dark' }"
            title="靜慮夜讀"
            @click="setTheme('zen-dark')"
          >
            🌙
          </button>
          <button
            id="theme-sepia-btn"
            class="theme-btn"
            :class="{ active: uiStore.theme === 'sepia' }"
            title="貝葉古卷"
            @click="setTheme('sepia')"
          >
            🍂
          </button>
        </div>

        <!-- 字級縮放 -->
        <div class="font-controls">
          <button class="small-btn" @click="zoomFont(-0.1)">A-</button>
          <span class="font-ratio">{{ Math.round(uiStore.fontSizeRatio * 100) }}%</span>
          <button class="small-btn" @click="zoomFont(0.1)">A+</button>
        </div>
      </div>
    </header>

    <!-- 手機端分段切換器 (Segmented Control Tabs) -->
    <nav class="mobile-segmented-tabs">
      <button
        class="tab-btn"
        :class="{ active: uiStore.mobileActiveTab === 'transcript' }"
        @click="uiStore.setMobileActiveTab('transcript')"
      >
        📖 講記逐字稿
      </button>
      <button
        class="tab-btn"
        :class="{ active: uiStore.mobileActiveTab === 'canonical' }"
        @click="uiStore.setMobileActiveTab('canonical')"
      >
        🪷 課文原典
      </button>
      <button
        class="tab-btn"
        :class="{ active: uiStore.mobileActiveTab === 'pinned-split' }"
        @click="uiStore.setMobileActiveTab('pinned-split')"
      >
        ⚖️ 雙讀對照
      </button>
    </nav>

    <!-- 主體佈局容器 -->
    <div class="app-layout">
      <!-- 左欄側邊欄 (講次列表) -->
      <aside
        class="sidebar"
        :class="{
          collapsed: isSidebarCollapsed,
          'mobile-open': uiStore.isMobileDrawerOpen,
        }"
      >
        <div class="sidebar-header">
          <select
            id="course-select"
            v-model="courseStore.currentCourseId"
            class="course-dropdown"
          >
            <option
              v-for="c in courseStore.catalog"
              :key="c.id"
              :value="c.id"
            >
              {{ c.title }} ({{ c.master }})
            </option>
          </select>
          <input
            id="sidebar-filter"
            v-model="sidebarFilter"
            type="text"
            placeholder="快速篩選 (如 02A, p.63)..."
            class="filter-input"
          />
        </div>

        <ul class="session-list">
          <li
            v-for="s in filteredSessions"
            :key="s.id"
            class="session-item"
            :class="{ active: s.id === currentSessionId }"
            @click="selectSession(s.id)"
          >
            <div class="session-main">
              <span class="session-id">{{ s.id }}</span>
              <span class="session-title">{{ s.title }}</span>
            </div>
            <div v-if="s.page" class="session-meta">
              <span class="page-tag">{{ s.page }}</span>
            </div>
          </li>
        </ul>

        <!-- 側邊欄拖曳調整把手 -->
        <div
          id="sidebar-resizer"
          class="sidebar-resizer"
          @mousedown="startResizing"
        ></div>
      </aside>

      <!-- 遮罩 (手機端抽屜背景) -->
      <div
        v-if="uiStore.isMobileDrawerOpen"
        class="sidebar-backdrop"
        @click="uiStore.closeAllDrawers"
      ></div>

      <!-- 右欄閱讀主區 (780px 黃金行寬) -->
      <main id="transcript-container" class="main-reader">
        <!-- 麵包屑導航 -->
        <nav class="reader-breadcrumb">
          <span class="crumb-home" @click="isOverviewModalOpen = true">🏠 {{ currentCourseTitle }}</span>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">第 {{ currentSessionId }} 講 {{ currentSessionInfo?.title || '' }}</span>
        </nav>

        <!-- 動態即時科判祖先鏈 (Sticky Doctrinal Bar) -->
        <div class="sticky-doctrinal-bar">
          <span class="breadcrumb-icon">📑</span>
          <span
            v-for="(node, idx) in activeTOCChain"
            :key="node.id"
            class="chain-crumb"
          >
            {{ node.title }}
            <span v-if="idx < activeTOCChain.length - 1" class="crumb-sep">></span>
          </span>
        </div>

        <!-- 雙視角科判手風琴 (對齊 V1) -->
        <TOCAccordion
          id="toc-accordion-root"
          :toc-nodes="courseStore.tocTree || []"
          :active-session-id="currentSessionId"
          :current-time="playerStore.currentTime"
          @seek="handleTOCSeek"
        />

        <!-- 逐字稿本文 (文章自然排版) -->
        <article class="transcript-article">
          <!-- 文章開頭：講次標題與校勘時間標記 -->
          <header class="session-article-header">
            <h1 class="session-article-title">
              {{ currentSessionInfo?.title || `第 ${currentSessionId} 講` }}
            </h1>
            <div class="session-article-meta">
              <span v-if="currentLastUpdated" class="meta-tag update-tag" title="此講次逐字稿最後校正修訂日期">
                🕒 最後校正更新：{{ currentLastUpdated }}
              </span>
              <span class="meta-tag status-tag">
                ✅ 已校勘核定
              </span>
              <span v-if="currentSessionInfo?.page" class="meta-tag page-tag">
                📖 底本頁碼：{{ currentSessionInfo.page }}
              </span>
            </div>
          </header>

          <div
            v-for="p in paragraphs"
            :key="p.id"
            class="paragraph-block"
          >
            <!-- 科判導讀小標題 -->
            <h3 v-if="p.heading" class="transcript-heading">
              {{ p.heading }}
            </h3>

            <!-- Phase 2: 內嵌科判導引小卡 (對齊 V1) -->
            <div
              v-if="p.tocAnchorNode"
              class="toc-anchor-card"
              :aria-label="'科判節點：' + p.tocAnchorNode.title"
            >
              <span class="toc-anchor-icon">📌</span>
              <span class="toc-anchor-title">{{ p.tocAnchorNode.title }}</span>
              <span v-if="p.tocAnchorNode.page" class="toc-anchor-page">p.{{ p.tocAnchorNode.page }}</span>
              <span class="toc-anchor-ts">{{ formatTime(p.tocAnchorNode.timestamp) }}</span>
            </div>

            <span
              v-for="s in p.sentences"
              :id="s.id"
              :key="s.id"
              class="sentence"
              :class="{
                active: Boolean(s.id && playerStore.activeSentenceId && s.id === playerStore.activeSentenceId),
                'search-matched': Boolean(s.id && searchMatches.length > 0 && searchMatches.some(m => m.sentenceId === s.id)),
                'search-focused': Boolean(s.id && searchMatches[currentMatchIndex]?.sentenceId && searchMatches[currentMatchIndex]?.sentenceId === s.id),
                'has-correction': Boolean(annotationStore.corrections[s.id]),
                'has-review-needed': Boolean(s.reviewNeeded || s.uncertainty || (s.text && (s.text.includes('【存疑】') || s.text.includes('【待定】')))),
                'has-note': Boolean(annotationStore.notes[s.id])
              }"
              :title="getSentenceTitle(s)"
              @click="handleSentenceClick(s)"
              @touchstart="handleSentenceTouchStart($event, s)"
              @touchend="handleSentenceTouchEnd"
              @touchcancel="handleSentenceTouchEnd"
            >
              {{ annotationStore.corrections[s.id]?.corrected || s.text }}
              <!-- 待核定徽章 (對齊 V1) -->
              <span
                v-if="s.reviewNeeded || s.uncertainty || (s.text && (s.text.includes('【存疑】') || s.text.includes('【待定】')))"
                class="sentence-review-badge"
                :title="s.uncertainty || '此句存疑，點擊進入編輯器進行核定確認'"
                @click.stop="openSentenceEditor(s)"
              >
                🔍 待核定
              </span>
              <!-- 研讀筆記徽章 (對齊 V1) -->
              <span
                v-if="annotationStore.notes[s.id]"
                class="sentence-note-badge"
                :title="annotationStore.notes[s.id]"
                @click.stop="openSentenceEditor(s)"
              >
                📌 筆記
              </span>
            </span>
          </div>

          <!-- 講末自動導引推薦卡片 -->
          <EndOfSessionCard
            v-if="navInfo.hasNext"
            :next-session-id="navInfo.next?.id"
            :next-session-title="navInfo.next?.title"
            @next="goToNextSession"
          />
        </article>
      </main>
    </div>

    <!-- 手動滾動狀態條 (對齊 V1 #scroll-lock-indicator) -->
    <div
      v-if="playerStore.isUserScrolling"
      id="scroll-lock-indicator"
      class="scroll-lock-indicator visible"
      title="點擊恢復跟隨播放進度"
      @click="returnToPlaying"
    >
      🎯 手動滾動中（點擊恢復自動跟隨進度）
    </div>

    <!-- 浮動 FAB (回到播放處) -->
    <button
      v-if="playerStore.isUserScrolling"
      id="fab-return-playing"
      class="floating-fab"
      @click="returnToPlaying"
    >
      🎯 回到播放處
    </button>

    <!-- 置底播放列 -->
    <footer class="fixed-player">
      <div class="player-info">
        <span class="now-session">{{ currentSessionId }} 講</span>
        <span class="time-readout">{{ formatTime(playerStore.currentTime) }}</span>
      </div>

      <div class="player-controls">
        <button
          id="prev-session-btn"
          class="nav-session-btn"
          :disabled="!navInfo.hasPrev"
          title="上一講"
          @click="goToPrevSession"
        >
          ⏮️
        </button>

        <audio
          id="audio-element"
          class="native-audio"
          controls
          :playbackrate="playerStore.playbackRate"
          @timeupdate="onNativeTimeUpdate"
        ></audio>

        <button
          id="next-session-btn"
          class="nav-session-btn"
          :disabled="!navInfo.hasNext"
          title="下一講"
          @click="goToNextSession"
        >
          ⏭️
        </button>

        <button
          id="playback-rate-btn"
          class="rate-btn"
          @click="playerStore.cyclePlaybackRate"
        >
          {{ playerStore.playbackRate.toFixed(1) }}x
        </button>

        <button
          id="toc-drawer-trigger"
          class="toc-trigger-btn"
          data-testid="mobile-toc-drawer-btn"
          title="查看科判大綱"
          @click="uiStore.openTOCSheet"
        >
          📑 科判
        </button>
      </div>
    </footer>

    <!-- 彈窗群 -->
    <SentenceEditorModal />

    <LocalSyncModal
      v-if="isSyncModalOpen"
      :course-id="courseStore.currentCourseId"
      :session-id="currentSessionId"
      @close="isSyncModalOpen = false"
    />

    <ReviewRatingModal
      v-if="isReviewModalOpen"
      :course-id="courseStore.currentCourseId"
      :session-id="currentSessionId"
      @close="isReviewModalOpen = false"
    />

    <CourseOverviewModal
      v-if="isOverviewModalOpen"
      :sessions="overviewSessions"
      :current-session-id="currentSessionId"
      :course-title="currentCourseTitle"
      @select="selectSession"
      @close="isOverviewModalOpen = false"
    />

    <TouchContextMenu
      v-if="touchMenu.visible"
      :x="touchMenu.x"
      :y="touchMenu.y"
      :sentence-text="touchMenu.sentence?.text || ''"
      @play="handleTouchPlay"
      @edit="handleTouchEdit"
      @copy="handleTouchCopy"
      @close="touchMenu.visible = false"
    />

    <!-- Mobile Bottom Sheet TOC Drawer (對齊 V1) -->
    <TOCBottomSheet
      :toc-nodes="courseStore.tocTree || []"
      :active-session-id="currentSessionId"
      :is-open="uiStore.isTOCSheetOpen"
      @close="uiStore.closeAllDrawers"
      @seek="handleTOCSeek"
    />

    <!-- 全域學習與同步通知 Toast Banner (學到資料庫即時回饋) -->
    <Transition name="toast-fade">
      <div
        v-if="uiStore.toast.visible"
        class="global-toast-banner"
        :class="`toast-${uiStore.toast.type}`"
        role="alert"
      >
        <span class="toast-icon">
          {{ uiStore.toast.type === 'success' ? '✨' : uiStore.toast.type === 'warning' ? '⚠️' : uiStore.toast.type === 'error' ? '❌' : 'ℹ️' }}
        </span>
        <span class="toast-message">{{ uiStore.toast.message }}</span>
        <button class="toast-close" @click="uiStore.toast.visible = false">✕</button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { usePlayerStore } from './stores/player';
import { useCourseStore } from './stores/course';
import { useUIStore } from './stores/ui';
import { useAnnotationStore } from './stores/annotation';
import SentenceEditorModal from './components/modals/SentenceEditorModal.vue';
import LocalSyncModal from './components/LocalSyncModal.vue';
import ReviewRatingModal from './components/ReviewRatingModal.vue';
import CourseOverviewModal from './components/CourseOverviewModal.vue';
import TOCAccordion from './components/TOCAccordion.vue';
import TOCBottomSheet from './components/TOCBottomSheet.vue';
import EndOfSessionCard from './components/EndOfSessionCard.vue';
import TouchContextMenu from './components/TouchContextMenu.vue';
import { searchSentences, navigateMatch, type SearchMatch } from './composables/useSearchEngine';
import { getPrevNextSessions, naturalSortSessions } from './composables/useSessionNavigation';
import { formatMarkdownNotes, downloadMarkdownFile } from './composables/useExportNotes';
import { handleGlobalKeyDown } from './composables/useKeyboardShortcuts';

const playerStore = usePlayerStore();
const courseStore = useCourseStore();
const uiStore = useUIStore();
const annotationStore = useAnnotationStore();

const isSidebarCollapsed = ref(false);
const searchQuery = ref('');
const sidebarFilter = ref('');
const currentSessionId = ref('01');
const sidebarWidth = ref(280);
const searchInputRef = ref<HTMLInputElement | null>(null);

// 彈窗狀態
const isSyncModalOpen = ref(false);
const isReviewModalOpen = ref(false);
const isOverviewModalOpen = ref(false);

// 觸控懸浮選單
const touchMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  sentence: null as any,
});
let touchTimer: any = null;

// 搜尋結果與導航
const searchMatches = ref<SearchMatch[]>([]);
const currentMatchIndex = ref(0);

const currentCourseTitle = computed(() => {
  const c = courseStore.catalog.find((item) => item.id === courseStore.currentCourseId);
  return c ? c.title : '大乘經典研讀';
});

const currentCourseMaster = computed(() => {
  const c = courseStore.catalog.find((item) => item.id === courseStore.currentCourseId);
  return c ? c.master : '';
});

const filteredSessions = computed(() => {
  return courseStore.filterSessions(sidebarFilter.value);
});

const sortedAllSessions = computed(() => {
  return naturalSortSessions(courseStore.sessions.map(s => ({
    ...s,
    session_id: s.id,
  })));
});

const navInfo = computed(() => {
  return getPrevNextSessions(sortedAllSessions.value, currentSessionId.value);
});

const currentSessionInfo = computed(() => {
  return courseStore.sessions.find(s => s.id === currentSessionId.value);
});

const overviewSessions = computed(() => {
  return sortedAllSessions.value.map(s => ({
    session_id: s.id,
    title: s.title,
    page: s.page,
    date: s.date || '',
    lastUpdated: s.lastUpdated || '',
  }));
});

const activeTOCChain = computed(() => {
  return courseStore.computeActiveTOCChain(playerStore.currentTime, currentSessionId.value);
});

const currentAudioUrl = ref('');
const currentLastUpdated = ref('');
const paragraphs = ref<any[]>([]);
const isLoading = ref(false);

const totalSessionDuration = computed(() => {
  const all = paragraphs.value.flatMap(p => p.sentences);
  if (all.length === 0) return 0;
  return all[all.length - 1].end_time || 0;
});

// 監聽播放中當前句子變動，自動跟隨滾動畫面至視窗中央
watch(() => playerStore.activeSentenceId, (newId) => {
  if (!newId || playerStore.isUserScrolling || isAutoScrollFrozen()) return;
  const el = document.getElementById(newId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});

// 監聽全文搜尋
watch(searchQuery, (newQ) => {
  const allSentences = paragraphs.value.flatMap(p => p.sentences);
  searchMatches.value = searchSentences(allSentences, newQ);
  currentMatchIndex.value = 0;
  if (searchMatches.value.length > 0) {
    jumpToMatch(0);
  }
});

function jumpToMatch(index: number) {
  if (index < 0 || index >= searchMatches.value.length) return;
  currentMatchIndex.value = index;
  const match = searchMatches.value[index];
  const el = document.getElementById(match.sentenceId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function handleNextMatch() {
  const nextIdx = navigateMatch(searchMatches.value, currentMatchIndex.value, 'next');
  jumpToMatch(nextIdx);
}

function handlePrevMatch() {
  const prevIdx = navigateMatch(searchMatches.value, currentMatchIndex.value, 'prev');
  jumpToMatch(prevIdx);
}

function handleSearchKeydown(e: KeyboardEvent) {
  if (e.shiftKey) {
    handlePrevMatch();
  } else {
    handleNextMatch();
  }
}

// 講次切換
function goToPrevSession() {
  if (navInfo.value.hasPrev && navInfo.value.prev) {
    selectSession(navInfo.value.prev.id);
  }
}

function goToNextSession() {
  if (navInfo.value.hasNext && navInfo.value.next) {
    selectSession(navInfo.value.next.id);
  }
}

// 匯出 Markdown 筆記
function handleExportNotes() {
  const meta = {
    courseTitle: currentCourseTitle.value,
    sessionId: currentSessionId.value,
    sessionTitle: currentSessionInfo.value?.title || `第 ${currentSessionId.value} 講`,
    pageRange: currentSessionInfo.value?.page || '',
  };
  const md = formatMarkdownNotes(
    meta,
    annotationStore.corrections,
    annotationStore.notes
  );
  const filename = `${currentCourseTitle.value}_第${currentSessionId.value}講_研讀筆記.md`;
  downloadMarkdownFile(filename, md);
}

// 音訊跳轉
function seekToTime(time: number) {
  playerStore.updateTime(time);
  const audioEl = document.getElementById('audio-element') as HTMLAudioElement;
  if (audioEl) {
    audioEl.currentTime = time;
    audioEl.play().catch(() => {});
  }
}

// 科判跳轉 (跨講或本講時間戳)
function handleTOCSeek(targetSession: string, timestamp: number) {
  if (targetSession && targetSession !== currentSessionId.value) {
    loadSession(targetSession).then(() => {
      if (timestamp > 0) {
        setTimeout(() => seekToTime(timestamp), 200);
      }
    });
  } else if (timestamp > 0) {
    seekToTime(timestamp);
  }
}

// 觸控長按事件 (行動端)
function handleSentenceTouchStart(e: TouchEvent, s: any) {
  touchTimer = setTimeout(() => {
    const touch = e.touches[0];
    touchMenu.value = {
      visible: true,
      x: touch.clientX,
      y: touch.clientY,
      sentence: s,
    };
  }, 500);
}

function handleSentenceTouchEnd() {
  if (touchTimer) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
}

function handleTouchPlay() {
  if (touchMenu.value.sentence) {
    handleSentenceClick(touchMenu.value.sentence);
  }
  touchMenu.value.visible = false;
}

function handleTouchEdit() {
  if (touchMenu.value.sentence) {
    openSentenceEditor(touchMenu.value.sentence);
  }
  touchMenu.value.visible = false;
}

function handleTouchCopy() {
  if (touchMenu.value.sentence) {
    navigator.clipboard?.writeText(touchMenu.value.sentence.text);
  }
  touchMenu.value.visible = false;
}

// 側欄拖曳調整
let isResizing = false;
function startResizing(e: MouseEvent) {
  isResizing = true;
  document.addEventListener('mousemove', onResizing);
  document.addEventListener('mouseup', stopResizing);
}

function onResizing(e: MouseEvent) {
  if (!isResizing) return;
  const newWidth = Math.min(Math.max(e.clientX, 200), 500);
  sidebarWidth.value = newWidth;
}

function stopResizing() {
  isResizing = false;
  document.removeEventListener('mousemove', onResizing);
  document.removeEventListener('mouseup', stopResizing);
}

// 全域快捷鍵
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    handleGlobalKeyDown(e, {
      onTogglePlay: () => {
        const audioEl = document.getElementById('audio-element') as HTMLAudioElement;
        if (audioEl) {
          if (audioEl.paused) audioEl.play().catch(() => {});
          else audioEl.pause();
        }
      },
      onToggleSidebar: () => toggleSidebar(),
      onCloseModal: () => {
        isSyncModalOpen.value = false;
        isReviewModalOpen.value = false;
        isOverviewModalOpen.value = false;
        touchMenu.value.visible = false;
        annotationStore.closeEditor();
        uiStore.closeAllDrawers();
      },
      onFocusSearch: () => {
        searchInputRef.value?.focus();
        searchInputRef.value?.select();
      },
    });
  });
}

function onUserScroll() {
  if (isAutoScrollFrozen()) return;
  playerStore.handleUserScroll(4000);
}

onMounted(async () => {
  setupKeyboardShortcuts();
  window.addEventListener('scroll', onUserScroll, { passive: true });
  window.addEventListener('wheel', onUserScroll, { passive: true });
  window.addEventListener('touchmove', onUserScroll, { passive: true });
  await loadRealCourseData();

  // 監聽 URL Hash 變更
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#session-', '').replace('#', '');
    if (hash && hash !== currentSessionId.value) {
      loadSession(hash);
    }
  });

  const initialHash = window.location.hash.replace('#session-', '').replace('#', '');
  const targetId = initialHash || '02A';
  await loadSession(targetId);
});

onUnmounted(() => {
  window.removeEventListener('scroll', onUserScroll);
  window.removeEventListener('wheel', onUserScroll);
  window.removeEventListener('touchmove', onUserScroll);
});

async function loadRealCourseData() {
  const baseUrl = import.meta.env.BASE_URL || '/';
  try {
    const resCourse = await fetch(`${baseUrl}courses/入中論善顯密意疏/course.json`);
    if (resCourse.ok) {
      const data = await resCourse.json();
      const sessions = (data.sessions || []).map((s: any) => ({
        id: s.sessionId,
        title: s.title || `第 ${s.sessionId} 講`,
        page: s.pageRange || '',
        summary: s.summary || '',
        date: s.date || '',
        lastUpdated: s.lastUpdated || '',
        jsonUrl: s.jsonUrl,
        audioUrl: s.audioUrl,
      }));
      courseStore.setSessions(sessions);
    }

    const resTOC = await fetch(`${baseUrl}courses/入中論善顯密意疏/toc.json`);
    if (resTOC.ok) {
      const tocData = await resTOC.json();
      courseStore.setTOC(tocData);
    }
  } catch (err) {
    console.error('載入課程基本資料失敗:', err);
  }
}

async function loadSession(sessionId: string) {
  currentSessionId.value = sessionId;
  window.location.hash = `session-${sessionId}`;
  isLoading.value = true;

  const baseUrl = import.meta.env.BASE_URL || '/';
  try {
    const url = `${baseUrl}courses/入中論善顯密意疏/sessions/session_${sessionId}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    currentAudioUrl.value = data.audioUrl || '';
    currentLastUpdated.value = data.lastUpdated || '';

    let sentCounter = 0;
    const parsedParagraphs = (data.paragraphs || []).map((p: any) => {
      const firstStart = p.sentences?.[0]?.start ?? p.sentences?.[0]?.start_time ?? 0;
      const anchorNode = findTOCNodeAtParagraphStart(firstStart, sessionId, 2);
      return {
        id: p.id || `para-${sentCounter}`,
        heading: p.heading || null,
        tocAnchorNode: anchorNode,
        sentences: (p.sentences || []).map((s: any) => ({
          id: s.id || `sent-${sentCounter++}`,
          start_time: s.start ?? s.start_time ?? 0,
          end_time: s.end ?? s.end_time ?? 0,
          text: s.text || '',
          reviewNeeded: s.reviewNeeded ?? false,
          uncertainty: s.uncertainty ?? null,
        })),
      };
    });

    paragraphs.value = parsedParagraphs;

    const allSentences = parsedParagraphs.flatMap((p: any) => p.sentences);
    playerStore.setSentences(allSentences);
    annotationStore.loadSessionAnnotations(sessionId);

    const audioEl = document.getElementById('audio-element') as HTMLAudioElement;
    if (audioEl && currentAudioUrl.value) {
      audioEl.src = currentAudioUrl.value;
      audioEl.load();
    }
  } catch (err) {
    console.error(`載入講次 ${sessionId} 逐字稿失敗:`, err);
  } finally {
    isLoading.value = false;
  }
}

// 根據段落起始時間匹配科判節點 (對齊 V1 findTOCNodeAtParagraphStart)
function findTOCNodeAtParagraphStart(paraStart: number, sessionId: string, tolerance = 2) {
  if (!courseStore.tocTree || courseStore.tocTree.length === 0) return null;
  let match: any = null;
  function walk(nodes: any[]) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const nodeSessions = Array.isArray(node.sessionIds) && node.sessionIds.length > 0
        ? node.sessionIds
        : (node.sessionId ? [node.sessionId] : []);
      const sessionMatch = node.sessionId === sessionId || nodeSessions.includes(sessionId);
      const ts = typeof node.timestamp === 'number' ? node.timestamp : 0;
      if (sessionMatch && ts > 0 && Math.abs(ts - paraStart) <= tolerance) {
        match = { title: node.title, timestamp: ts, page: node.page, sessionId: node.sessionId };
      }
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  }
  walk(courseStore.tocTree);
  return match;
}

function getSentenceTitle(s: any): string {
  const corr = annotationStore.corrections[s.id];
  if (corr) {
    return `【已校勘】原音：${corr.original}（雙擊可再次校對）`;
  }
  return '單擊跳播 ｜ 連擊兩下（Double Click）進入校對與筆記';
}

function toggleSidebar() {
  if (window.innerWidth < 768) {
    if (uiStore.isMobileDrawerOpen) uiStore.closeAllDrawers();
    else uiStore.openMobileDrawer();
  } else {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }
}

function setTheme(theme: any) {
  uiStore.setTheme(theme);
  document.body.setAttribute('data-theme', theme);
}

function zoomFont(delta: number) {
  uiStore.setFontSizeRatio(uiStore.fontSizeRatio + delta);
}

function selectSession(id: string) {
  loadSession(id);
  if (uiStore.isMobileDrawerOpen) uiStore.closeAllDrawers();
}

// 滾動防凍結機制 (對齊 V1 freezeAutoScroll: 點擊時凍結自動滾動，防止搶畫面與跳動)
let lastClickTime = 0;
let singleClickTimer: any = null;
let autoScrollFrozenUntil = 0;

function freezeAutoScroll(durationMs = 600) {
  autoScrollFrozenUntil = Math.max(autoScrollFrozenUntil, Date.now() + durationMs);
}

function isAutoScrollFrozen(): boolean {
  return Date.now() < autoScrollFrozenUntil;
}

// 單擊跳播 vs 雙擊編輯 450ms 防抖隔離 (對齊 V1 邏輯)
function handleSentenceClick(s: any) {
  const now = Date.now();
  if (now - lastClickTime < 450 && lastClickTime > 0) {
    // 450ms 內連續兩次點擊：確認為雙擊，取消單擊跳播定時器，進入編輯彈窗，並凍結滾動 1500ms
    if (singleClickTimer) {
      clearTimeout(singleClickTimer);
      singleClickTimer = null;
    }
    lastClickTime = 0;
    freezeAutoScroll(1500);
    openSentenceEditor(s);
    return;
  }
  lastClickTime = now;

  // 單擊：延遲 250ms 執行跳播，若在 450ms 內再次點擊則視為雙擊取消跳播
  freezeAutoScroll(600);
  if (singleClickTimer) clearTimeout(singleClickTimer);
  singleClickTimer = setTimeout(() => {
    playerStore.resetScrollLock();
    playerStore.activeSentenceId = s.id;
    seekToTime(s.start_time);
    const el = document.getElementById(s.id);
    if (el && !isAutoScrollFrozen()) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    singleClickTimer = null;
  }, 250);
}

function openSentenceEditor(s: any) {
  const allSentences = playerStore.sentences;
  const idx = allSentences.findIndex(x => x.id === s.id);
  const prevSent = idx > 0 ? allSentences[idx - 1] : null;
  const nextSent = idx >= 0 && idx < allSentences.length - 1 ? allSentences[idx + 1] : null;
  annotationStore.openEditor(s, { prev: prevSent, next: nextSent });
}

function onNativeTimeUpdate(e: any) {
  const audio = e.target as HTMLAudioElement;
  if (audio) {
    playerStore.updateTime(audio.currentTime);
  }
}

function returnToPlaying() {
  playerStore.resetScrollLock();
  if (playerStore.activeSentenceId) {
    const el = document.getElementById(playerStore.activeSentenceId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// 監聽播放倍率變更
watch(() => playerStore.playbackRate, (rate) => {
  const audio = document.getElementById('audio-element') as HTMLAudioElement;
  if (audio) audio.playbackRate = rate;
});

// 暴露 CLI / API 測試介面 (供純文字 CLI 驗收，零截圖 Token 消耗)
if (typeof window !== 'undefined') {
  (window as any).__TEST_API__ = {
    getState: () => ({
      sessionId: currentSessionId.value,
      currentTime: playerStore.currentTime,
      activeSentenceId: playerStore.activeSentenceId,
      activeSentenceIndex: playerStore.activeSentenceIndex,
      activeSentenceText: playerStore.sentences[playerStore.activeSentenceIndex]?.text || null,
      isUserScrolling: playerStore.isUserScrolling,
      sentenceCount: playerStore.sentences.length,
      tocChain: activeTOCChain.value.map((n: any) => n.title),
      playbackRate: playerStore.playbackRate,
    }),
    seek: (t: number) => seekToTime(t),
    tick: (t: number) => playerStore.updateTime(t),
    clickSentence: (id: string) => {
      const s = playerStore.sentences.find((x: any) => x.id === id);
      if (s) handleSentenceClick(s);
    },
    loadSession: (sid: string) => loadSession(sid),
  };
}
</script>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bg-color);
  color: var(--text-main);
  font-family: var(--font-serif);
  padding-bottom: var(--player-height);
  transition: var(--transition-smooth);
}

/* 頂部三段導航 */
.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: var(--header-height);
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-btn {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  cursor: pointer;
  color: var(--text-main);
}

.brand-title {
  font-size: 1.05rem;
  margin: 0;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.course-badge {
  font-size: 0.75rem;
  background-color: var(--sidebar-bg);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  color: var(--primary-color);
}

.header-btn {
  padding: 6px 10px;
  font-size: 0.82rem;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-main);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  transition: background 0.15s ease;
}

.header-btn:hover {
  background: rgba(154, 52, 18, 0.08);
}

.header-center {
  flex: 1;
  max-width: 440px;
}

.search-box {
  display: flex;
  align-items: center;
  background-color: var(--sidebar-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 4px 10px;
  gap: 8px;
}

.search-icon {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  color: var(--text-main);
  font-size: 0.9rem;
}

.search-nav-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.results-count {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: monospace;
}

.search-arrow-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.7rem;
  color: var(--text-main);
  padding: 2px 4px;
  border-radius: 2px;
}

.search-arrow-btn:hover {
  background: rgba(0, 0, 0, 0.1);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-selector {
  display: flex;
  background-color: var(--sidebar-bg);
  border-radius: var(--radius-sm);
  padding: 2px;
  border: 1px solid var(--border-color);
}

.theme-btn {
  background: none;
  border: none;
  padding: 4px 6px;
  font-size: 0.85rem;
  cursor: pointer;
  border-radius: var(--radius-sm);
  opacity: 0.6;
}

.theme-btn.active {
  background-color: var(--card-bg);
  opacity: 1;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.font-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}

.small-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--text-main);
}

.font-ratio {
  font-size: 0.75rem;
  color: var(--text-muted);
  width: 34px;
  text-align: center;
}

/* 手機端分段導航 */
.mobile-segmented-tabs {
  display: none;
}

/* 主體版面 */
.app-layout {
  display: flex;
  flex: 1;
  position: relative;
}

/* 側邊欄 */
.sidebar {
  width: var(--sidebar-width, 280px);
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: transform var(--transition-smooth);
  position: relative;
  flex-shrink: 0;
}

.sidebar.collapsed {
  display: none;
}

.sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.course-dropdown, .filter-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background-color: var(--card-bg);
  color: var(--text-main);
  font-size: 0.85rem;
}

.session-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.session-item {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: background var(--transition-fast);
}

.session-item:hover {
  background-color: rgba(154, 52, 18, 0.05);
}

.session-item.active {
  background-color: rgba(154, 52, 18, 0.12);
  border-left: 4px solid var(--accent-color);
}

.session-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-id {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--accent-color);
}

.session-title {
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.page-tag {
  font-size: 0.7rem;
  color: var(--text-muted);
  background-color: var(--card-bg);
  padding: 1px 4px;
  border-radius: 3px;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  bottom: 0;
  cursor: col-resize;
  z-index: 10;
}
.sidebar-resizer:hover {
  background: var(--accent-color);
}

/* 閱讀主區 */
.main-reader {
  flex: 1;
  max-width: var(--max-reader-width);
  margin: 0 auto;
  padding: 24px 32px 64px;
  width: 100%;
  box-sizing: border-box;
}

.reader-breadcrumb {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.crumb-home {
  cursor: pointer;
}
.crumb-home:hover {
  color: var(--accent-color);
}
.crumb-current {
  color: var(--text-main);
  font-weight: 500;
}

.sticky-doctrinal-bar {
  position: sticky;
  top: var(--header-height);
  z-index: 40;
  background-color: var(--bg-color);
  padding: 8px 12px;
  border-bottom: 1px dashed var(--border-color);
  font-size: 0.85rem;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  backdrop-filter: blur(4px);
}

.session-article-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.session-article-title {
  font-size: 1.55rem;
  font-weight: 700;
  color: var(--primary-color);
  margin: 0 0 10px 0;
  line-height: 1.35;
}

.session-article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.meta-tag {
  font-size: 0.82rem;
  padding: 3px 10px;
  border-radius: 6px;
  background: var(--surface-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.update-tag {
  background: rgba(154, 52, 18, 0.08);
  color: var(--accent-color);
  font-weight: 600;
  border-color: rgba(154, 52, 18, 0.2);
}

.status-tag {
  color: #166534;
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
  font-weight: 500;
}

.page-tag {
  color: var(--text-muted);
}

.paragraph-block {
  margin-bottom: var(--paragraph-margin);
  line-height: var(--line-height);
  font-size: calc(1rem * var(--font-scale, 1));
}

.transcript-heading {
  font-size: 1.15rem;
  color: var(--accent-color);
  margin: 20px 0 10px;
  font-weight: 700;
}

.toc-anchor-card {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px 4px 8px;
  margin: 10px 0 4px 0;
  background: linear-gradient(90deg, rgba(139, 30, 30, 0.07) 0%, rgba(197, 155, 39, 0.05) 100%);
  border: 1px solid rgba(139, 30, 30, 0.2);
  border-left: 3px solid #8b1e1e;
  border-radius: 0 20px 20px 0;
  font-size: 0.78rem;
  line-height: 1.3;
  cursor: default;
}

.toc-anchor-icon { font-size: 0.85rem; flex-shrink: 0; }
.toc-anchor-title { color: #7a1c1c; font-weight: 600; letter-spacing: 0.01em; }
.toc-anchor-page {
  background: rgba(52, 152, 219, 0.1);
  color: #1a6ea3;
  border: 1px solid rgba(52, 152, 219, 0.25);
  border-radius: 4px;
  padding: 0 5px;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: monospace;
}
.toc-anchor-ts {
  background: rgba(139, 30, 30, 0.08);
  color: #8b1e1e;
  border-radius: 4px;
  padding: 0 5px;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: monospace;
}

.sentence {
  cursor: pointer;
  padding: 2px 2px;
  border-radius: 3px;
  transition: background var(--transition-fast);
  display: inline;
}

.sentence:hover {
  background-color: rgba(154, 52, 18, 0.08);
}

.sentence.active {
  background-color: var(--highlight-bg);
  border-bottom: 2px solid var(--highlight-border);
  color: var(--text-main);
  font-weight: 600;
  border-radius: 2px;
  box-shadow: 0 1px 4px rgba(180, 83, 9, 0.15);
}

.sentence.has-correction {
  border-bottom: 2px solid #f59e0b;
  background-color: rgba(245, 158, 11, 0.08);
  border-radius: 3px;
}

.sentence.has-review-needed {
  border-bottom: 2px dashed #ea580c;
  background-color: rgba(234, 88, 12, 0.09);
  border-radius: 3px;
}

.sentence-review-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: #c2410c;
  background: #ffedd5;
  border: 1px solid #fdba74;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 4px;
  cursor: pointer;
  vertical-align: middle;
  transition: all 0.15s ease;
}

.sentence-review-badge:hover {
  background: #fed7aa;
  transform: translateY(-1px);
}

.sentence.has-note {
  position: relative;
}

.sentence-note-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 600;
  color: #d97706;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 4px;
  cursor: pointer;
  vertical-align: middle;
  transition: all 0.15s ease;
}

.sentence-note-badge:hover {
  background: #fde68a;
  transform: translateY(-1px);
}

.sentence.search-matched {
  background-color: rgba(254, 240, 138, 0.4);
}

.sentence.search-focused {
  background-color: rgba(250, 204, 21, 0.8);
  box-shadow: 0 0 0 2px #d97706;
}

/* 手動滾動狀態條 (對齊 V1) */
.scroll-lock-indicator {
  position: fixed;
  bottom: calc(var(--player-height) + 16px);
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--primary-color);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  z-index: 90;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* 浮動 FAB */
.floating-fab {
  position: fixed;
  bottom: calc(var(--player-height) + 16px);
  right: 24px;
  background-color: var(--accent-color);
  color: white;
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  z-index: 80;
  transition: transform var(--transition-fast);
}

.floating-fab:hover {
  transform: scale(1.05);
}

/* 置底固定播放器 */
.fixed-player {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--player-height);
  background-color: var(--card-bg);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  z-index: 100;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.now-session {
  font-weight: 700;
  color: var(--accent-color);
}

.time-readout {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-family: monospace;
}

.player-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-session-btn {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  cursor: pointer;
  font-size: 0.9rem;
}
.nav-session-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.native-audio {
  height: 36px;
}

.rate-btn, .toc-trigger-btn {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main);
}

/* 響應式佈局適配 */
@media (max-width: 768px) {
  .app-header {
    padding: 0 10px;
  }
  .header-btn {
    display: none;
  }
  .search-box {
    max-width: 140px;
  }
  .mobile-segmented-tabs {
    display: flex;
    background-color: var(--sidebar-bg);
    border-bottom: 1px solid var(--border-color);
    padding: 4px;
    gap: 4px;
  }
  .tab-btn {
    flex: 1;
    border: none;
    background: transparent;
    padding: 8px 4px;
    font-size: 0.8rem;
    font-weight: 500;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }
  .tab-btn.active {
    background-color: var(--card-bg);
    color: var(--accent-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }
  .sidebar {
    position: fixed;
    top: var(--header-height);
    bottom: var(--player-height);
    left: 0;
    z-index: 90;
    transform: translateX(-100%);
    width: 80% !important;
    max-width: 320px;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.1);
  }
  .sidebar.mobile-open {
    transform: translateX(0);
  }
  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.4);
    z-index: 85;
  }
  .main-reader {
    padding: 16px 16px 48px;
  }
  .native-audio {
    width: 160px;
  }
}

/* 全域 Toast Banner 樣式 */
.global-toast-banner {
  position: fixed;
  top: calc(var(--header-height, 56px) + 16px);
  right: 20px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
  font-size: 0.92rem;
  max-width: 460px;
  backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-icon {
  font-size: 1.15rem;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  line-height: 1.4;
  font-weight: 500;
}

.toast-close {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  opacity: 0.7;
  padding: 0 4px;
}
.toast-close:hover {
  opacity: 1;
}

.toast-success {
  background: rgba(240, 253, 244, 0.95);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #15803d;
}

.toast-info {
  background: rgba(240, 249, 255, 0.95);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #0369a1;
}

.toast-warning {
  background: rgba(254, 252, 232, 0.95);
  border: 1px solid rgba(234, 179, 8, 0.4);
  color: #a16207;
}

.toast-error {
  background: rgba(254, 242, 242, 0.95);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #b91c1c;
}

/* 深色模式適配 */
[data-theme='dark'] .toast-success,
[data-theme='obsidian'] .toast-success {
  background: rgba(22, 101, 52, 0.92);
  border-color: rgba(34, 197, 94, 0.5);
  color: #dcfce7;
}

[data-theme='dark'] .toast-info,
[data-theme='obsidian'] .toast-info {
  background: rgba(7, 89, 133, 0.92);
  border-color: rgba(56, 189, 248, 0.5);
  color: #e0f2fe;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-fade-enter-from {
  opacity: 0;
  transform: translateY(-16px) scale(0.95);
}

.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}
</style>
