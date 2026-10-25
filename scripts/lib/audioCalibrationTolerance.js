// Explicit acceptance of small timing changes does not constitute human listening.
export function evaluateTimingTolerance({reference,candidate,evidencePass,toleranceSeconds=0.5}) {
 const valid=x=>x&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.start>=0&&x.end>x.start;
 if(!valid(reference)||!valid(candidate)||!Number.isFinite(toleranceSeconds)||toleranceSeconds<0)return {accepted:false,humanListened:false,reason:'invalid-time'};
 const startDifference=Math.abs(candidate.start-reference.start),endDifference=Math.abs(candidate.end-reference.end);
 return {accepted:evidencePass===true&&startDifference<=toleranceSeconds&&endDifference<=toleranceSeconds,humanListened:false,toleranceSeconds,startDifference,endDifference,reason:evidencePass!==true?'invalid-evidence':Math.max(startDifference,endDifference)>toleranceSeconds?'outside-tolerance':'within-tolerance'};
}
