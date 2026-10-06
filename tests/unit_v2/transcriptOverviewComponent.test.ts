import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TranscriptOverview from '../../src/components/TranscriptOverview.vue';

describe('TranscriptOverview', () => {
  it('renders the three scannable bullet groups with semantic headings', () => {
    const wrapper = mount(TranscriptOverview, {
      props: {
        overview: {
          mainPoints: ['主要內容一'],
          discussionTopics: ['討論議題一'],
          referenceViews: ['參考觀點一'],
          source: 'reviewed',
        },
      },
    });

    expect(wrapper.get('section').attributes('aria-labelledby')).toBe('transcript-overview-title');
    expect(wrapper.get('h2').text()).toBe('本講內容導讀');
    expect(wrapper.findAll('h3').map((node) => node.text())).toEqual([
      '主要內容',
      '討論議題',
      '參考答案／觀點',
    ]);
    expect(wrapper.findAll('li').map((node) => node.text())).toEqual([
      '主要內容一',
      '討論議題一',
      '參考觀點一',
    ]);
  });
});
