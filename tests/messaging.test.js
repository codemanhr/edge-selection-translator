'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  sendExtensionMessage,
  connectionFailure,
  isContextInvalidated,
  isRetryableConnectionError,
  userFacingBackgroundError,
  wakeExtensionWorker,
  attachTranslatePort,
  MESSAGE_RELOAD,
  MESSAGE_UNREACHABLE,
  TRANSLATE_PORT
} = require('../src/lib/messaging.js');

const root = path.join(__dirname, '..');
const immediate = function (ms, done) { done(); };

function runtimeWith(sendMessage) {
  return {
    lastError: undefined,
    sendMessage: sendMessage
  };
}

function answerPing(onTranslate) {
  return function (message, callback) {
    if (message && message.type === 'est-ping') {
      callback({ ok: true });
      return;
    }
    onTranslate(message, callback);
  };
}

function linkedPorts() {
  const clientListeners = [];
  const serverListeners = [];
  const queuedForClient = [];
  function deliver(list, msg) {
    list.slice().forEach(function (fn) { fn(msg); });
  }
  const server = {
    name: TRANSLATE_PORT,
    onMessage: {
      addListener: function (fn) { serverListeners.push(fn); }
    },
    onDisconnect: { addListener: function () {} },
    postMessage: function (msg) {
      if (!clientListeners.length) {
        queuedForClient.push(msg);
        return;
      }
      deliver(clientListeners, msg);
    },
    disconnect: function () {}
  };
  const client = {
    onMessage: {
      addListener: function (fn) {
        clientListeners.push(fn);
        queuedForClient.splice(0).forEach(function (msg) { fn(msg); });
      }
    },
    onDisconnect: { addListener: function () {} },
    postMessage: function (msg) { deliver(serverListeners, msg); },
    disconnect: function () {}
  };
  return { client: client, server: server };
}

test('callback sendMessage resolves with the worker response', async function () {
  const runtime = runtimeWith(answerPing(function (message, callback) {
    assert.equal(message.type, 'translate');
    runtime.lastError = undefined;
    callback({ ok: true, translatedText: '你好' });
  }));
  const response = await sendExtensionMessage({ type: 'translate', text: 'Hello' }, runtime, { delay: immediate });
  assert.equal(response.translatedText, '你好');
});

test('a sleeping worker is retried, and an invalidated context is not', async function () {
  let calls = 0;
  const runtime = runtimeWith(answerPing(function (message, callback) {
    calls += 1;
    runtime.lastError = calls === 1
      ? { message: 'Could not establish connection. Receiving end does not exist.' }
      : undefined;
    callback(calls === 1 ? undefined : { ok: true, translatedText: '你好' });
  }));
  const response = await sendExtensionMessage({ type: 'translate' }, runtime, { delay: immediate });
  assert.equal(calls, 2);
  assert.equal(response.ok, true);

  let closed = 0;
  const sleepy = runtimeWith(answerPing(function (message, callback) {
    closed += 1;
    sleepy.lastError = { message: 'The message port closed before a response was received.' };
    callback();
  }));
  await assert.rejects(
    sendExtensionMessage({ type: 'translate' }, sleepy, { attempts: 3, delay: immediate }),
    /message port closed/
  );
  assert.equal(closed, 3);

  let dead = 0;
  const invalidated = runtimeWith(function () {
    dead += 1;
    throw new Error('Extension context invalidated.');
  });
  await assert.rejects(
    sendExtensionMessage({ type: 'translate' }, invalidated, { delay: immediate }),
    /invalidated/
  );
  assert.equal(dead, 1);
  assert.equal(isContextInvalidated(new Error('Extension context invalidated.')), true);
  assert.equal(isRetryableConnectionError(new Error('Extension context invalidated.')), false);
  assert.equal(isRetryableConnectionError(new Error('Receiving end does not exist.')), true);
  assert.equal(isRetryableConnectionError(new Error('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received')), true);
  assert.equal(connectionFailure(new Error('Extension context invalidated.')), true);
  assert.equal(connectionFailure(new Error('翻译失败')), false);
});

test('a callback response is kept when Edge also sets lastError', async function () {
  let calls = 0;
  const runtime = runtimeWith(answerPing(function (message, callback) {
    calls += 1;
    runtime.lastError = { message: 'The message port closed before a response was received.' };
    callback({ ok: true, translatedText: '你好' });
  }));
  const response = await sendExtensionMessage({ type: 'translate' }, runtime, { delay: immediate });
  assert.equal(calls, 1);
  assert.equal(response.translatedText, '你好');

  let dead = 0;
  const invalidated = runtimeWith(answerPing(function (message, callback) {
    dead += 1;
    invalidated.lastError = { message: 'Extension context invalidated.' };
    callback({ ok: true, translatedText: '你好' });
  }));
  await assert.rejects(
    sendExtensionMessage({ type: 'translate' }, invalidated, { delay: immediate }),
    /invalidated/
  );
  assert.equal(dead, 1);
});

test('reload and connect failure use different panel messages', async function () {
  assert.equal(userFacingBackgroundError(new Error('Extension context invalidated.')), MESSAGE_RELOAD);
  assert.equal(MESSAGE_RELOAD, '扩展已重新加载，请刷新此页面后再翻译');
  assert.equal(
    userFacingBackgroundError(new Error('Could not establish connection. Receiving end does not exist.')),
    '无法连接扩展后台（Could not establish connection. Receiving end does not exist.）'
  );
  assert.equal(
    userFacingBackgroundError(new Error('The message port closed before a response was received.')),
    '无法连接扩展后台（The message port closed before a response was received.）'
  );
  assert.equal(userFacingBackgroundError(new Error('无法连接扩展后台')), MESSAGE_UNREACHABLE);
  const noisy = userFacingBackgroundError(new Error('Receiving end does not exist. ' + 'x'.repeat(80)));
  assert.match(noisy, /^无法连接扩展后台（/);
  assert.ok(noisy.endsWith('…）'));
  assert.ok(noisy.length < 120);
  assert.equal(MESSAGE_UNREACHABLE, '无法连接扩展后台');
  assert.notEqual(MESSAGE_RELOAD, MESSAGE_UNREACHABLE);
  assert.equal(userFacingBackgroundError(new Error('翻译失败')), '翻译失败');

  await assert.rejects(
    sendExtensionMessage({ type: 'translate' }, null),
    /无法连接扩展后台/
  );
  await assert.rejects(
    sendExtensionMessage({ type: 'translate' }, {}),
    /无法连接扩展后台/
  );

  let used = 0;
  const reloaded = {
    id: '',
    connect: function () { used += 1; },
    sendMessage: function () { used += 1; }
  };
  await assert.rejects(
    sendExtensionMessage({ type: 'translate' }, reloaded),
    /invalidated/
  );
  assert.equal(used, 0);
  assert.equal(
    userFacingBackgroundError(new Error('Extension context invalidated.')),
    '扩展已重新加载，请刷新此页面后再翻译'
  );
});

test('wake helper rethrows invalidation and ignores a sleeping worker', function () {
  let pings = 0;
  wakeExtensionWorker({
    lastError: { message: 'Receiving end does not exist.' },
    sendMessage: function (message, callback) {
      assert.equal(message.type, 'est-ping');
      pings += 1;
      callback();
    }
  });
  assert.equal(pings, 1);
  assert.throws(function () {
    wakeExtensionWorker({
      sendMessage: function () { throw new Error('Extension context invalidated.'); }
    });
  }, /invalidated/);
  assert.doesNotThrow(function () {
    wakeExtensionWorker({
      sendMessage: function () { throw new Error('Could not establish connection. Receiving end does not exist.'); }
    });
  });
});

test('translate is sent on the next turn after the ping, and connect is not opened', async function () {
  const order = [];
  let connects = 0;
  const runtime = {
    lastError: undefined,
    sendMessage: function (message, callback) {
      order.push(message.type);
      if (message.type === 'est-ping') {
        callback({ ok: true });
        order.push('ping-returned');
        return;
      }
      assert.equal(message.type, 'translate');
      assert.equal(message.text, 'Hello');
      callback({ ok: true, translatedText: '你好' });
    },
    connect: function () {
      connects += 1;
      throw new Error('connect should not run before sendMessage succeeds');
    }
  };
  const response = await sendExtensionMessage(
    { type: 'translate', text: 'Hello' },
    runtime,
    { delay: immediate }
  );
  assert.equal(response.translatedText, '你好');
  assert.deepEqual(order, ['est-ping', 'ping-returned', 'translate']);
  assert.equal(connects, 0);
});

test('a failed sendMessage falls back to the translate port', async function () {
  let translates = 0;
  let connects = 0;
  let alive = 0;
  let stopped = 0;
  const runtime = {
    lastError: undefined,
    sendMessage: answerPing(function (message, callback) {
      translates += 1;
      runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
      callback();
    }),
    connect: function (info) {
      connects += 1;
      assert.equal(info.name, TRANSLATE_PORT);
      const ends = linkedPorts();
      attachTranslatePort(ends.server, {
        translate: function (message) {
          assert.equal(message.text, 'Hello');
          return Promise.resolve({ ok: true, translatedText: '你好', engine: 'bing' });
        },
        keepAlive: function () {
          alive += 1;
          return function () { stopped += 1; };
        }
      });
      return ends.client;
    }
  };
  const response = await sendExtensionMessage(
    { type: 'translate', text: 'Hello' },
    runtime,
    { attempts: 2, delay: immediate }
  );
  assert.equal(translates, 2);
  assert.equal(connects, 1);
  assert.equal(response.translatedText, '你好');
  assert.equal(response.type, undefined);
  assert.equal(alive, 1);
  assert.equal(stopped, 1);
});

test('port disconnect retries, invalidation and handshake timeout do not loop forever', async function () {
  let connects = 0;
  const runtime = {
    lastError: { message: 'Could not establish connection. Receiving end does not exist.' },
    connect: function () {
      connects += 1;
      if (connects === 1) {
        return {
          onMessage: { addListener: function () {} },
          onDisconnect: { addListener: function (fn) { fn(); } },
          postMessage: function () { throw new Error('payload sent before the worker was ready'); },
          disconnect: function () {}
        };
      }
      const ends = linkedPorts();
      attachTranslatePort(ends.server, {
        translate: function () { return { ok: true, translatedText: '你好' }; }
      });
      return ends.client;
    }
  };
  const response = await sendExtensionMessage({ type: 'translate', text: 'Hi' }, runtime, { delay: immediate });
  assert.equal(connects, 2);
  assert.equal(response.translatedText, '你好');

  let dead = 0;
  const invalidated = {
    connect: function () {
      dead += 1;
      throw new Error('Extension context invalidated.');
    }
  };
  await assert.rejects(
    sendExtensionMessage({ type: 'translate' }, invalidated, { attempts: 5, delay: immediate }),
    /invalidated/
  );
  assert.equal(dead, 1);
  assert.equal(userFacingBackgroundError(new Error('Extension context invalidated.')), MESSAGE_RELOAD);

  let timed = 0;
  const hanging = {
    connect: function () {
      timed += 1;
      return {
        onMessage: { addListener: function () {} },
        onDisconnect: { addListener: function () {} },
        postMessage: function () {},
        disconnect: function () {}
      };
    }
  };
  await assert.rejects(
    sendExtensionMessage({ type: 'translate' }, hanging, {
      attempts: 2,
      delay: immediate,
      schedule: function (fn) { fn(); return 1; },
      cancel: function () {}
    }),
    /Receiving end does not exist/
  );
  assert.equal(timed, 2);
  try {
    await sendExtensionMessage({ type: 'translate' }, hanging, {
      attempts: 1,
      delay: immediate,
      schedule: function (fn) { fn(); return 1; },
      cancel: function () {}
    });
    assert.fail('expected timeout');
  } catch (err) {
    assert.match(String(err && err.message), /Receiving end does not exist/);
    assert.match(userFacingBackgroundError(err), /^无法连接扩展后台（Could not establish connection/);
  }
});

test('the worker answers translate on a port and keeps the panel request', function () {
  const worker = fs.readFileSync(path.join(root, 'src/background/service-worker.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts[0].js;
  assert.match(worker, /messaging\.js/);
  assert.match(worker, /try \{[\s\S]*importScripts\('\.\.\/lib\/messaging\.js'\)/);
  assert.match(worker, /onConnect/);
  assert.match(worker, /TRANSLATE_PORT/);
  assert.match(worker, /est-translate/);
  assert.match(worker, /est-keepalive/);
  assert.match(worker, /attachTranslatePort/);
  assert.match(worker, /est-ping/);
  assert.match(worker, /\}, 400\)/);
  assert.match(worker, /message\.type === 'translate'/);
  assert.match(worker, /return true/);
  assert.match(worker, /message\.style/);
  assert.match(worker, /message\.api/);
  assert.match(worker, /message\.keepProperNouns/);
  assert.match(worker, /getPlatformInfo/);
  assert.ok(scripts.indexOf('src/lib/messaging.js') < scripts.indexOf('src/content/content.js'));
  const content = fs.readFileSync(path.join(root, 'src/content/content.js'), 'utf8');
  assert.match(content, /sendExtensionMessage/);
  assert.match(content, /userFacingBackgroundError/);
  assert.match(content, /message\.type === 'translate' \|\| message\.type === 'est-ping'\) return undefined/);
  assert.doesNotMatch(content, /message\.type === 'translate'\) return false/);
});
