import {it,expect} from 'vitest';
import {sessionTocProjection,projectionChain} from '../../src/composables/sessionTocProjection';
import {mount} from '@vue/test-utils';
import TOCAccordion from '../../src/components/TOCAccordion.vue';
it('keeps the full book available when a lecture uses corrected local anchors',async()=>{
 const wrapper=mount(TOCAccordion,{props:{activeSessionId:'38A',tocNodes:[{title:'當講已校定位',sessionId:'38A',timestamp:10}],bookTocNodes:[{title:'全書其他章',sessionId:'39A',timestamp:20}]}});
 expect(wrapper.text()).toContain('當講已校定位');expect(wrapper.text()).not.toContain('全書其他章');
 await wrapper.findAll('button').find(b=>b.text()==='全書總科判')!.trigger('click');
 expect(wrapper.text()).toContain('全書其他章');wrapper.unmount();
});
it('uses only source-bound session anchors and never leaks them to another lecture',()=>{
 const review={sourceDigest:'sha256:abc',tocProjection:{sourceDigest:'sha256:abc',sessionId:'38A',nodes:[{title:'巳五',sessionId:'38A',timestamp:10,children:[{title:'午二',sessionId:'38A',timestamp:1555}]}]}};
 expect(sessionTocProjection(review,'38A')).toHaveLength(1);
 expect(sessionTocProjection(review,'38B')).toBeNull();
 expect(projectionChain(sessionTocProjection(review,'38A')!,1600).map(n=>n.title)).toEqual(['巳五','午二']);
 expect(projectionChain(sessionTocProjection(review,'38A')!,2)).toEqual([]);
 expect(sessionTocProjection({...review,tocProjection:{...review.tocProjection,sourceDigest:'wrong'}},'38A')).toBeNull();
 expect(sessionTocProjection({...review,tocProjection:{...review.tocProjection,nodes:[{title:'bad',sessionId:'38B',timestamp:2}]}},'38A')).toBeNull();
});
