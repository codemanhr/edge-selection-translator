'use strict';

/**
 * Captures 1280×800 PNGs of the selection panel, options page, and popup.
 * These are fixture shots from headless Chrome for Testing, for the README.
 * Replace them with Microsoft Edge screenshots before store submission.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = 8766;
const DEBUG_PORT = 9334;

function getJson(url) {
  return new Promise(function (resolve, reject) {
    const req = http.get(url, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function messageText(payload) {
  const data = payload && payload.data !== undefined ? payload.data : payload;
  if (typeof data === 'string') return Promise.resolve(data);
  if (Buffer.isBuffer(data)) return Promise.resolve(data.toString('utf8'));
  if (data instanceof ArrayBuffer) return Promise.resolve(Buffer.from(data).toString('utf8'));
  if (ArrayBuffer.isView(data)) {
    return Promise.resolve(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8'));
  }
  return Promise.resolve(String(data));
}

function send(ws, id, method, params) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () { reject(new Error('CDP timeout ' + method)); }, 12000);
    function onMessage(payload) {
      messageText(payload).then(function (text) {
        let msg;
        try { msg = JSON.parse(text); } catch (err) { return; }
        if (!msg || msg.id !== id) return;
        ws.removeEventListener('message', onMessage);
        clearTimeout(timer);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result || {});
      }).catch(reject);
    }
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });
}

function startPageServer() {
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>阅读示例</title>
<style>
  body { margin: 0; background: #f6f4ef; color: #1d2430; font: 18px/1.7 "Segoe UI", "PingFang SC", sans-serif; }
  article { max-width: 720px; margin: 48px auto; padding: 8px 28px 80px; }
  h1 { font-size: 32px; line-height: 1.3; margin-bottom: 8px; }
  .by { color: #667; font-size: 14px; margin-bottom: 28px; }
  p { margin: 0 0 16px; }
  pre { background: #fff; border-radius: 8px; padding: 12px 14px; font-size: 14px; }
</style></head>
<body>
<article>
  <h1>A short note about cities</h1>
  <p class="by">Example page · 选中下面的英文句子</p>
  <p id="sample">Hello translator this is a sentence for selection.</p>
  <p>The panel should sit beside the cursor and stay out of the way of the paragraph you are reading. Proper names such as New York stay as written when that option is on.</p>
  <p>代码块里的文字不会被翻译。</p>
  <pre><code id="code">const skip = true;</code></pre>
</article>
</body></html>`;
  const server = http.createServer(function (req, res) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise(function (resolve) {
    server.listen(PORT, '127.0.0.1', function () { resolve(server); });
  });
}

async function shot(ws, id, file) {
  const result = await send(ws, id, 'Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 },
    captureBeyondViewport: true
  });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(result.data, 'base64'));
}

async function main() {
  const chrome = process.env.CHROME_PATH
    || (fs.existsSync('/tmp/chrome-for-testing/chrome-linux64/chrome')
      ? '/tmp/chrome-for-testing/chrome-linux64/chrome'
      : 'google-chrome');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'est-shot-'));
  const server = await startPageServer();
  fs.mkdirSync(OUT, { recursive: true });
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-default-apps',
    '--disable-sync',
    '--hide-scrollbars',
    '--window-size=1280,800',
    '--force-device-scale-factor=1',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + profile,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--enable-extensions',
    '--disable-extensions-except=' + ROOT,
    '--load-extension=' + ROOT,
    'about:blank'
  ], { stdio: 'ignore' });

  let ws;
  try {
    let targets = [];
    let page;
    let worker;
    for (let i = 0; i < 40; i += 1) {
      try {
        targets = await getJson('http://127.0.0.1:' + DEBUG_PORT + '/json/list');
      } catch (err) {
        await sleep(200);
        continue;
      }
      page = targets.find(function (item) { return item.type === 'page' && item.webSocketDebuggerUrl; });
      if (page) break;
      await sleep(200);
    }
    if (!page) throw new Error('missing page ' + JSON.stringify(targets.map(function (item) {
      return item.type + ' ' + item.url;
    })));
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(function (resolve, reject) {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', function (err) { reject(err.error || err); });
    });
    let seq = 1;
    await send(ws, seq++, 'Page.enable');
    await send(ws, seq++, 'Runtime.enable');
    await send(ws, seq++, 'Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
    });
    await send(ws, seq++, 'Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/read' });
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await sleep(200);
      const injected = await send(ws, seq++, 'Runtime.evaluate', {
        expression: 'Boolean(document.getElementById("est-selection-translator-host"))',
        returnByValue: true
      });
      if (injected.result && injected.result.value === true) break;
      if (attempt === 24) throw new Error('host missing');
    }
    await send(ws, seq++, 'Runtime.evaluate', {
      expression: `(function () {
        const el = document.getElementById('sample');
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const rect = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true, cancelable: true, button: 0,
          clientX: rect.left + 24, clientY: rect.bottom - 4
        }));
        return true;
      })()`,
      returnByValue: true
    });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(250);
      const ready = await send(ws, seq++, 'Runtime.evaluate', {
        expression: `(function () {
          const host = document.getElementById('est-selection-translator-host');
          const body = host && host.shadowRoot && host.shadowRoot.querySelector('[data-role="body"]');
          const text = body ? body.textContent.trim() : '';
          return text && text !== '正在翻译…' && text.indexOf('Hello translator') === -1;
        })()`,
        returnByValue: true
      });
      if (ready.result && ready.result.value === true) break;
      if (attempt === 39) throw new Error('translation not ready');
    }
    await shot(ws, seq++, 'panel.png');

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const list = await getJson('http://127.0.0.1:' + DEBUG_PORT + '/json/list');
      worker = list.find(function (item) {
        return item.type === 'service_worker' && String(item.url || '').indexOf('/src/background/service-worker.js') !== -1;
      });
      if (worker && worker.webSocketDebuggerUrl) break;
      await sleep(200);
    }
    if (!worker) throw new Error('extension service worker missing');
    const extensionId = worker.url.split('/')[2];
    const swSocket = new WebSocket(worker.webSocketDebuggerUrl);
    await new Promise(function (resolve, reject) {
      swSocket.addEventListener('open', resolve);
      swSocket.addEventListener('error', function (err) { reject(err.error || err); });
    });
    await send(swSocket, seq++, 'Runtime.enable');
    const pages = [
      ['options.png', 'src/options/options.html', '划词翻译设置'],
      ['popup.png', 'src/popup/popup.html', '划词翻译']
    ];
    for (let i = 0; i < pages.length; i += 1) {
      const file = pages[i][0];
      const pagePath = pages[i][1];
      const title = pages[i][2];
      const opened = await send(swSocket, seq++, 'Runtime.evaluate', {
        expression: `(async function () {
          const url = chrome.runtime.getURL(${JSON.stringify(pagePath)});
          const tab = await chrome.tabs.create({ url: url, active: true });
          return { url: url, tabId: tab && tab.id };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      const openedValue = opened.result && opened.result.value;
      if (!openedValue || !openedValue.tabId) {
        throw new Error('tabs.create failed ' + JSON.stringify(opened));
      }
      let target;
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const list = await getJson('http://127.0.0.1:' + DEBUG_PORT + '/json/list');
        target = list.find(function (item) {
          return item.type === 'page' && item.url && item.url.indexOf(pagePath) !== -1;
        });
        if (target && target.webSocketDebuggerUrl) break;
        await sleep(150);
      }
      if (!target) throw new Error('target missing for ' + pagePath + ' ' + JSON.stringify(openedValue));
      const pageWs = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise(function (resolve, reject) {
        pageWs.addEventListener('open', resolve);
        pageWs.addEventListener('error', function (err) { reject(err.error || err); });
      });
      await send(pageWs, seq++, 'Page.enable');
      await send(pageWs, seq++, 'Runtime.enable');
      await send(pageWs, seq++, 'Emulation.setDeviceMetricsOverride', {
        width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
      });
      let info = {};
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(150);
        const ready = await send(pageWs, seq++, 'Runtime.evaluate', {
          expression: '({ title: document.title, href: location.href, text: (document.body && document.body.innerText || "").slice(0, 120) })',
          returnByValue: true
        });
        info = (ready.result && ready.result.value) || {};
        if (info.title === title) break;
      }
      if (info.title !== title) throw new Error('page not ready ' + JSON.stringify(info));
      await shot(pageWs, seq++, file);
      pageWs.close();
    }
    swSocket.close();
    process.stdout.write('CAPTURE_OK ' + extensionId + '\n');
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    child.kill('SIGKILL');
    server.close();
    await sleep(250);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch (err) {
        await sleep(150);
      }
    }
  }
}

main().catch(function (err) {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exit(1);
});
