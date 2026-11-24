import { defineStore } from 'pinia';

export interface SessionMeta {
  id: string;
  displaySessionId?: string;
  title: string;
  page?: string;
  summary?: string;
  date?: string;
  lastUpdated?: string;
  transcriptStatus?: string;
  mediaType?: string;
  audioUrl?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  pendingTranscript?: boolean;
  sourceRebuildPage?: string;
  sourceRebuildStatus?: string;
  sourceRebuildInReader?: boolean;
  audioCalibrationOverlay?: string;
  audioCalibrationOverlayDigest?: string;
  studyGuidePage?: string;
}

export interface TOCNode {
  id: string;
  title: string;
  start_time: number;
  end_time: number;
  children?: TOCNode[];
}

export interface CourseMeta {
  id: string;
  title: string;
  master: string;
  path: string;
  mediaType: string;
  sessionCount?: number;
  /** 覆寫講數顯示文字（例：含上下節的課程） */
  sessionLabel?: string;
  updatedAt?: string;
  /** 課程說明（顯示於課程選擇頁卡片） */
  description?: string;
  /** 課程選擇頁 iOS 圖示 emoji */
  icon?: string;
  /** 課程選擇頁 iOS 圖示漸層（完整 CSS background 值） */
  accent?: string;
}

export const useCourseStore = defineStore('course', {
  state: () => ({
    currentCourseId: 'ru-zhong-lun',
    catalog: [
      {
        id: 'ru-zhong-lun',
        icon: '📖',
        accent: 'linear-gradient(160deg, #8C6239, #5D4037)',
        title: '入中論善顯密意疏',
        master: '見悲青增格西',
        path: 'courses/入中論善顯密意疏',
        mediaType: 'audio/mp3',
        sessionCount: 219,
        description:
          '宗喀巴大師《入中論善顯密意疏》講記，見悲青增格西開示。透過逐字稿與音檔雙向同步，導讀中觀應成派無自性空性正見。',
      },
      {
        id: 'shi-liang-lun-er',
        icon: '🕉',
        accent: 'linear-gradient(160deg, #C96F3B, #8E3B23)',
        title: '釋量論第二品',
        master: '如性法師',
        path: 'courses/釋量論第二品',
        mediaType: 'video/youtube',
        sessionCount: 32,
        description:
          '依據法稱論師《釋量論・成量品》根本頌（法尊法師譯），詳細闡釋量士夫、前後世成立、四諦十六行相與解脫正道。',
      },
      {
        id: 'shi-liang-lun-study-group-2025',
        icon: '🪷',
        accent: 'linear-gradient(160deg, #5C8A6B, #2F4F3A)',
        title: '2025《釋量論・第二品》大組共學',
        master: '大組共學',
        path: 'courses/2025釋量論第二品大組共學',
        mediaType: 'audio/mp3',
        sessionCount: 49,
        sessionLabel: '49 講（含上下節）',
        description: '2025 年依討論問題研讀《釋量論・第二品》，每題附法師開示摘要。',
      },
      {
        id: 'jin-gang-jing-1999',
        icon: '💎',
        accent: 'linear-gradient(160deg, #4A6FA5, #25385C)',
        title: '金剛般若波羅蜜經',
        master: '玅境長老',
        path: 'courses/金剛般若波羅蜜經',
        mediaType: 'audio/mp3',
        sessionCount: 12,
        description:
          '玅境長老 1999 年於台灣埔里法雲講堂宣講《金剛般若波羅蜜經》，共十二講。逐字稿由音檔 ASR 產出，屬待閱校版。',
      },
      {
        id: 'si-nian-zhu',
        icon: '☸️',
        accent: 'linear-gradient(160deg, #8E6BA8, #4E3A66)',
        title: '四念住',
        master: '玅境長老',
        path: 'courses/四念住',
        mediaType: 'audio/mp3',
        sessionCount: 8,
        description: '玅境長老開示四念住法門，共 8 講。逐字稿屬待閱校版。',
      },
      {
        id: 'san-zhu-yao-dao',
        icon: '🛕',
        accent: 'linear-gradient(160deg, #B08D57, #6E5630)',
        title: '三主要道',
        master: '如性法師',
        path: 'courses/三主要道',
        mediaType: 'video/youtube',
        sessionCount: 24,
        updatedAt: '2026-11-20',
        description:
          '如性法師 2022 年起之研討課程，共 24 講。依《三主要道》偈頌講述出離心、菩提心與空性正見的修道次第。',
      },
      {
        id: 'pusa-jiu-shi-zhe-yang-cheng-fo',
        icon: '⚡',
        accent: 'linear-gradient(160deg, #C25B4A, #7A2F22)',
        title: '菩薩就是這樣成佛',
        master: '智善法師',
        path: 'courses/菩薩就是這樣成佛',
        mediaType: 'video/youtube',
        sessionCount: 26,
        description:
          '智善法師講述《菩薩就是這樣成佛》，共 26 講。從課本簡介、菩提心到福慧資糧，次第引導菩薩道修學。',
      },
      {
        id: 'si-fa-yin',
        icon: '🏵️',
        accent: 'linear-gradient(160deg, #3E8A8A, #1F4F4F)',
        title: '四法印',
        master: '如性法師',
        path: 'courses/四法印',
        mediaType: 'video/youtube',
        sessionCount: 11,
        updatedAt: '2026-11-20',
        description:
          '如性法師主講，2020 年 7 月導論與臺灣營隊十講，共 11 講。闡釋諸行無常、有漏皆苦、諸法無我、涅槃寂靜四法印。',
      },
    ] as CourseMeta[],
    sessions: [] as SessionMeta[],
    tocTree: [] as TOCNode[],
  }),

  getters: {
    currentCourse(state) {
      return state.catalog.find((c) => c.id === state.currentCourseId) || state.catalog[0];
    },
    currentCoursePath(): string {
      return this.currentCourse?.path || 'courses/入中論善顯密意疏';
    },
    currentMediaType(): string {
      return this.currentCourse?.mediaType || 'audio/mp3';
    },
  },

  actions: {
    setSessions(items: SessionMeta[]) {
      this.sessions = items;
    },

    setTOC(nodes: any) {
      if (Array.isArray(nodes)) {
        this.tocTree = nodes;
      } else if (nodes && Array.isArray(nodes.sections)) {
        this.tocTree = nodes.sections;
      } else if (nodes && Array.isArray(nodes.nodes)) {
        this.tocTree = nodes.nodes;
      } else {
        this.tocTree = [];
      }
    },

    filterSessions(keyword: string): SessionMeta[] {
      if (!keyword || !keyword.trim()) return this.sessions;
      const q = keyword.trim().toLowerCase();
      return this.sessions.filter((s) => {
        const matchId = s.id.toLowerCase().includes(q);
        const matchTitle = s.title.toLowerCase().includes(q);
        const matchPage = s.page ? s.page.toLowerCase().includes(q) : false;
        const matchSummary = s.summary ? s.summary.toLowerCase().includes(q) : false;
        return matchId || matchTitle || matchPage || matchSummary;
      });
    },

    computeActiveTOCChain(time: number, sessionId?: string): TOCNode[] {
      if (!Array.isArray(this.tocTree) || this.tocTree.length === 0) {
        return [];
      }

      const first = this.tocTree[0];
      const hasRanges = typeof first?.start_time === 'number' && typeof first?.end_time === 'number';

      if (hasRanges) {
        const chain: TOCNode[] = [];
        function traverse(nodes: TOCNode[]): boolean {
          if (!Array.isArray(nodes)) return false;
          for (const node of nodes) {
            const start = node.start_time ?? 0;
            const end = node.end_time ?? Infinity;
            if (time >= start && time <= end) {
              chain.push(node);
              if (node.children && node.children.length > 0) {
                traverse(node.children);
              }
              return true;
            }
          }
          return false;
        }
        traverse(this.tocTree);
        return chain;
      }

      let bestChain: TOCNode[] = [];
      let bestTimestamp = -1;
      let fallbackChain: TOCNode[] = [];
      let fallbackTimestamp = Infinity;

      function walk(nodes: TOCNode[], chain: TOCNode[]) {
        if (!Array.isArray(nodes)) return;
        for (const node of nodes) {
          const nodeSessions = Array.isArray(node.sessionIds) && node.sessionIds.length > 0
            ? node.sessionIds
            : (node.sessionId ? [node.sessionId] : []);

          const ts = typeof node.timestamp === 'number' ? node.timestamp : (node.start_time ?? 0);
          const currentChain = [...chain, node];

          const isPrimaryAnchor = !sessionId || node.sessionId === sessionId;
          const isSecondaryMatch = Boolean(sessionId && nodeSessions.includes(sessionId));

          if (isPrimaryAnchor && ts <= time && ts >= bestTimestamp) {
            bestTimestamp = ts;
            bestChain = [...currentChain];
          }

          if ((isPrimaryAnchor || isSecondaryMatch) && fallbackChain.length === 0) {
            fallbackChain = [...currentChain];
            fallbackTimestamp = ts;
          } else if (isPrimaryAnchor && ts < fallbackTimestamp) {
            fallbackChain = [...currentChain];
            fallbackTimestamp = ts;
          }

          if (node.children && node.children.length > 0) {
            walk(node.children, currentChain);
          }
        }
      }

      walk(this.tocTree, []);
      return bestChain.length > 0 ? bestChain : fallbackChain;
    },
  },
});
