import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

// Expected content and assets come from the checked-out release, not the live page.
const coursePath='courses/釋量論第二品';
const course=JSON.parse(fs.readFileSync(`${coursePath}/course.json`,'utf8'));
const session=course.sessions.find((s:any)=>s.sessionId==='30');
const approved=JSON.parse(fs.readFileSync(`${coursePath}/publications/lecture_30_verbatim_rebuild.json`,'utf8'));
const expectedSentences=approved.sections.flatMap((s:any)=>s.sentences);
const builtIndex=fs.readFileSync('dist/index.html','utf8');
const expectedAssets=[...builtIndex.matchAll(/(?:src|href)="(\/Transcriptions\/assets\/[^"]+)"/g)].map(m=>m[1]);
const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
if(expectedAssets.length < 2 || !session.sourceRebuildInReader)throw new Error('Missing release asset or reader opt-in');

test('original session URL serves the expected release, approved body, and actual download',async({page},testInfo)=>{
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
 await page.goto('?course=shi-liang-lun-er#session-30',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.session-article-title')).toHaveText(session.title);
 await expect(page.locator('.session-header-actions')).toBeVisible();
 await expect(page.locator('.rebuild-tag')).toHaveText(`📖 版面重整：${approved.readingApproval.approvedAt}`);
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
 const downloadPromise=page.waitForEvent('download');
 await downloadButton.click();
 const download=await downloadPromise;
 const downloadPath=await download.path();
 expect(downloadPath).toBeTruthy();
 const text=fs.readFileSync(downloadPath!,'utf8');
 expect(text).toContain('未逐句聽核');
 expect(text).toContain(`講次：30｜${session.title}`);
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
