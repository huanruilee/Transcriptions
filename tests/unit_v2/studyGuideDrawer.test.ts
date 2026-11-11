import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StudyGuideDrawer from '../../src/components/StudyGuideDrawer.vue';

describe('StudyGuideDrawer Component', () => {
  it('renders correctly when open with a studyGuideUrl', () => {
    const wrapper = mount(StudyGuideDrawer, {
      props: {
        isOpen: true,
        studyGuideUrl: '/courses/釋量論第二品/publications/lecture_30_study_guide.html',
        sessionTitle: '32-30 我執是輪迴的根本',
      },
    });

    expect(wrapper.classes()).toContain('open');
    const iframe = wrapper.find('iframe[data-testid="study-guide-iframe"]');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('src')).toBe('/courses/釋量論第二品/publications/lecture_30_study_guide.html');
    expect(wrapper.text()).toContain('32-30 我執是輪迴的根本');
  });

  it('emits close event when close button is clicked', async () => {
    const wrapper = mount(StudyGuideDrawer, {
      props: {
        isOpen: true,
        studyGuideUrl: '/courses/釋量論第二品/publications/lecture_30_study_guide.html',
      },
    });

    const closeBtn = wrapper.find('button[data-testid="close-study-guide-drawer"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('stays hidden or shows empty state when no studyGuideUrl is present', () => {
    const wrapper = mount(StudyGuideDrawer, {
      props: {
        isOpen: false,
        studyGuideUrl: '',
      },
    });

    expect(wrapper.classes()).not.toContain('open');
    expect(wrapper.find('iframe').exists()).toBe(false);
  });
});
