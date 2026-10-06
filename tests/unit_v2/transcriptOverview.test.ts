import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildTranscriptOverview } from '../../src/composables/useTranscriptOverview';

describe('transcript overview contract', () => {
  it('prefers an explicitly reviewed overview and removes duplicate or blank bullets', () => {
    const overview = buildTranscriptOverview(
      {
        contentOverview: {
          mainPoints: [' 量與所量的關係 ', '量與所量的關係', ''],
          discussionTopics: ['現量是否必須離分別？'],
          referenceViews: ['現量離分別，且不錯亂。'],
        },
        paragraphs: [{ heading: '不應覆蓋人工摘要', sentences: [] }],
      },
      { title: '第 32 講', summary: '課程層級摘要' },
    );

    expect(overview).toEqual({
      mainPoints: ['量與所量的關係'],
      discussionTopics: ['現量是否必須離分別？'],
      referenceViews: ['現量離分別，且不錯亂。'],
      source: 'reviewed',
    });
  });

  it('builds a source-grounded overview from headings, questions, and teacher summaries', () => {
    const overview = buildTranscriptOverview(
      {
        discussionQuestions: [
          {
            displayQuestion: '本講以森林譬喻說明依蘊假立的我。請問森林在何種意義下存在？',
            teacherSummary: {
              items: [
                '森林需要支分聚合與分別假立，兩個條件缺一不可。',
                '「找不到」不等於世俗名言中的不存在。',
              ],
            },
          },
        ],
        paragraphs: [
          { heading: '【科判導讀】依蘊假立', sentences: [] },
          { heading: '【科判導讀】森林譬喻', sentences: [] },
        ],
      },
      { title: '第 27 講（下）' },
    );

    expect(overview.mainPoints).toEqual(['依蘊假立', '森林譬喻']);
    expect(overview.discussionTopics).toEqual([
      '本講以森林譬喻說明依蘊假立的我。請問森林在何種意義下存在？',
    ]);
    expect(overview.referenceViews).toEqual([
      '森林需要支分聚合與分別假立，兩個條件缺一不可。',
      '「找不到」不等於世俗名言中的不存在。',
    ]);
    expect(overview.source).toBe('derived');
  });

  it('uses existing session metadata as the safe fallback for lecture transcripts', () => {
    const overview = buildTranscriptOverview(
      {
        paragraphs: [
          { heading: '【科判導讀】第六現前地概覽', sentences: [] },
          { heading: '般若波羅蜜多增勝', sentences: [] },
        ],
      },
      {
        title: '第 2A 堂',
        summary: '甲二 釋禮敬 ・ 本講解釋第六現前地的名稱由來、般若波羅蜜多的重要性，以及緣起真實性的現見。',
      },
    );

    expect(overview.mainPoints).toEqual(['第六現前地概覽', '般若波羅蜜多增勝']);
    expect(overview.discussionTopics).toEqual([
      '本講解釋第六現前地的名稱由來、般若波羅蜜多的重要性，以及緣起真實性的現見。',
    ]);
    expect(overview.referenceViews).toEqual([
      '本講解釋第六現前地的名稱由來、般若波羅蜜多的重要性，以及緣起真實性的現見。',
    ]);
  });

  it('returns no overview for a pending transcript with no grounded content', () => {
    expect(buildTranscriptOverview({ paragraphs: [] }, { title: '影片待轉錄' })).toBeNull();
  });

  it('provides all three overview groups for every published transcript', () => {
    const coursesRoot = path.resolve('courses');
    const failures: string[] = [];

    for (const courseDirectory of fs.readdirSync(coursesRoot)) {
      const coursePath = path.join(coursesRoot, courseDirectory, 'course.json');
      if (!fs.existsSync(coursePath)) continue;
      const course = JSON.parse(fs.readFileSync(coursePath, 'utf8'));

      for (const session of course.sessions || []) {
        if (session.transcriptStatus === 'not-transcribed') continue;
        const transcriptPath = path.join(
          coursesRoot,
          courseDirectory,
          'sessions',
          `session_${session.sessionId}.json`,
        );
        if (!fs.existsSync(transcriptPath)) continue;
        const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
        const overview = buildTranscriptOverview(transcript, session);
        if (!overview
          || overview.mainPoints.length === 0
          || overview.discussionTopics.length === 0
          || overview.referenceViews.length === 0) {
          failures.push(`${courseDirectory}/${session.sessionId}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
