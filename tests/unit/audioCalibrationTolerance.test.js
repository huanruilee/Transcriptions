import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateTimingTolerance} from '../../scripts/lib/audioCalibrationTolerance.js';
const compare=(reference,candidate,evidencePass=true)=>evaluateTimingTolerance({reference,candidate,evidencePass,toleranceSeconds:0.5});
test('accept both boundary differences at or below 0.5 seconds without claiming listening',()=>{
 for(const difference of [0,0.49,0.5]){const r=compare({start:100,end:110},{start:100+difference,end:110-difference});assert.equal(r.accepted,true);assert.equal(r.humanListened,false);}
});
test('reject either boundary above tolerance, invalid intervals and failed acoustic evidence',()=>{
 assert.equal(compare({start:100,end:110},{start:100.51,end:110}).accepted,false);
 assert.equal(compare({start:100,end:110},{start:100,end:110.51}).accepted,false);
 for(const bad of [{start:null,end:110},{start:NaN,end:110},{start:110,end:100},{start:-1,end:10}])assert.equal(compare({start:100,end:110},bad).accepted,false);
 assert.equal(compare({start:100,end:110},{start:100,end:110},false).accepted,false);
});
