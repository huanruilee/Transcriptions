/** A reviewed lecture may supply local anchors without rewriting the course tree. */
export interface SessionAnchor {title:string;sessionId:string;timestamp:number;page?:number;children?:SessionAnchor[];[key:string]:unknown}
export function sessionTocProjection(review:any,sessionId:string):SessionAnchor[]|null {
 const p=review?.tocProjection;
 if(!p||p.sessionId!==sessionId||!review.sourceDigest||p.sourceDigest!==review.sourceDigest||!Array.isArray(p.nodes)||!p.nodes.length)return null;
 const valid=(nodes:any[]):boolean=>nodes.every(n=>n&&typeof n.title==='string'&&n.title.trim()&&n.sessionId===sessionId&&Number.isFinite(n.timestamp)&&n.timestamp>=0&&(!n.children||(Array.isArray(n.children)&&valid(n.children))));
 return valid(p.nodes)?p.nodes:null;
}
export function projectionChain(nodes:SessionAnchor[],time:number):SessionAnchor[]{
 const eligible=nodes.filter(n=>n.timestamp<=time).sort((a,b)=>a.timestamp-b.timestamp);
 const node=eligible.at(-1);
 return node?[node,...projectionChain(node.children||[],time)]:[];
}
