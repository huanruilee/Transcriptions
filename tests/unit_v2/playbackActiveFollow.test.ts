import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePlayerStore } from '../../src/stores/player';
import { useCourseStore } from '../../src/stores/course';
import { findSentenceIndexByTime } from '../../src/composables/useTimeSync';

describe('Playback Active Follow & Sync Test (CLI/API)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const sampleSentences = [
    { id: 'sent-0', start_time: 0.02, end_time: 1.30, text: '好，我們是第七。' },
    { id: 'sent-1', start_time: 3.28, end_time: 5.56, text: '六十三、六十四左右，對不對。' },
    { id: 'sent-2', start_time: 10.81, end_time: 12.54, text: '這個可以怎麼講。' },
    { id: 'sent-3', start_time: 14.09, end_time: 20.43, text: '總之像《中論》的話，有二十七品。' },
  ];

  it('1. 播放前進時，activeSentence 應精確順向推進且句間呼吸停頓平滑保持', () => {
    const playerStore = usePlayerStore();
    playerStore.setSentences(sampleSentences);

    // t=0s (音訊剛開始，但在第一句開始前)
    playerStore.updateTime(0.0);
    expect(playerStore.activeSentenceIndex).toBe(-1);

    // t=0.5s (第一句播報中)
    playerStore.updateTime(0.5);
    expect(playerStore.activeSentenceIndex).toBe(0);
    expect(playerStore.activeSentenceId).toBe('sent-0');

    // t=2.0s (第一句與第二句之間的空白呼吸停頓，應平滑保持在 sent-0，不突兀閃爍)
    playerStore.updateTime(2.0);
    expect(playerStore.activeSentenceIndex).toBe(0);
    expect(playerStore.activeSentenceId).toBe('sent-0');

    // t=3.5s (第二句播報中)
    playerStore.updateTime(3.5);
    expect(playerStore.activeSentenceIndex).toBe(1);
    expect(playerStore.activeSentenceId).toBe('sent-1');

    // t=11.0s (第三句)
    playerStore.updateTime(11.0);
    expect(playerStore.activeSentenceIndex).toBe(2);
    expect(playerStore.activeSentenceId).toBe('sent-2');

    // t=15.0s (第四句)
    playerStore.updateTime(15.0);
    expect(playerStore.activeSentenceIndex).toBe(3);
    expect(playerStore.activeSentenceId).toBe('sent-3');
  });

  it('2. 真實 toc.json (含 sections 陣列與 timestamp 節點) 不應觸發 nodes is not iterable 異常', () => {
    const courseStore = useCourseStore();
    const realTocPayload = {
      courseId: 'ru-zhong-lun',
      title: '入中論善顯密意疏 全書總科判',
      totalSections: 394,
      sections: [
        {
          title: '【科判導讀】第六現前地概覽',
          sessionId: '02A',
          page: 63,
          timestamp: 0.02,
          sessionIds: ['02A', '02B'],
          children: [
            {
              title: '甲一、釋題義',
              sessionId: '02A',
              page: 63,
              timestamp: 10.81,
              sessionIds: ['02A'],
            },
          ],
        },
      ],
    };

    // 呼叫 setTOC 載入 real payload
    courseStore.setTOC(realTocPayload);

    // 呼叫 computeActiveTOCChain 模擬時間推移，驗證不拋出例外且能解析祖先鏈
    expect(() => {
      const chain1 = courseStore.computeActiveTOCChain(0.05, '02A');
      expect(chain1.length).toBeGreaterThan(0);
      expect(chain1[0].title).toContain('第六現前地概覽');

      const chain2 = courseStore.computeActiveTOCChain(12.0, '02A');
      expect(chain2.length).toBe(2);
      expect(chain2[1].title).toBe('甲一、釋題義');
    }).not.toThrow();
  });

  it('3. 播放倍率切換循環 (1.0x -> 1.2x -> 1.5x -> 2.0x -> 1.0x)', () => {
    const playerStore = usePlayerStore();
    expect(playerStore.playbackRate).toBe(1.0);

    playerStore.cyclePlaybackRate();
    expect(playerStore.playbackRate).toBe(1.2);

    playerStore.cyclePlaybackRate();
    expect(playerStore.playbackRate).toBe(1.5);

    playerStore.cyclePlaybackRate();
    expect(playerStore.playbackRate).toBe(2.0);

    playerStore.cyclePlaybackRate();
    expect(playerStore.playbackRate).toBe(1.0);
  });
});
