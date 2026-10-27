'use strict';

importScripts(
  '../lib/constants.js',
  '../lib/languages.js',
  '../lib/detect.js',
  '../lib/direction.js',
  '../lib/engines.js',
  '../lib/proper-nouns.js',
  '../lib/router.js',
  '../lib/settings.js',
  '../lib/commands.js',
  '../lib/blacklist.js',
  '../lib/history.js'
);

const authCache = EST.createAuthCache();

async function refreshBadge() {
  const settings = await EST.loadSettings(chrome.storage.local);
  await chrome.action.setBadgeText({ text: settings.enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: '#0f6cbd' });
  return settings;
}

function installMenus() {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id: 'est-translate',
      title: '翻译选中文字',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'est-blacklist',
      title: '在此网站停用 / 恢复划词翻译',
      contexts: ['page', 'selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(function () {
  refreshBadge();
  installMenus();
});
chrome.runtime.onStartup.addListener(function () { refreshBadge(); });

function translatePayload(message) {
  return EST.translateText({
    text: message.text,
    sourceLang: message.sourceLang,
    targetLang: message.targetLang,
    engine: message.engine,
    style: message.style,
    keepProperNouns: message.keepProperNouns,
    api: message.api
  }, {
    fetch: fetch,
    authCache: authCache,
    now: function () { return Date.now(); }
  }).catch(function (err) {
    return { ok: false, error: (err && err.message) || '翻译失败' };
  });
}

// getPlatformInfo is a no-op event that keeps the worker alive until the
// fetch chain calls sendResponse. Without it, Edge can close the port
// while Bing or the fallback engines are still in flight.
function keepWorkerAlive() {
  const timer = setInterval(function () {
    try { chrome.runtime.getPlatformInfo(function () {}); } catch (err) {}
  }, 2000);
  return function () { clearInterval(timer); };
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return undefined;
  if (message.type === 'translate') {
    const stop = keepWorkerAlive();
    let pending;
    try {
      pending = translatePayload(message);
    } catch (err) {
      stop();
      sendResponse({ ok: false, error: (err && err.message) || '翻译失败' });
      return undefined;
    }
    Promise.resolve(pending).then(function (response) {
      stop();
      try { sendResponse(response); } catch (err) {}
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

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'est-translate') {
    const sent = chrome.tabs.sendMessage(tab.id, { type: 'force-translate' });
    if (sent && typeof sent.catch === 'function') sent.catch(function () {});
    return;
  }
  if (info.menuItemId === 'est-blacklist' && info.pageUrl) {
    const host = EST.hostFromUrl(info.pageUrl);
    if (!host) return;
    EST.loadSettings(chrome.storage.local).then(function (settings) {
      const blacklist = EST.isBlacklisted(settings.blacklist, host)
        ? EST.removeHost(settings.blacklist, host)
        : EST.addHost(settings.blacklist, host);
      return EST.saveSettings(chrome.storage.local, { blacklist: blacklist });
    }).catch(function () {});
  }
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
