'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  sendExtensionMessage,
  connectionFailure,
  isContextInvalidated,
  isRetryableConnectionError
} = require('../src/lib/messaging.js');

const root = path.join(__dirname, '..');
const immediate = function (ms, done) { done(); };

function runtimeWith(sendMessage) {
  return {
    lastError: undefined,
    sendMessage: sendMessage
  };
}

test('callback sendMessage resolves with the worker response', async function () {
  const runtime = runtimeWith(function (message, callback) {
    assert.equal(message.type, 'translate');
    runtime.lastError = undefined;
    callback({ ok: true, translatedText: '你好' });
  });
  const response = await sendExtensionMessage({ type: 'translate', text: 'Hello' }, runtime, { delay: immediate });
  assert.equal(response.translatedText, '你好');
});

test('a sleeping worker is retried, and an invalidated context is not', async function () {
  let calls = 0;
  const runtime = runtimeWith(function (message, callback) {
    calls += 1;
    runtime.lastError = calls === 1
      ? { message: 'Could not establish connection. Receiving end does not exist.' }
      : undefined;
    callback(calls === 1 ? undefined : { ok: true, translatedText: '你好' });
  });
  const response = await sendExtensionMessage({ type: 'translate' }, runtime, { delay: immediate });
  assert.equal(calls, 2);
  assert.equal(response.ok, true);

  let closed = 0;
  const sleepy = runtimeWith(function (message, callback) {
    closed += 1;
    sleepy.lastError = { message: 'The message port closed before a response was received.' };
    callback();
  });
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

test('the worker answers translate asynchronously and keeps the panel request', function () {
  const worker = fs.readFileSync(path.join(root, 'src/background/service-worker.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts[0].js;
  assert.match(worker, /message\.type === 'translate'/);
  assert.match(worker, /return true/);
  assert.match(worker, /message\.style/);
  assert.match(worker, /message\.api/);
  assert.match(worker, /message\.keepProperNouns/);
  assert.match(worker, /getPlatformInfo/);
  assert.ok(scripts.indexOf('src/lib/messaging.js') < scripts.indexOf('src/content/content.js'));
  const content = fs.readFileSync(path.join(root, 'src/content/content.js'), 'utf8');
  assert.match(content, /sendExtensionMessage/);
  assert.match(content, /connectionFailure/);
  assert.match(content, /message\.type === 'translate'\) return false/);
});
