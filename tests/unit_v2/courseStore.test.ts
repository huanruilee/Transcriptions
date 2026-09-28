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
});
