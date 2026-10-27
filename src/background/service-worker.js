'use strict';

importScripts(
  '../lib/languages.js',
  '../lib/detect.js',
  '../lib/direction.js',
  '../lib/engines.js',
  '../lib/router.js'
);

const authCache = EST.createAuthCache();

chrome.runtime.onInstalled.addListener(function () {
  chrome.action.setBadgeBackgroundColor({ color: '#0f6cbd' });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== 'translate') return undefined;
  EST.translateText({
    text: message.text,
    sourceLang: message.sourceLang,
    targetLang: message.targetLang,
    engine: message.engine
  }, {
    fetch: fetch,
    authCache: authCache,
    now: function () { return Date.now(); }
  }).then(sendResponse, function (err) {
    sendResponse({ ok: false, error: (err && err.message) || '翻译失败' });
  });
  return true;
});
