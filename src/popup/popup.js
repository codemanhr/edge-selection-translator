(function () {
  'use strict';

  const ESTNS = globalThis.EST;
  const enabledInput = document.getElementById('enabled');
  const targetSelect = document.getElementById('target');
  const engineSelect = document.getElementById('engine');
  const shortcutDisplay = document.getElementById('shortcut-display');
  const shortcutKeys = document.getElementById('shortcut-keys');
  let ready = false;

  function fillTargets(selected) {
    targetSelect.textContent = '';
    ESTNS.LANGUAGES.forEach(function (lang) {
      if (lang.code === 'auto') return;
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      targetSelect.appendChild(option);
    });
    targetSelect.value = selected || 'zh-Hans';
  }

  function paintBadge(enabled) {
    chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#0f6cbd' });
  }

  function apply(settings) {
    ready = false;
    enabledInput.checked = settings.enabled !== false;
    fillTargets(settings.targetLang);
    engineSelect.value = ESTNS.ENGINES.indexOf(settings.engine) === -1 ? 'bing' : settings.engine;
    shortcutDisplay.value = settings.shortcutDisplay === 'mac' ? 'mac' : 'windows';
    paintShortcuts(shortcutDisplay.value);
    const recent = document.getElementById('recent');
    recent.textContent = '';
    (settings.history || []).slice(0, 3).forEach(function (entry) {
      const li = document.createElement('li');
      const strong = document.createElement('b');
      strong.textContent = entry.translatedText || '';
      const span = document.createElement('span');
      span.textContent = entry.sourceText || '';
      li.appendChild(strong);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(span);
      recent.appendChild(li);
    });
    ready = true;
  }

  function paintShortcuts(platform) {
    shortcutKeys.textContent = '';
    ESTNS.shortcutLines(platform).forEach(function (line, index) {
      if (index) shortcutKeys.appendChild(document.createTextNode(' · '));
      const kbd = document.createElement('kbd');
      kbd.textContent = line.chord;
      shortcutKeys.appendChild(kbd);
      shortcutKeys.appendChild(document.createTextNode('（' + line.short + '）'));
    });
  }

  function paintSite(status) {
    const button = document.getElementById('blacklist');
    if (!status || !status.host) {
      button.textContent = '此页面不能停用';
      button.disabled = true;
      return;
    }
    button.disabled = false;
    button.textContent = (status.blacklisted ? '恢复' : '停用') + ' ' + status.host;
  }

  function persist() {
    if (!ready) return;
    ESTNS.saveSettings(chrome.storage.local, {
      enabled: enabledInput.checked,
      targetLang: targetSelect.value,
      engine: engineSelect.value
    }).then(function (next) { paintBadge(next.enabled); });
  }

  enabledInput.addEventListener('change', persist);
  targetSelect.addEventListener('change', persist);
  engineSelect.addEventListener('change', persist);
  shortcutDisplay.addEventListener('change', function () {
    paintShortcuts(shortcutDisplay.value);
    if (!ready) return;
    ESTNS.saveSettings(chrome.storage.local, {
      shortcutDisplay: shortcutDisplay.value === 'mac' ? 'mac' : 'windows'
    });
  });
  document.getElementById('options').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('blacklist').addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'toggle-blacklist' }).then(paintSite).catch(function () {
        paintSite(null);
      });
    });
  });

  ESTNS.loadSettings(chrome.storage.local).then(function (settings) {
    if (settings.shortcutDisplay === 'mac' || settings.shortcutDisplay === 'windows') return settings;
    return ESTNS.saveSettings(chrome.storage.local, {
      shortcutDisplay: ESTNS.detectShortcutPlatform(navigator)
    });
  }).then(function (settings) {
    apply(settings);
    chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return paintSite(null);
      chrome.tabs.sendMessage(tab.id, { type: 'site-status' }).then(paintSite).catch(function () {
        paintSite(null);
      });
    });
  });
})();
