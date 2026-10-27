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
  MESSAGE_RELOAD,
  MESSAGE_UNREACHABLE
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
});

test('reload and connect failure use different panel messages', async function () {
  assert.equal(userFacingBackgroundError(new Error('Extension context invalidated.')), MESSAGE_RELOAD);
  assert.equal(MESSAGE_RELOAD, '扩展已重新加载，请刷新此页面后再翻译');
  assert.equal(
    userFacingBackgroundError(new Error('Could not establish connection. Receiving end does not exist.')),
    '无法连接扩展后台（Could not establish connection. Receiving end does not exist.）'
  );
  assert.equal(userFacingBackgroundError(new Error('无法连接扩展后台')), MESSAGE_UNREACHABLE);
  assert.equal(MESSAGE_UNREACHABLE, '无法连接扩展后台');
  assert.equal(userFacingBackgroundError(new Error('翻译失败')), '翻译失败');

  await assert.rejects(sendExtensionMessage({ type: 'translate' }, null), /无法连接扩展后台/);
  let used = 0;
  await assert.rejects(
    sendExtensionMessage({ type: 'translate' }, {
      id: '',
      sendMessage: function () { used += 1; },
      connect: function () { used += 1; }
    }),
    /invalidated/
  );
  assert.equal(used, 0);
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
      callback({ ok: true, translatedText: '你好' });
    },
    connect: function () {
      connects += 1;
      throw new Error('connect should not run');
    }
  };
  const response = await sendExtensionMessage({ type: 'translate', text: 'Hello' }, runtime, { delay: immediate });
  assert.equal(response.translatedText, '你好');
  assert.deepEqual(order, ['est-ping', 'ping-returned', 'translate']);
  assert.equal(connects, 0);
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

test('the worker logs a wake and answers translate asynchronously', function () {
  const worker = fs.readFileSync(path.join(root, 'src/background/service-worker.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts[0].js;
  assert.equal(manifest.version, '1.0.3');
  assert.match(worker, /est: worker start/);
  assert.match(worker, /est: ' \+ message\.type/);
  assert.match(worker, /est-ping/);
  assert.match(worker, /message\.type === 'translate'/);
  assert.match(worker, /return true/);
  assert.match(worker, /message\.style/);
  assert.match(worker, /message\.api/);
  assert.match(worker, /message\.keepProperNouns/);
  assert.match(worker, /getPlatformInfo/);
  assert.doesNotMatch(worker, /runtime\.connect/);
  assert.ok(scripts.indexOf('src/lib/messaging.js') < scripts.indexOf('src/content/content.js'));
  const content = fs.readFileSync(path.join(root, 'src/content/content.js'), 'utf8');
  assert.match(content, /sendExtensionMessage/);
  assert.match(content, /userFacingBackgroundError/);
  assert.match(content, /message\.type === 'translate' \|\| message\.type === 'est-ping'\) return undefined/);
  assert.doesNotMatch(content, /chrome\.runtime\.sendMessage\(\{/);
});
