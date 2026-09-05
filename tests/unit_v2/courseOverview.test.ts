import { describe, it, expect } from 'vitest';
import { filterOverviewSessions, type OverviewSessionItem } from '../../src/composables/useCourseOverview';

describe('CourseOverview Test Pattern (TDD)', () => {
  const sampleSessions: OverviewSessionItem[] = [
    { session_id: '01', title: '第01講 皈敬頌釋義', page: 'p.1-p.20', date: '2008-10-01' },
    { session_id: '02A', title: '第02A講 大乘發心之相', page: 'p.21-p.40', date: '2008-10-08' },
    { session_id: '02B', title: '第02B講 深廣二道體系', page: 'p.41-p.60', date: '2008-10-15' },
    { session_id: '99B', title: '第99B講（缺錄音）', page: 'p.400', date: '' },
  ];

  it('無篩選詞時應回傳全量講次', () => {
    const res = filterOverviewSessions(sampleSessions, '');
    expect(res).toHaveLength(4);
  });

  it('應支援以講次編號篩選 (如 02A)', () => {
    const res = filterOverviewSessions(sampleSessions, '02A');
    expect(res).toHaveLength(1);
    expect(res[0].session_id).toBe('02A');
  });

  it('應支援以底本頁碼篩選 (如 p.41)', () => {
    const res = filterOverviewSessions(sampleSessions, 'p.41');
    expect(res).toHaveLength(1);
    expect(res[0].session_id).toBe('02B');
  });

  it('應支援以科判主題關鍵字篩選 (如 皈敬頌)', () => {
    const res = filterOverviewSessions(sampleSessions, '皈敬頌');
    expect(res).toHaveLength(1);
    expect(res[0].session_id).toBe('01');
  });
});
