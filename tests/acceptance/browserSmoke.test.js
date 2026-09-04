// Browser smoke test for the Transcriptions learning platform (Issue #10).
// Verifies the Live URL actually serves a working SPA — sidebar populated,
// first transcript rendered, audio src set, breadcrumb matches title,
// overview button works, no application initialization error.
//
// Requires:
//   - Chrome / Chromium running with --remote-debugging-port and
//     --remote-allow-origins=*
//   - The Live URL reachable (Tailscale Funnel or local HTTP server)
//
// Honors env:
//   CHROME_DEBUG_PORT (default 9222)
//   LIVE_URL (default https://gx10-2887.tail378c21.ts.net/transcriptions/)
//
// If Chrome is not reachable, the test is SKIPPED (with a clear message).
// To force a hard-fail when Chrome is unavailable, set REQUIRE_BROWSER_SMOKE=1.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const DEBUG_PORT = process.env.CHROME_DEBUG_PORT || '9222';
const LIVE_URL = process.env.LIVE_URL || 'https://huanruilee.github.io/Transcriptions/';
const REQUIRE_BROWSER = process.env.REQUIRE_BROWSER_SMOKE === '1';

async function isChromeReachable() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function openTab(url) {
  // CDP /json/new requires PUT
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: DEBUG_PORT,
      path: `/json/new?${encodeURIComponent(url)}`,
      method: 'PUT',
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Bad JSON: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function getTab(url) {
  // Reuse the first 'page' tab if one already points at LIVE_URL host;
  // otherwise open a new one.
  const tabs = await new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
  const liveHost = new URL(url).host;
  for (const t of tabs) {
    if (t.type === 'page' && t.url && t.url.includes(liveHost)) {
      return t;
    }
  }
  return await openTab(url);
}

// Minimal CDP client (no external deps — uses node:http for the
// websocket upgrade handshake is too involved; we require the user to
// have `ws` available via the same venv used by the rest of the
// acceptance suite. If `ws` is unavailable, we skip.
let WebSocketCtor;
try {
  WebSocketCtor = (await import('ws')).WebSocket || (await import('ws')).default;
} catch {
  WebSocketCtor = null;
}

if (!WebSocketCtor) {
  test('browser smoke (Issue #10)', { skip: true }, () => {
    // intentional
  });
  test.skip('browser smoke requires ws package — install with `npm i ws`', () => {});
} else {
  test('browser smoke (Issue #10): Live URL renders a working learning platform', async (t) => {
    if (!(await isChromeReachable())) {
      if (REQUIRE_BROWSER) {
        throw new Error(`Chrome not reachable on 127.0.0.1:${DEBUG_PORT}. Start with: chromium --headless --remote-debugging-port=${DEBUG_PORT} --remote-allow-origins=*`);
      }
      t.skip?.(`Chrome not reachable on 127.0.0.1:${DEBUG_PORT}`);
      return;
    }

    const tab = await getTab(LIVE_URL);
    const ws = new WebSocketCtor(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
    });

    let msgId = 0;
    const pending = new Map();
    const consoleMessages = [];
    const networkResponses = [];
    const exceptions = [];

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
        return;
      }
      const m = msg.method;
      const p = msg.params || {};
      if (m === 'Console.messageAdded') {
        consoleMessages.push({
          level: p.message?.level,
          text: p.message?.text,
          url: p.message?.url,
        });
      } else if (m === 'Runtime.consoleAPICalled') {
        consoleMessages.push({
          level: p.type,
          text: (p.args || []).map(a => a.value ?? a.description ?? '').join(' '),
        });
      } else if (m === 'Runtime.exceptionThrown') {
        const ed = p.exceptionDetails || {};
        exceptions.push({
          text: ed.text,
          desc: ed.exception?.description,
          line: ed.lineNumber,
          col: ed.columnNumber,
          url: ed.url,
        });
      } else if (m === 'Network.responseReceived') {
        networkResponses.push({
          url: p.response.url,
          status: p.response.status,
          ct: (p.response.headers?.['Content-Type'] || p.response.headers?.['content-type'] || '').toLowerCase(),
        });
      }
    });

    const send = (method, params = {}) => {
      msgId += 1;
      const id = msgId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve) => {
        pending.set(id, resolve);
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ timeout: true }); } }, 10000);
      });
    };

    // Enable event domains
    await send('Network.enable');
    await send('Console.enable');
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });

    // Force reload
    await send('Page.reload', { ignoreCache: true });

    // Wait for load + JS fetch + render
    await new Promise(r => setTimeout(r, 25000));

    // Snapshot DOM state
    const evalExpr = (expr) => send('Runtime.evaluate', { expression: expr, returnByValue: true })
      .then(r => r?.result?.result?.value ?? r?.result?.result?.description);

    const sessionCount = await evalExpr("document.querySelectorAll('.session-item').length");
    const transcriptChildren = await evalExpr("document.getElementById('transcript-container')?.children.length");
    const transcriptTextLen = await evalExpr("document.getElementById('transcript-container')?.textContent?.length");
    const audioSrc = await evalExpr("document.getElementById('audio-element')?.getAttribute('src') || '(not set)'");
    const activeTitle = await evalExpr("document.getElementById('active-session-title')?.textContent?.trim()");
    const breadcrumb = await evalExpr("document.querySelector('.breadcrumb-current')?.textContent");

    // Click the course-overview button
    const clickResult = await send('Runtime.evaluate', {
      expression: "document.getElementById('course-overview-btn')?.click(); 'clicked'",
      returnByValue: true,
    });
    await new Promise(r => setTimeout(r, 1500));

    const overviewVisible = await evalExpr(
      "document.getElementById('course-overview') && !document.getElementById('course-overview').classList.contains('hidden')"
    );

    // Check network MIME types
    const important = networkResponses.filter(r =>
      /\/(app|sidebar|toc|syncPlayer|search|a11y)\.js$/.test(r.url) ||
      /\/(main|theme)\.css$/.test(r.url) ||
      /\/courses\/.+\/(course|toc)\.json$/.test(r.url) ||
      /\.mp3$/.test(r.url)
    );
    const wrongMime = important.filter(r => {
      if (/\.js$/.test(r.url)) return !r.ct.startsWith('text/javascript') && !r.ct.startsWith('application/javascript');
      if (/\.css$/.test(r.url)) return !r.ct.startsWith('text/css');
      if (/\.json$/.test(r.url)) return !r.ct.includes('json');
      if (/\.mp3$/.test(r.url)) return !r.ct.startsWith('audio/');
      return false;
    });

    ws.close();

    // Assertions
    await t.test('no application initialization exception in console', () => {
      assert.deepEqual(exceptions, [], `exceptions: ${JSON.stringify(exceptions, null, 2)}`);
    });

    await t.test('sidebar has at least one .session-item', () => {
      assert.ok(sessionCount >= 1, `sessionCount=${sessionCount} (expected >=1, ideally 198-199)`);
    });

    await t.test('initial transcript is not empty', () => {
      assert.ok((transcriptChildren ?? 0) > 0, `transcript children=${transcriptChildren}`);
      assert.ok((transcriptTextLen ?? 0) > 50, `transcript text length=${transcriptTextLen} (expected >50 chars)`);
    });

    await t.test('audio element has a valid src', () => {
      assert.ok(audioSrc && audioSrc !== '(not set)', `audio src=${audioSrc}`);
      assert.match(audioSrc, /\.mp3$|^audio\//i, `audio src should point to an mp3 file: ${audioSrc}`);
    });

    await t.test('course overview button toggles #course-overview', () => {
      assert.ok(clickResult?.result?.result?.value === 'clicked', 'course-overview-btn click should succeed');
      assert.ok(overviewVisible === true, `#course-overview should become visible after click (got ${overviewVisible})`);
    });

    await t.test('title and breadcrumb agree on the same session', () => {
      // activeTitle is e.g. "第 01 堂 | 2016-05-21 | p.63"
      // breadcrumb is e.g. "第 01 堂"
      const titleMatch = activeTitle?.match(/第\s*(\S+?)\s*堂/);
      const bcMatch = breadcrumb?.match(/第\s*(\S+?)\s*堂/);
      assert.ok(titleMatch, `active title should contain "第 N 堂": ${activeTitle}`);
      assert.ok(bcMatch, `breadcrumb should contain "第 N 堂": ${breadcrumb}`);
      assert.equal(titleMatch[1], bcMatch[1], `title session "${titleMatch[1]}" should match breadcrumb "${bcMatch[1]}"`);
    });

    await t.test('all JS/CSS/JSON/MP3 resources have correct Content-Type', () => {
      if (wrongMime.length > 0) {
        for (const w of wrongMime) console.error(`  wrong MIME: ${w.url} -> ${w.ct}`);
      }
      assert.deepEqual(wrongMime, [], `${wrongMime.length} resources have wrong Content-Type`);
    });

    await t.test('no fatal console messages (warning/error that mention init/load)', () => {
      const fatal = consoleMessages.filter(m =>
        (m.level === 'error' || m.level === 'warning') &&
        /init|load|fail|cannot|undefined|TypeError|ReferenceError|SyntaxError/i.test(m.text || '')
      );
      if (fatal.length) {
        for (const f of fatal) console.error(`  fatal: ${f.text}`);
      }
      assert.deepEqual(fatal, [], `${fatal.length} fatal console messages`);
    });
  });
}