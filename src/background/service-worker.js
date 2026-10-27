'use strict';

importScripts(
  '../lib/constants.js',
  '../lib/languages.js',
  '../lib/detect.js',
  '../lib/direction.js',
  '../lib/engines.js',
  '../lib/router.js',
  '../lib/settings.js',
  '../lib/commands.js'
);

const authCache = EST.createAuthCache();

async function refreshBadge() {
  const settings = await EST.loadSettings(chrome.storage.local);
  await chrome.action.setBadgeText({ text: settings.enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: '#0f6cbd' });
  return settings;
}

chrome.runtime.onInstalled.addListener(function () { refreshBadge(); });
chrome.runtime.onStartup.addListener(function () { refreshBadge(); });

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return undefined;
  if (message.type === 'translate') {
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
  }
  if (message.type === 'get-settings') {
    EST.loadSettings(chrome.storage.local).then(sendResponse);
    return true;
  }
  if (message.type === 'save-settings') {
    EST.saveSettings(chrome.storage.local, message.patch || {}).then(function (next) {
      chrome.action.setBadgeText({ text: next.enabled ? '' : 'OFF' });
      sendResponse(next);
    });
    return true;
  }
  return undefined;
});

chrome.commands.onCommand.addListener(function (command) {
  if (command === 'toggle-enabled') {
    EST.loadSettings(chrome.storage.local).then(function (current) {
      return EST.saveSettings(chrome.storage.local, { enabled: !current.enabled });
    }).then(refreshBadge).catch(function () {});
    return;
  }
  if (command === 'force-translate') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      const sent = chrome.tabs.sendMessage(tab.id, { type: 'force-translate' });
      if (sent && typeof sent.catch === 'function') sent.catch(function () {});
    }).catch(function () {});
  }
});
