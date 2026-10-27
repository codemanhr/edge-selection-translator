'use strict';

/**
 * Loads the unpacked extension in headless Chrome and checks that the
 * content script mounts a shadow-DOM panel after a text selection.
 * Exits 0 on success. Prints SKIP if Chrome cannot load extensions here.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8765;
const DEBUG_PORT = 9333;

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

function startPageServer() {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>est fixture</title></head>
<body>
<p id="sample">Hello translator this is a sentence for selection.</p>
<pre><code id="code">const skip = true;</code></pre>
</body></html>`;
  const server = http.createServer(function (req, res) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise(function (resolve) {
    server.listen(PORT, '127.0.0.1', function () { resolve(server); });
  });
}

async function waitForJson(url, attempts) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await getJson(url);
    } catch (err) {
      last = err;
      await sleep(200);
    }
  }
  throw last;
}

function messageText(payload) {
  const data = payload && payload.data !== undefined ? payload.data : payload;
  if (typeof data === 'string') return Promise.resolve(data);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) return Promise.resolve(data.toString('utf8'));
  if (data instanceof ArrayBuffer) return Promise.resolve(Buffer.from(data).toString('utf8'));
  if (ArrayBuffer.isView(data)) {
    return Promise.resolve(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8'));
  }
  if (data && typeof data.text === 'function') return data.text();
  return Promise.resolve(String(data));
}

function send(ws, id, method, params) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error('CDP timeout ' + method));
    }, 8000);
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

async function main() {
  const chrome = process.env.CHROME_PATH
    || (fs.existsSync('/tmp/chrome-for-testing/chrome-linux64/chrome')
      ? '/tmp/chrome-for-testing/chrome-linux64/chrome'
      : 'google-chrome');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'est-chrome-'));
  const server = await startPageServer();
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-default-apps',
    '--disable-sync',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + profile,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    '--enable-extensions',
    '--disable-extensions-except=' + ROOT,
    '--load-extension=' + ROOT,
    'http://127.0.0.1:' + PORT + '/fixture'
  ], { stdio: 'ignore' });

  let ws;
  try {
    const targets = await waitForJson('http://127.0.0.1:' + DEBUG_PORT + '/json/list', 40);
    const page = targets.find(function (item) { return item.type === 'page'; });
    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error('no page target: ' + JSON.stringify(targets.map(function (item) {
        return item.type + ' ' + item.url;
      })));
    }
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(function (resolve, reject) {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', function (err) { reject(err.error || err); });
    });
    await send(ws, 1, 'Runtime.enable');
    await send(ws, 2, 'Page.enable');
    await send(ws, 3, 'Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/fixture' });
    let injected = null;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await sleep(200);
      injected = await send(ws, 20 + attempt, 'Runtime.evaluate', {
        expression: `({
          href: location.href,
          host: Boolean(document.getElementById('est-selection-translator-host'))
        })`,
        returnByValue: true
      });
      if (injected.result && injected.result.value && injected.result.value.host) break;
    }
    if (!injected.result || !injected.result.value || injected.result.value.host !== true) {
      throw new Error('content script did not mount host: ' + JSON.stringify(injected));
    }
    const shown = await send(ws, 3, 'Runtime.evaluate', {
      expression: `(function () {
        const el = document.getElementById('sample');
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        el.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true, cancelable: true, button: 0, clientX: 40, clientY: 40
        }));
        return 'dispatched';
      })()`,
      returnByValue: true
    });
    if (!shown.result || shown.result.value !== 'dispatched') {
      throw new Error('selection dispatch failed ' + JSON.stringify(shown));
    }
    await sleep(300);
    const panel = await send(ws, 4, 'Runtime.evaluate', {
      expression: `(function () {
        const host = document.getElementById('est-selection-translator-host');
        if (!host || !host.shadowRoot) return { ok: false, reason: 'missing host' };
        const original = host.shadowRoot.querySelector('[data-role="original"]');
        const body = host.shadowRoot.querySelector('[data-role="body"]');
        const target = host.shadowRoot.querySelector('[data-role="target"]');
        const text = ((original && original.textContent) || '') + ' ' + ((body && body.textContent) || '');
        return {
          ok: host.style.display !== 'none' && text.indexOf('Hello translator') !== -1 && !!(target && target.options && target.options.length > 1),
          display: host.style.display,
          text: text,
          targetCount: target && target.options ? target.options.length : 0
        };
      })()`,
      returnByValue: true
    });
    const value = panel.result && panel.result.value;
    if (!value || !value.ok) {
      throw new Error('panel did not show selection: ' + JSON.stringify(panel));
    }
    const dismissed = await send(ws, 5, 'Runtime.evaluate', {
      expression: `(function () {
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 2, clientY: 2 }));
        const host = document.getElementById('est-selection-translator-host');
        return host ? host.style.display : 'missing';
      })()`,
      returnByValue: true
    });
    if (!dismissed.result || dismissed.result.value !== 'none') {
      throw new Error('outside click did not dismiss: ' + JSON.stringify(dismissed));
    }
    if (process.argv.indexOf('--e2e') !== -1) {
      await send(ws, 6, 'Runtime.evaluate', {
        expression: `(function () {
          const el = document.getElementById('sample');
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          el.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true, cancelable: true, button: 0, clientX: 48, clientY: 48
          }));
          return true;
        })()`,
        returnByValue: true
      });
      let translated = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await sleep(250);
        translated = await send(ws, 200 + attempt, 'Runtime.evaluate', {
          expression: `(function () {
            const host = document.getElementById('est-selection-translator-host');
            if (!host || !host.shadowRoot || host.style.display === 'none') return { ready: false };
            const body = host.shadowRoot.querySelector('[data-role="body"]');
            const status = host.shadowRoot.querySelector('[data-role="status"]');
            const meta = host.shadowRoot.querySelector('[data-role="meta"]');
            const text = body ? body.textContent.trim() : '';
            const ready = text && text !== '正在翻译…' && text.indexOf('Hello translator') === -1;
            return { ready: ready, text: text, status: status ? status.textContent : '', meta: meta ? meta.textContent : '' };
          })()`,
          returnByValue: true
        });
        if (translated.result && translated.result.value && translated.result.value.ready) break;
      }
      const value = translated && translated.result && translated.result.value;
      if (!value || !value.ready || !/[\u4e00-\u9fff]/.test(value.text)) {
        throw new Error('e2e translation did not render: ' + JSON.stringify(translated));
      }
      process.stdout.write('SMOKE_E2E_OK ' + JSON.stringify({
        text: value.text.slice(0, 40),
        meta: value.meta,
        status: value.status
      }) + '\n');
    }
    process.stdout.write('SMOKE_INJECT_OK\n');
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
