import { describe, it, expect } from 'vitest';
import { filterSessionTOCNodes, type TOCNodeItem } from '../../src/composables/useTOCFilter';

describe('TOCAccordion Test Pattern (TDD)', () => {
  const sampleTOC: TOCNodeItem[] = [
    { id: 'toc-1', title: '總序', start_time: 0, end_time: 120, depth: 1 },
    { id: 'toc-2', title: '第一品 菩提心', start_time: 120, end_time: 1800, depth: 2 },
    { id: 'toc-3', title: '第二品 增上心', start_time: 1800, end_time: 3600, depth: 2 },
    { id: 'toc-4', title: '第六品 現前地', start_time: 7200, end_time: 9000, depth: 1 },
  ];

  it('session 模式下應僅過濾出落在本講時間區間內的科判節點', () => {
    // 當前講次時間為 100s ~ 1500s
    const filtered = filterSessionTOCNodes(sampleTOC, 100, 1500, 'session');
    expect(filtered.map(n => n.id)).toEqual(['toc-1', 'toc-2']);
  });

  it('all 模式下應回傳全部科判節點', () => {
    const all = filterSessionTOCNodes(sampleTOC, 100, 1500, 'all');
    expect(all).toHaveLength(4);
  });
});
