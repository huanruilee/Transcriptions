import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StudyScaffoldingPanel, { type StudyScaffolding } from '../../src/components/StudyScaffoldingPanel.vue';

const sampleScaffolding: StudyScaffolding = {
  verses: [{ id: 'v206', label: '第 206 偈', text: '心之自性為光明' }],
  verseMappings: [{ phrase: '心之自性為光明', meaning: '唯明唯知', questionRef: '第 1 題', time: 265 }],
  glossary: [{ term: '客塵', definition: '外來可分離之煩惱' }],
  compassMaps: [
    {
      questionNum: 1,
      title: '第 1 題',
      items: [{ speaker: '如性法師', time: 1820, verdict: 'ok', verdictLabel: '✅ 正理定調', summary: '唯明唯知' }],
    },
  ],
  pauseBoxes: [{ time: 1950, question: '如何被遮蔽？', hint: '思考分水嶺' }],
  comparisonTables: [{ id: 'tbl-1', title: '比較表', headers: ['A', 'B'], rows: [['1', '2']] }],
  selfCheck: [{ q: 'Q1?', a: 'A1.' }],
};

describe('StudyScaffoldingPanel', () => {
  it('renders scaffolding, emits seek on timestamp click, and toggles readingMode', async () => {
    const wrapper = mount(StudyScaffoldingPanel, {
      props: {
        scaffolding: sampleScaffolding,
        readingMode: 'full',
      },
    });

    expect(wrapper.text()).toContain('心之自性為光明');
    await wrapper.find('.seek-chip').trigger('click');
    expect(wrapper.emitted('seek')?.[0]).toEqual([265]);

    await wrapper.find('[data-testid="mode-essence-btn"]').trigger('click');
    expect(wrapper.emitted('update:readingMode')?.[0]).toEqual(['essence']);

    await wrapper.find('[data-testid="scaffolding-tab-compass"]').trigger('click');
    expect(wrapper.text()).toContain('✅ 正理定調');

    await wrapper.find('[data-testid="scaffolding-tab-pause"]').trigger('click');
    expect(wrapper.text()).toContain('如何被遮蔽？');
  });
});
