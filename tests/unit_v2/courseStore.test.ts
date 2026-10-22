import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCourseStore } from '../../src/stores/course';

describe('CourseStore Test Pattern (TDD)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('初始狀態應支援多課程目錄註冊', () => {
    const store = useCourseStore();
    expect(store.currentCourseId).toBe('ru-zhong-lun');
    expect(store.catalog).toBeDefined();
  });

  it('講次過濾應同時支援講次代碼、頁碼與關鍵字搜尋', () => {
    const store = useCourseStore();
    store.setSessions([
      { id: '01', title: '第 01 講', page: 'p.1', summary: '甲一 釋題義與歸敬頌' },
      { id: '02A', title: '第 02A 講', page: 'p.63', summary: '甲二 釋禮敬' },
      { id: '02B', title: '第 02B 講', page: 'p.75', summary: '正釋空性論體' },
    ]);

    // 代碼過濾
    expect(store.filterSessions('02A')).toHaveLength(1);
    expect(store.filterSessions('02A')[0].id).toBe('02A');

    // 頁碼過濾
    expect(store.filterSessions('p.63')).toHaveLength(1);
    expect(store.filterSessions('p.63')[0].id).toBe('02A');

    // 關鍵字過濾
    expect(store.filterSessions('歸敬頌')).toHaveLength(1);
    expect(store.filterSessions('歸敬頌')[0].id).toBe('01');
  });

  it('科判祖先鏈計算應隨當前播放秒數向上精確回溯', () => {
    const store = useCourseStore();
    const mockTOC = [
      {
        id: 'node-1',
        title: '甲一 釋題義',
        start_time: 0,
        end_time: 500,
        children: [
          {
            id: 'node-1-1',
            title: '乙一 歸敬頌',
            start_time: 50,
            end_time: 200,
            children: [
              {
                id: 'node-1-1-1',
                title: '丙一 讚大悲心',
                start_time: 60,
                end_time: 120,
              },
            ],
          },
        ],
      },
    ];
    store.setTOC(mockTOC);

    // 在 80 秒時，所處祖先鏈應為 甲一 > 乙一 > 丙一
    const chain = store.computeActiveTOCChain(80);
    expect(chain).toHaveLength(3);
    expect(chain[0].title).toBe('甲一 釋題義');
    expect(chain[1].title).toBe('乙一 歸敬頌');
    expect(chain[2].title).toBe('丙一 讚大悲心');

    // 在 300 秒時，所處祖先鏈應僅為 甲一
    const chain2 = store.computeActiveTOCChain(300);
    expect(chain2).toHaveLength(1);
    expect(chain2[0].title).toBe('甲一 釋題義');
  });

  it('深層科判樹（18層以上）在祖先未重複標註當前 sessionId 時，仍應完整保留整條祖先鏈，且嚴格以主講次判定時間錨點', () => {
    const store = useCourseStore();
    const deepTOC = [
      {
        title: '甲三、釋論義',
        sessionId: '85A',
        timestamp: 0,
        children: [
          {
            title: '乙二、正出所造論體',
            sessionId: '87A',
            timestamp: 0,
            children: [
              {
                title: '丙一、因地',
                sessionId: '87A',
                timestamp: 0,
                children: [
                  {
                    title: '辰一、總破他生派',
                    sessionId: '21B',
                    timestamp: 0,
                    children: [
                      {
                        title: '巳三、明破他生之功德',
                        sessionId: '36A',
                        sessionIds: ['36A'],
                        timestamp: 127,
                      },
                      {
                        title: '巳四、明全無自性生',
                        sessionId: '36A',
                        sessionIds: ['36A', '36B'],
                        timestamp: 1609,
                        children: [
                          {
                            title: '午一、破計有自相',
                            sessionId: '36A',
                            sessionIds: ['36A', '36B'],
                            timestamp: 1609,
                            children: [
                              {
                                title: '未一、聖根本智應是破諸法之因',
                                sessionId: '36A',
                                sessionIds: ['36A', '36B'],
                                timestamp: 2105,
                              },
                            ],
                          },
                        ],
                      },
                      {
                        title: '亥一、他講次旁支（僅次要sessionIds含36A）',
                        sessionId: '30B',
                        sessionIds: ['30B', '36A'],
                        timestamp: 78,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    store.setTOC(deepTOC);

    // 1. 即使在 10 秒（早於 127s 第一個科判），仍應 fallback 到 36A 第一個主科判並保留全部祖先
    const earlyChain = store.computeActiveTOCChain(10, '36A');
    expect(earlyChain.map((n) => n.title)).toEqual([
      '甲三、釋論義',
      '乙二、正出所造論體',
      '丙一、因地',
      '辰一、總破他生派',
      '巳三、明破他生之功德',
    ]);

    // 2. 在 2200 秒時，應定位至最深的「未一、聖根本智應是破諸法之因」（共 7 層，絕不只剩最上 2 層）
    const deepChain = store.computeActiveTOCChain(2200, '36A');
    expect(deepChain.map((n) => n.title)).toEqual([
      '甲三、釋論義',
      '乙二、正出所造論體',
      '丙一、因地',
      '辰一、總破他生派',
      '巳四、明全無自性生',
      '午一、破計有自相',
      '未一、聖根本智應是破諸法之因',
    ]);
  });
});
