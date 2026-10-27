(function () {
  'use strict';

  const ESTNS = globalThis.EST;
  const enabledInput = document.getElementById('enabled');
  const targetSelect = document.getElementById('target');
  const engineSelect = document.getElementById('engine');
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
    engineSelect.value = ESTNS.FREE_ENGINES.indexOf(settings.engine) === -1 ? 'bing' : settings.engine;
    ready = true;
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
  document.getElementById('options').addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });

  ESTNS.loadSettings(chrome.storage.local).then(apply);
})();
