import { describe, it, expect } from 'vitest';
import { getPrevNextSessions, naturalSortSessions } from '../../src/composables/useSessionNavigation';

describe('SessionNavigation Test Pattern (TDD)', () => {
  const sampleSessions = [
    { session_id: '100', title: '第100講' },
    { session_id: '01', title: '第01講' },
    { session_id: '02B', title: '第02B講' },
    { session_id: '02A', title: '第02A講' },
    { session_id: '10A', title: '第10A講' },
  ];

  it('應以自然排序正確排列講次 (01 < 02A < 02B < 10A < 100)', () => {
    const sorted = naturalSortSessions(sampleSessions);
    expect(sorted.map(s => s.session_id)).toEqual(['01', '02A', '02B', '10A', '100']);
  });

  it('應正確找出上一講與下一講', () => {
    const sorted = naturalSortSessions(sampleSessions);
    const nav = getPrevNextSessions(sorted, '02A');
    expect(nav.prev?.session_id).toBe('01');
    expect(nav.next?.session_id).toBe('02B');
    expect(nav.hasPrev).toBe(true);
    expect(nav.hasNext).toBe(true);
  });

  it('首講時上一講應為 null 且 hasPrev 為 false', () => {
    const sorted = naturalSortSessions(sampleSessions);
    const nav = getPrevNextSessions(sorted, '01');
    expect(nav.prev).toBeNull();
    expect(nav.hasPrev).toBe(false);
    expect(nav.next?.session_id).toBe('02A');
    expect(nav.hasNext).toBe(true);
  });

  it('末講時下一講應為 null 且 hasNext 為 false', () => {
    const sorted = naturalSortSessions(sampleSessions);
    const nav = getPrevNextSessions(sorted, '100');
    expect(nav.prev?.session_id).toBe('10A');
    expect(nav.hasPrev).toBe(true);
    expect(nav.next).toBeNull();
    expect(nav.hasNext).toBe(false);
  });
});
