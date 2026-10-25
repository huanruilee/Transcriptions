#!/usr/bin/env node
import {chromium}from'@playwright/test';import fs from'node:fs';import assert from'node:assert/strict';
const [url,manifestPath,outputPath]=process.argv.slice(2);if(!outputPath)throw new Error('Usage: URL manifest output');
const manifest=JSON.parse(fs.readFileSync(manifestPath));const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(url);await page.locator('article').first().waitFor();
 for(const session of manifest.sessions){await page.locator('#session').selectOption(session.id);assert.equal(await page.locator('article').count(),session.summary.pending);}
 await page.locator('#session').selectOption('30');await page.locator('#filter').selectOption('order');assert.equal(await page.locator('article[data-id="sent-101"]').count(),1);assert.equal(await page.locator('article[data-id="sent-102"]').count(),1);
 await page.locator('#filter').selectOption('pending');const card=page.locator('article').first();const id=await card.getAttribute('data-id');const item=manifest.sessions[0].items.find(i=>i.id===id);
 await card.locator('.play').click();await page.waitForFunction(()=>{const a=document.querySelector('audio');return a.readyState>=1&&!a.paused&&a.currentTime>0;});
 const time=await page.locator('audio').evaluate(a=>a.currentTime);assert.ok(time>=item.contextStart-0.1&&time<item.contextStart+5);
 await page.locator('audio').evaluate(a=>a.pause());
 await card.locator('.decision').selectOption('confirm');assert.equal(await card.locator('.decision').inputValue(),'uncertain');
 await card.locator('.listened').check();await card.locator('.decision').selectOption('confirm');assert.equal(await card.locator('.decision').inputValue(),'confirm');
 await page.locator('#export').click();assert.match(await page.locator('#message').textContent(),/姓名/);
 await page.locator('#reviewer').fill('工程測試，非實際聽核');const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;const payload=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
 assert.equal(payload.packageVersion,manifest.version);assert.equal(payload.automaticPublication,false);assert.equal(payload.items.length,1);assert.equal(payload.items[0].sourceDigest,manifest.sessions[0].sourceDigest);assert.equal(payload.items[0].audioSha256,manifest.sessions[0].audioSha256);assert.deepEqual(errors,[]);
 const evidence={ok:true,scope:'local review UI engineering only; synthetic reviewer interaction, no human listening acceptance',sessions:manifest.sessions.map(s=>({id:s.id,...s.summary})),audioSeek:{id,expected:item.contextStart,actual:time},exportSourceBound:true};fs.writeFileSync(outputPath,JSON.stringify(evidence,null,2)+'\n');await page.screenshot({path:outputPath.replace(/\.json$/,'.png'),fullPage:false});console.log(JSON.stringify(evidence));
}finally{await browser.close()}
