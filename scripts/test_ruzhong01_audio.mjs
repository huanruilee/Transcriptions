#!/usr/bin/env node
import{chromium}from'@playwright/test';import fs from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const[url,audioPath,cacheUrl,output]=process.argv.slice(2);if(!output)throw Error('Usage: readerURL officialAudio localCacheURL output');const root='reviews/evidence/ruzhong01-standard/',a=JSON.parse(fs.readFileSync(root+'audio-source.json')),s=JSON.parse(fs.readFileSync('courses/入中論善顯密意疏/sessions/session_01.json'));assert.equal('sha256:'+createHash('sha256').update(fs.readFileSync(audioPath)).digest('hex'),a.sha256);
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1280,height:900}});let officialMetadata=false,officialError=null;
try{
 await page.route(/https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\//,r=>r.abort());await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.session-reader-notice').waitFor();
 try{await page.waitForFunction(()=>document.querySelector('audio').readyState>=1,{},{timeout:20000});officialMetadata=true}catch(e){officialError=await page.locator('audio').evaluate(a=>({error:a.error?.message||null,src:a.currentSrc}));}
 if(!officialMetadata){await page.locator('audio').evaluate((audio,u)=>{audio.src=u;audio.load()},cacheUrl);await page.waitForFunction(()=>document.querySelector('audio').readyState>=1,{},{timeout:15000});}
 const duration=await page.locator('audio').evaluate(a=>a.duration);assert.ok(Math.abs(duration-a.decodedDuration)<.2);
 const rows=s.paragraphs.flatMap(p=>p.sentences),probes=[];
 for(const row of [rows[0],rows.at(-1)]){
  const target=page.locator(`.paragraph-block > .sentence[id="${row.id}"] > span`).first();await target.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await target.click();await page.waitForFunction(t=>{const a=document.querySelector('audio');return !a.paused&&a.currentTime>=t-.1&&a.currentTime<t+1},row.start,{timeout:15000});const time=await page.locator('audio').evaluate(a=>{const time=a.currentTime;a.pause();return time});probes.push({id:row.id,expected:row.start,actual:time});
 }
 const result={ok:true,sourceSha256:a.sha256,officialNetworkMetadata:officialMetadata,officialNetworkError:officialError,media:officialMetadata?'official live audio':'hash-matched official audio via local byte-range cache; transport not verified',duration,decodedDuration:a.decodedDuration,firstAndLastNativeClicks:probes,humanListened:false};fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');await page.screenshot({path:output.replace(/\.json$/,'.png')});console.log(JSON.stringify(result));
}finally{await browser.close()}
