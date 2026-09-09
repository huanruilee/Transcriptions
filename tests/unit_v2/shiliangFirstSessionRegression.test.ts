import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'node:fs';
import path from 'node:path';
import TOCBottomSheet from '../../src/components/TOCBottomSheet.vue';
import App from '../../src/App.vue';

const ROOT = process.cwd();
const COURSE = path.join(ROOT, 'courses/釋量論第二品/course.json');
const SESSION = path.join(ROOT, 'courses/釋量論第二品/sessions/session_01.json');

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

describe('釋量論第二品第一講回歸品質合約', () => {
  it('課程身份與第一講來源必須一致，不得誤載入入中論資料', () => {
    const course = readJson(COURSE);
    const session = readJson(SESSION);

    expect(course.courseId).toBe('shi-liang-lun-er');
    expect(course.lecturer).toBe('如性法師');
    expect(course.sessions).toHaveLength(32);
    expect(course.sessions.find((s: any) => s.sessionId === '01')).toMatchObject({
      youtubeVideoId: 's-zO8jcvI2A',
      jsonUrl: 'courses/釋量論第二品/sessions/session_01.json',
    });
    expect(session.title).toContain('調整學法的動機');
    expect(session.youtubeVideoId).toBe('s-zO8jcvI2A');
  });

  it('第一講已宣告的校對元資料必須保留', () => {
    const session = readJson(SESSION);
    expect(session._meta?.engine).toMatch(/whisper/i);
    expect(session._meta?.llm_proofread).toBeDefined();
    expect(session._meta?.source_text).toContain('session_01_official_raw.txt');
  });

  it('本課科判目錄必須把 start_time 轉成可點擊的播放跳轉按鈕', () => {
    const wrapper = mount(TOCBottomSheet, {
      props: {
        activeSessionId: '01',
        isOpen: true,
        tocNodes: [{
          id: 'sec-1-1',
          title: '一、解釋開經偈',
          sessionId: '01',
          start_time: 18.62,
          end_time: 625,
        }],
      },
    });

    expect(wrapper.find('.sheet-timestamp-btn').exists()).toBe(true);
    expect(wrapper.find('.sheet-timestamp-btn').attributes('data-timestamp')).toBe('18.62');
    expect(wrapper.text()).not.toContain('待標註');
  });
});

describe('釋量論第二品第一講 UI 路由與影音回歸合約', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setActivePinia(createPinia());
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('course.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            sessions: [{
              sessionId: '01', title: '32-1 調整學法的動機', pageRange: '成量品根本頌',
              date: '2018-12-18', summary: '調整學法的動機',
              jsonUrl: 'courses/釋量論第二品/sessions/session_01.json',
              youtubeVideoId: 's-zO8jcvI2A',
            }],
          }),
        });
      }
      if (url.includes('toc.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sections: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          audioUrl: 'https://drive.google.com/uc?export=download&id=test',
          youtubeVideoId: 's-zO8jcvI2A',
          paragraphs: [],
        }),
      });
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('深連結 ?course=shi-liang-lun-er#session-01 必須直接選取釋量論', async () => {
    delete (window as any).location;
    window.location = new URL('https://example.test/?course=shi-liang-lun-er#session-01') as any;
    const wrapper = mount(App);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect((wrapper.find('#course-select').element as HTMLSelectElement).value).toBe('shi-liang-lun-er');
    expect(wrapper.find('.brand-title').text()).toContain('釋量論第二品');
  });

  it('釋量論第一講必須使用 YouTube iframe，不得把 Drive URL 塞入原生 audio', async () => {
    delete (window as any).location;
    window.location = new URL('https://example.test/?course=shi-liang-lun-er#session-01') as any;
    const wrapper = mount(App);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper.find('#youtube-iframe').exists()).toBe(true);
    expect((wrapper.find('#audio-element').element as HTMLAudioElement).src).not.toContain('drive.google.com');
  });
});
