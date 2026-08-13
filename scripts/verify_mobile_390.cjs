// 390px 手機寬度水平溢出驗證（CDP 方式）
// 啟動 headless chromium，用 CDP 設定 viewport 390px，測量 scrollWidth vs clientWidth
const { spawn } = require('child_process');
const http = require('http');

const CHROME = '/snap/bin/chromium';
const URL = 'https://gx10-2887.tail378c21.ts.net:9090/index.html';
const PORT = 9223;

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  // 啟動 headless chromium
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--window-size=390,844',
    'about:blank'
  ], { stdio: 'ignore' });

  // 等待 devtools 就緒
  let targets;
  for (let i = 0; i < 30; i++) {
    try {
      targets = await getJson(`http://127.0.0.1:${PORT}/json`);
      if (targets.length) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!targets || !targets.length) {
    console.error('無法連到 chromium devtools');
    chrome.kill();
    process.exit(1);
  }

  // 找 page target
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let msgId = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  };

  await new Promise((resolve) => ws.onopen = resolve);

  // 設定 viewport 390px
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true
  });

  // 導航到實際頁面
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 6000)); // 等頁面載入 + JS 執行

  // 測量水平溢出
  const result = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      bodyScrollWidth: document.body.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyNoOverflow: document.body.scrollWidth <= document.documentElement.clientWidth,
      docNoOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      viewportWidth: window.innerWidth,
      hasSearchStatus: !!document.getElementById('search-status'),
      hasSearchCurrent: !!document.querySelector('.search-current')
    })`,
    returnByValue: true
  });

  console.log('390px 驗證結果:', result.result.value);

  // 也測量 768px 和 1024px
  for (const w of [768, 1024]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: 900, deviceScaleFactor: 1, mobile: w <= 768
    });
    await new Promise(r => setTimeout(r, 1500));
    const r2 = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        bodyScrollWidth: document.body.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
        bodyNoOverflow: document.body.scrollWidth <= document.documentElement.clientWidth,
        viewportWidth: window.innerWidth
      })`,
      returnByValue: true
    });
    console.log(`${w}px 驗證結果:`, r2.result.value);
  }

  ws.close();
  chrome.kill();
}

main().catch(e => { console.error('錯誤:', e); process.exit(1); });
