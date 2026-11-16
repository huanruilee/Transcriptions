#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {computeSourceDigest,generateOverviewCandidate,hydrateEvidenceQuotes,reviewOverviewCandidate,finalizeOverviewReview,validateContentOverview} from './content_overview_pipeline.mjs';
const root=path.resolve(import.meta.dirname,'..');
const candidate=process.argv[2];
if(!candidate)throw Error('Usage: node scripts/review_session36a_overview.mjs <candidate-session.json>');
const t=JSON.parse(fs.readFileSync(candidate));
const dir=path.join(root,'reviews/evidence/session36a-quality');
const run=process.argv[3] || 'v1';
if(!/^v\d+$/.test(run))throw Error('Invalid run name');
const output=path.join(dir,`overview-${run}.json`);
if(fs.existsSync(output))throw Error('Review evidence already exists; do not overwrite');
const target={courseTitle:'入中論善顯密意疏',sessionId:'36A',sourceTranscriptId:'ru-zhong-lun/session_36A'};
let generated;
if(process.argv[4]) {
 generated=JSON.parse(fs.readFileSync(process.argv[4]));
 delete generated.review;generated.status='candidate';generated.sourceDigest=computeSourceDigest(t);
 // Retain supported content, remove the redundant second explanation of seed continuity,
 // and ask M3 only for the missing late-lecture stance distinction.
 generated.mainPoints=generated.mainPoints.slice(0,3);
 const request={model:'MiniMax-M3',instructions:'只輸出JSON {text,evidence:[{sentenceId}]}。產生一點15至55字繁體摘要，區分講者自己說瓶子自性空即自空，以及引述別派批評格魯派是他空。不得把引述的批評當作格西自宗。只用下列原句ID，最多3句，不輸出quote，不新增教義。',input:JSON.stringify(t.paragraphs[28].sentences),temperature:0.1,max_output_tokens:1024,tool_choice:'none'};
 const response=spawnSync(process.execPath,[path.join(root,'scripts/minimax_responses_call.mjs')],{input:JSON.stringify(request),encoding:'utf8',maxBuffer:1024*1024});
 if(response.status!==0)throw Error(response.stderr);
 const raw=JSON.parse(response.stdout);
 fs.writeFileSync(path.join(dir,`overview-${run}-supplement-response.json`),JSON.stringify({sourceDigest:computeSourceDigest(t),...raw},null,2)+'\n');
 const item=JSON.parse(raw.outputText.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
 item.evidence=(item.evidence || []).map(e=>typeof e==='string'?{sentenceId:e}:e);
 generated.referenceViews.push(item);
 generated.generationReusedFrom=path.relative(root,path.resolve(process.argv[4]));
 generated.supplementGeneratedAt=new Date().toISOString();
} else generated=generateOverviewCandidate(target,t);
const co=hydrateEvidenceQuotes(generated,t);
const validity=validateContentOverview(co,t,target);
if(validity.errors.length)throw Error(JSON.stringify(validity.errors));
const review=reviewOverviewCandidate(co,t);
const result=finalizeOverviewReview(co,review);
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(dir,`overview-${run}-input.json`),JSON.stringify({candidateDigest:'sha256:'+createHash('sha256').update(fs.readFileSync(candidate)).digest('hex'),sourceDigest:result.sourceDigest,command:process.argv.slice(1),createdAt:new Date().toISOString()},null,2)+'\n');
console.log(JSON.stringify({status:result.status,review:result.review},null,2));
if(result.status!=='ai-reviewed')process.exitCode=1;
