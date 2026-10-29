
import fs from 'node:fs';
import OpenCC from 'opencc-js';
const REPO='/home/henry/.gx10/xiaofa/workspace/Transcriptions';
const cc=OpenCC.Converter({from:'cn',to:'twp'});
const strip=(t)=>t.replace(/[\s，、。．.,；;：:！!？?（）()「」『』《》—…\-]/g,'');
const raw=JSON.parse(fs.readFileSync(REPO+'/reviews/evidence/sanzhuyaodao/playlist-01/raw_asr.json','utf8'));
const cand=JSON.parse(fs.readFileSync(REPO+'/courses/三主要道/sessions/session_01/candidate.json','utf8'));
fs.writeFileSync('/tmp/szyd/norm.json', JSON.stringify({
  raw: raw.segments.map(s=>({id:s.id,start:s.start,end:s.end,n:strip(cc(s.text))})),
  cand: cand.segments.map(s=>({id:s.id,start:s.start,end:s.end,n:strip(cc(s.rawText??s.text))})),
}));
console.log('OK');
