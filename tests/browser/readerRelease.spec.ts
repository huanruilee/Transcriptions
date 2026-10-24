import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

// Expected content and assets come from the checked-out release, not the live page.
const coursePath='courses/釋量論第二品';
const course=JSON.parse(fs.readFileSync(`${coursePath}/course.json`,'utf8'));
const builtIndex=fs.readFileSync('dist/index.html','utf8');
const expectedAssets=[...builtIndex.matchAll(/(?:src|href)="(\/Transcriptions\/assets\/[^"]+)"/g)].map(m=>m[1]);
const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
if(expectedAssets.length < 2)throw new Error('Missing release assets');
const approvedSessions=course.sessions.filter((s:any)=>s.status==='published'&&s.sourceRebuildStatus==='reading-approved');
if(!approvedSessions.length)throw new Error('No approved release cases');
for(const session of approvedSessions){
const sessionId=session.sessionId;
if(!session.sourceRebuildInReader)throw new Error(`Approved session ${sessionId} missing reader opt-in`);
const approved=JSON.parse(fs.readFileSync(`${coursePath}/publications/lecture_${sessionId}_verbatim_rebuild.json`,'utf8'));
const expectedSentences=approved.sections.flatMap((s:any)=>s.sentences);
const source=JSON.parse(fs.readFileSync(`${coursePath}/sessions/session_${sessionId}.json`,'utf8'));

test(`session ${sessionId} original URL serves the approved release and actual download`,async({page},testInfo)=>{
 // External media availability is a separate acceptance gate. Application resources remain real.
 await page.route(/https:\/\/(?:[^/]+\.)?(?:youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)\//,route=>route.abort());
 await page.route(/https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\//,route=>route.abort());
 const appErrors:string[]=[];
 const assetResponses=new Map<string,import('@playwright/test').Response>();
 page.on('response',response=>{
  const pathname=new URL(response.url()).pathname;
  if(expectedAssets.includes(pathname))assetResponses.set(pathname,response);
 });
 page.on('pageerror',error=>appErrors.push(error.message));
 await page.goto(`?course=shi-liang-lun-er#session-${sessionId}`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.session-article-title')).toHaveText(session.title);
 await expect(page.locator('.session-header-actions')).toBeVisible();
 await expect(page.locator('.update-tag.rebuild-tag')).toHaveText(`🕒 重整版最後更新：${approved.readingApproval.approvedAt}`);
 await expect(page.locator('.source-update-tag')).toHaveText(`底稿校正日期：${source.lastUpdated}`);
 await expect(page.locator('.session-reader-notice')).toContainText('未逐句聽核');
 await expect(page.getByRole('link',{name:'重整版原稿對照（本文已套用） →',exact:true})).toBeVisible();
 await expect(page.locator('.transcript-heading')).toHaveText(approved.sections.map((s:any)=>s.heading));
 const sentences=page.locator('.paragraph-block > .sentence');
 await expect(sentences).toHaveCount(expectedSentences.length);
 expect(await sentences.evaluateAll(nodes=>nodes.map(n=>({id:n.id,text:n.textContent}))))
  .toEqual(expectedSentences.map((s:any)=>({id:s.id,text:s.text})));
 await expect.poll(()=>assetResponses.size).toBe(expectedAssets.length);
 for(const asset of expectedAssets){
  const response=assetResponses.get(asset)!;
  expect(response.ok(),`release asset ${asset}`).toBe(true);
  const local=fs.readFileSync('dist/'+asset.slice('/Transcriptions/'.length));
  expect(sha256(await response.body()),`release bytes ${asset}`).toBe(sha256(local));
 }
 // Center the control explicitly: nearest-edge auto-scroll can leave it behind
 // the fixed player on a mobile viewport. Keep normal pointer hit testing enabled.
 const downloadButton=page.locator('#download-transcript-mobile-btn');
 await downloadButton.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
 await expect(downloadButton).toBeInViewport({ratio:1});
 await testInfo.attach('download-hit-target',{body:JSON.stringify(await downloadButton.evaluate(element=>{
  const r=element.getBoundingClientRect();
  const target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return {rect:r.toJSON(),target:target?.outerHTML,viewport:{width:innerWidth,height:innerHeight,scale:visualViewport?.scale}};
 })),contentType:'application/json'});
 if(testInfo.project.name==='mobile'){
  const viewport=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  expect(viewport.width,'mobile layout viewport must match configured width').toBe(testInfo.project.use.viewport!.width);
  expect(viewport.scrollWidth,'mobile page must not overflow horizontally').toBeLessThanOrEqual(testInfo.project.use.viewport!.width);
 }
 const downloadPromise=page.waitForEvent('download');
 if(testInfo.project.name==='mobile')await downloadButton.tap();
 else await downloadButton.click();
 const download=await downloadPromise;
 const downloadPath=await download.path();
 expect(downloadPath).toBeTruthy();
 const text=fs.readFileSync(downloadPath!,'utf8');
 expect(text).toContain('未逐句聽核');
 expect(text).toContain(`重整版最後更新：${approved.readingApproval.approvedAt}`);
 expect(text).toContain(`底稿校正日期：${source.lastUpdated}`);
 expect(text).not.toContain(`最後更新：${source.lastUpdated}`);
 expect(text).toContain(`講次：${sessionId}｜${session.title}`);
 expect(text.split('\n').filter(line=>line.startsWith('【'))).toEqual(approved.sections.map((s:any)=>s.heading));
 expect(text.match(/^\[\d\d:\d\d:\d\d\]/gm)).toHaveLength(expectedSentences.length);
 const stamp=(n:number)=>[Math.floor(n/3600),Math.floor(n%3600/60),Math.floor(n%60)].map(v=>String(v).padStart(2,'0')).join(':');
 expect(text.split('\n').filter(l=>/^\[\d\d:\d\d:\d\d\]/.test(l)))
  .toEqual(expectedSentences.map((s:any)=>`[${stamp(s.start)}] ${s.text.trim()}`));
 expect(appErrors).toEqual([]);
 await page.locator('.session-article-title').scrollIntoViewIfNeeded();
 const screenshotPath=testInfo.outputPath('reader-release.png');
 await page.screenshot({path:screenshotPath});
 await testInfo.attach('reader-release',{path:screenshotPath,contentType:'image/png'});
});

}
