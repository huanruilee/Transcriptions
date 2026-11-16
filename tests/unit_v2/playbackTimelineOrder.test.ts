import {it,expect,beforeEach} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {usePlayerStore} from '../../src/stores/player';
beforeEach(()=>setActivePinia(createPinia()));
it('follows audio chronology while preserving approved reading order and display indices',()=>{
 const rows=[{id:'previous',text:'之前的例子',start_time:953.26,end_time:960.41},{id:'now',text:'現在的例子',start_time:948.16,end_time:952.70},{id:'next',text:'下一例',start_time:965,end_time:970}];
 const snapshot=structuredClone(rows);const p=usePlayerStore();p.setSentences(rows);
 for(const [time,id,index] of [[949,'now',1],[956,'previous',0],[966,'next',2],[950,'now',1]] as const){p.updateTime(time);expect(p.activeSentenceId).toBe(id);expect(p.activeSentenceIndex).toBe(index);expect(p.sentences[index].id).toBe(id);}
 expect(rows).toEqual(snapshot);expect(p.sentences.map(s=>s.id)).toEqual(['previous','now','next']);
});
it('uses the audio ending rather than the last displayed sentence to clear highlights',()=>{
 const p=usePlayerStore();p.setSentences([{id:'late',text:'後播先讀',start_time:30,end_time:40},{id:'early',text:'先播後讀',start_time:10,end_time:20}]);
 p.updateTime(35);expect(p.activeSentenceId).toBe('late');p.updateTime(42);expect(p.activeSentenceId).toBeNull();
});
it('selects a newly starting sentence at an exact shared boundary',()=>{
 const p=usePlayerStore();p.setSentences([{id:'a',text:'甲',start_time:0,end_time:10},{id:'b',text:'乙',start_time:10,end_time:20}]);p.updateTime(10);expect(p.activeSentenceId).toBe('b');
});
it('replaces cached chronology on session changes and excludes invalid timings',()=>{
 const p=usePlayerStore();p.setSentences([{id:'bad',text:'待核',start_time:NaN,end_time:NaN},{id:'valid',text:'有效',start_time:10,end_time:15}]);p.updateTime(12);expect(p.activeSentenceIndex).toBe(1);
 p.setSentences([{id:'new',text:'新講',start_time:2,end_time:3}]);p.updateTime(12);expect(p.activeSentenceId).toBeNull();p.updateTime(2.5);expect(p.activeSentenceId).toBe('new');
});
