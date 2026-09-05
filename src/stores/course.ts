import { defineStore } from 'pinia';

export interface SessionMeta {
  id: string;
  title: string;
  page?: string;
  summary?: string;
}

export interface TOCNode {
  id: string;
  title: string;
  start_time: number;
  end_time: number;
  children?: TOCNode[];
}

export const useCourseStore = defineStore('course', {
  state: () => ({
    currentCourseId: 'ru-zhong-lun',
    catalog: [
      {
        id: 'ru-zhong-lun',
        title: '入中論善顯密意疏',
        master: '見悲青增格西',
        mediaType: 'audio/mp3',
      },
      {
        id: 'shi-liang-lun-er',
        title: '釋量論第二品',
        master: '如性法師',
        mediaType: 'video/youtube',
      },
    ],
    sessions: [] as SessionMeta[],
    tocTree: [] as TOCNode[],
  }),

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

      function walk(nodes: TOCNode[], chain: TOCNode[]) {
        if (!Array.isArray(nodes)) return;
        for (const node of nodes) {
          const nodeSessions = Array.isArray(node.sessionIds) && node.sessionIds.length > 0
            ? node.sessionIds
            : (node.sessionId ? [node.sessionId] : []);

          if (sessionId && nodeSessions.length > 0 && !nodeSessions.includes(sessionId)) {
            if (node.children && node.children.length > 0) {
              walk(node.children, chain);
            }
            continue;
          }

          const ts = typeof node.timestamp === 'number' ? node.timestamp : (node.start_time ?? 0);
          const currentChain = [...chain, node];

          const isNodeAnchor = !sessionId || node.sessionId === sessionId || nodeSessions.includes(sessionId);
          if (isNodeAnchor && ts <= time && ts > bestTimestamp) {
            bestTimestamp = ts;
            bestChain = [...currentChain];
          }

          if (node.children && node.children.length > 0) {
            walk(node.children, currentChain);
          }
        }
      }

      walk(this.tocTree, []);
      return bestChain;
    },
  },
});
