// Run with PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser/miniPlayer.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const base = process.env.MINI_PLAYER_URL || 'http://127.0.0.1:4317';
const results = [];
try {
  await page.route('**/courses/**', route => {
    const url = route.request().url();
    const data = url.endsWith('/course.json') ? { sessions: [{ sessionId: '31', title: '測試講次31' }, { sessionId: '32', title: '測試講次32' }] } :
      url.endsWith('/toc.json') ? { nodes: [] } : { youtubeVideoId: 'rlbTRYGbwIM', paragraphs: [{ id: 'p1', start: 0, sentences: [{ id: 's1', start: 0, end: 10, text: '測試講記正文。'.repeat(500) }] }] };
    return route.fulfill({ json: data });
  });
  // Geometry/DOM only. Real YouTube playback requires a separate manual stream check.
  await page.route('**/www.youtube.com/**', route => route.fulfill({ body: '<html></html>', contentType: 'text/html' }));
  await page.goto(`${base}/?course=shi-liang-lun-er#session-31`);
  const player = page.locator('.youtube-player-container');
  await player.waitFor();
  await page.locator('[data-testid="dock-video"]').click();
  for (const width of [1025, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const collapsed of [false, true]) {
      if (collapsed) await page.locator('#sidebar-toggle').click();
      const geometry = await page.evaluate(() => {
        const p = document.querySelector('.youtube-player-container').getBoundingClientRect();
        const m = document.querySelector('.main-reader').getBoundingClientRect();
        const css = getComputedStyle(document.querySelector('.youtube-player-container'));
        return { overlap: Math.max(0, Math.min(p.right,m.right)-Math.max(p.left,m.left))*Math.max(0,Math.min(p.bottom,m.bottom)-Math.max(p.top,m.top)), left: p.left, width: p.width, bottom: innerHeight-p.bottom, right: css.right };
      });
      assert.equal(geometry.overlap, 0, JSON.stringify({ width, collapsed, geometry }));
      assert.equal(geometry.left, 12); assert.equal(geometry.bottom, 68); assert.equal(geometry.width, 280);
      results.push({ width, collapsed, ...geometry });
      if (collapsed) await page.locator('#sidebar-toggle').click();
    }
  }
  await page.locator('#sidebar-resizer').dispatchEvent('mousedown');
  await page.mouse.move(200, 300); await page.mouse.up();
  assert.equal(await page.evaluate(() => document.querySelector('.main-reader').getBoundingClientRect().left >= 292), true);
  await page.evaluate(() => { window.originalMiniIframe = document.querySelector('#youtube-iframe'); window.originalMiniSrc = window.originalMiniIframe.src; });
  await page.locator('[data-testid="hide-video"]').click();
  const hidden = await player.evaluate(el => { const c = getComputedStyle(el); return { opacity:c.opacity, pointer:c.pointerEvents, width:c.width,height:c.height,display:c.display,visibility:c.visibility }; });
  assert.equal(hidden.opacity, '0'); assert.equal(hidden.pointer, 'none'); assert.equal(hidden.width, '1px'); assert.equal(hidden.height, '1px'); assert.notEqual(hidden.display, 'none'); assert.notEqual(hidden.visibility, 'hidden');
  assert.equal(await page.evaluate(() => window.originalMiniIframe === document.querySelector('#youtube-iframe') && window.originalMiniSrc === window.originalMiniIframe.src), true);
  await page.reload(); await player.waitFor();
  assert.match(await player.getAttribute('class'), /audio-only-hidden/);
  await page.evaluate(() => { location.hash = '#session-32'; });
  await page.waitForFunction(() => document.querySelector('.crumb-current').textContent.includes('32'));
  assert.match(await player.getAttribute('class'), /audio-only-hidden/);
  assert.match(await player.getAttribute('class'), /dock-bottom-left/);
  await page.locator('#video-visibility-toggle').click();
  assert.doesNotMatch(await player.getAttribute('class'), /audio-only-hidden/);
  for (const [button, theme, background] of [['#theme-zen-btn', 'zen-dark', 'rgb(18, 17, 16)'], ['#theme-sepia-btn', 'sepia', 'rgb(231, 220, 184)']]) {
    await page.locator(button).click();
    assert.equal(await page.locator('body').getAttribute('data-theme'), theme);
    assert.notEqual(await player.evaluate(el => getComputedStyle(el).borderTopStyle), 'none');
    assert.equal(await page.locator('[data-testid=hide-video]').evaluate(el => getComputedStyle(el).backgroundColor), background);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.locator('#video-visibility-toggle');
  const box = await toggle.boundingBox();
  assert.ok(box && box.x >= 0 && box.x+box.width <= 390 && box.y+box.height <= 844, JSON.stringify(box));
  await toggle.click(); await toggle.click();
  await page.screenshot({ path: '/tmp/mini-player-mobile.png' });
  console.log(JSON.stringify({ passed: true, browserVersion: browser.version(), themesVerified: ['zen-dark', 'sepia'], desktop: results, hidden, mobileToggle: box }, null, 2));
} finally { await browser.close(); }
