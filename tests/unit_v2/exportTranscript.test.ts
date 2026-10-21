import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildTranscriptFilename,
  downloadTranscriptFile,
  formatTranscriptText,
} from '../../src/composables/useExportTranscript';

describe('Transcript download contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('formats the active session as traceable UTF-8 plain text', () => {
    const text = formatTranscriptText(
      {
        courseTitle: '釋量論第二品',
        sessionId: '32A',
        sessionTitle: '量與所量',
        pageRange: 'p.101-p.103',
        lastUpdated: '2026-09-28 10:30:00',
        transcriptStatus: 'review-ready',
      },
      [
        {
          heading: '【科判】正說量之建立',
          sentences: [
            { start_time: 5.2, text: '第一句。' },
            { start: 65.9, text: '第二句。' },
          ],
        },
        {
          heading: '',
          sentences: [{ start_time: 3661, text: '第三句。' }],
        },
      ],
      {
        mainPoints: ['量與所量的關係'],
        discussionTopics: ['現量如何成立？'],
        referenceViews: ['現量離分別且不錯亂。'],
        source: 'reviewed',
      },
    );

    expect(text).toContain('課程：釋量論第二品');
    expect(text).toContain('講次：32A｜量與所量');
    expect(text).toContain('底本頁碼：p.101-p.103');
    expect(text).toContain('逐字稿狀態：review-ready');
    expect(text).toContain('最後更新：2026-09-28 10:30:00');
    expect(text).toContain('本講內容導讀');
    expect(text).toContain('主要內容\n- 量與所量的關係');
    expect(text).toContain('討論議題\n- 現量如何成立？');
    expect(text).toContain('參考答案／觀點\n- 現量離分別且不錯亂。');
    expect(text.match(/【科判】正說量之建立/g)).toHaveLength(1);
    expect(text).toContain('[00:00:05] 第一句。');
    expect(text).toContain('[00:01:05] 第二句。');
    expect(text).toContain('[01:01:01] 第三句。');
  });

  it('prefers verbatimSentences (with speaker tags) when exporting calibrated oral transcripts', () => {
    const text = formatTranscriptText(
      {
        courseTitle: '入中論善顯密意疏',
        sessionId: '36B',
        sessionTitle: '第 36B 講',
        pageRange: 'p.114-p.115',
      },
      [
        {
          heading: '【科判】4. 課堂深度問答',
          sentences: [{ start_time: 804, text: '精煉講記濃縮文字。' }],
          verbatimSentences: [
            { start: 804.82, speaker: '學員', text: '格西，我想請問瓶以瓶空是變成斷空嗎？' },
            { start: 843.22, speaker: '格西', text: '如果有人知道它是斷空而棄之如敝屣，那是對的。' },
          ],
        },
      ],
    );

    expect(text).toContain('[00:13:24] 【學員】格西，我想請問瓶以瓶空是變成斷空嗎？');
    expect(text).toContain('[00:14:03] 【格西】如果有人知道它是斷空而棄之如敝屣，那是對的。');
    expect(text).not.toContain('精煉講記濃縮文字。');
  });

  it('keeps empty sessions explicit instead of creating a misleading transcript', () => {
    const text = formatTranscriptText(
      { courseTitle: '四念住', sessionId: '01', sessionTitle: '第一講' },
      [],
    );

    expect(text).toContain('（本講次目前沒有可下載的逐字稿內容）');
  });

  it('builds a filesystem-safe text filename', () => {
    expect(buildTranscriptFilename('釋量論／第二品:研討', '32A')).toBe(
      '釋量論／第二品_研討_第32A講_逐字稿.txt',
    );
  });

  it('downloads a text blob and revokes the object URL', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:transcript');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadTranscriptFile('逐字稿.txt', '內容');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:transcript');
    expect(document.querySelector('a[download="逐字稿.txt"]')).toBeNull();
  });
});
