// 驗證搜尋 UX + 99B 缺音檔標記（CDP 方式）
const { spawn } = require('child_process');
const http = require('http');

const CHROME = '/snap/bin/chromium';
const URL = 'https://gx10-2887.tail378c21.ts.net:9090/index.html';
const PORT = 9224;

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
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1280,900', 'about:blank'
  ], { stdio: 'ignore' });

  let targets;
  for (let i = 0; i < 30; i++) {
    try {
      targets = await getJson(`http://127.0.0.1:${PORT}/json`);
      if (targets.length) break;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
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

  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 6000));

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result.value;
  };

  // 1. 檢查 99B 缺音檔標記
  const gap = await evalJs(`(() => {
    const items = [...document.querySelectorAll('.session-item')];
    const gapItem = items.find(li => li.classList.contains('session-unavailable'));
    return gapItem ? {
      title: gapItem.querySelector('.session-title')?.textContent,
      meta: gapItem.querySelector('.session-meta')?.textContent,
      disabled: gapItem.getAttribute('aria-disabled')
    } : '未找到 99B 缺音檔標記';
  })()`);
  console.log('99B 缺音檔標記:', JSON.stringify(gap));

  // 2. 搜尋功能：輸入關鍵字
  await evalJs(`(() => {
    const input = document.getElementById('search-input');
    input.value = '般若';
    input.dispatchEvent(new Event('input'));
  })()`);
  await new Promise(r => setTimeout(r, 500));

  const search1 = await evalJs(`(() => {
    const hits = document.querySelectorAll('.sentence.search-hit').length;
    const current = document.querySelectorAll('.sentence.search-current').length;
    const status = document.getElementById('search-status');
    return {
      hitCount: hits,
      currentCount: current,
      statusText: status ? status.textContent : '(無 status)',
      statusHidden: status ? status.hidden : null
    };
  })()`);
  console.log('搜尋「般若」:', JSON.stringify(search1));

  // 3. Enter 跳下一筆
  await evalJs(`(() => {
    const input = document.getElementById('search-input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  })()`);
  await new Promise(r => setTimeout(r, 300));
  const search2 = await evalJs(`(() => {
    const status = document.getElementById('search-status');
    return { statusText: status ? status.textContent : '(無)' };
  })()`);
  console.log('Enter 後 status:', JSON.stringify(search2));

  // 4. Escape 清除
  await evalJs(`(() => {
    const input = document.getElementById('search-input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  })()`);
  await new Promise(r => setTimeout(r, 300));
  const search3 = await evalJs(`(() => {
    const hits = document.querySelectorAll('.sentence.search-hit').length;
    const status = document.getElementById('search-status');
    const inputVal = document.getElementById('search-input').value;
    return { hitCount: hits, statusHidden: status ? status.hidden : null, inputVal };
  })()`);
  console.log('Escape 後:', JSON.stringify(search3));

  ws.close();
  chrome.kill();
}

main().catch(e => { console.error('錯誤:', e); process.exit(1); });
