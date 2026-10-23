import {it,expect} from 'vitest';
import {sessionTocProjection,projectionChain} from '../../src/composables/sessionTocProjection';
it('uses only source-bound session anchors and never leaks them to another lecture',()=>{
 const review={sourceDigest:'sha256:abc',tocProjection:{sourceDigest:'sha256:abc',sessionId:'38A',nodes:[{title:'巳五',sessionId:'38A',timestamp:10,children:[{title:'午二',sessionId:'38A',timestamp:1555}]}]}};
 expect(sessionTocProjection(review,'38A')).toHaveLength(1);
 expect(sessionTocProjection(review,'38B')).toBeNull();
 expect(projectionChain(sessionTocProjection(review,'38A')!,1600).map(n=>n.title)).toEqual(['巳五','午二']);
 expect(projectionChain(sessionTocProjection(review,'38A')!,2)).toEqual([]);
 expect(sessionTocProjection({...review,tocProjection:{...review.tocProjection,sourceDigest:'wrong'}},'38A')).toBeNull();
 expect(sessionTocProjection({...review,tocProjection:{...review.tocProjection,nodes:[{title:'bad',sessionId:'38B',timestamp:2}]}},'38A')).toBeNull();
});
