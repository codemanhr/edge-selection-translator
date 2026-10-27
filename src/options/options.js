(function () {
  'use strict';

  const ESTNS = globalThis.EST;
  const enabledInput = document.getElementById('enabled');
  const sourceSelect = document.getElementById('source');
  const targetSelect = document.getElementById('target');
  const engineSelect = document.getElementById('engine');
  const hint = document.getElementById('engine-hint');
  const saved = document.getElementById('saved');
  let ready = false;

  const HINTS = {
    bing: '默认引擎。读取 Bing 翻译页面上的短期令牌，无需密钥。选中的文字会发送到 Microsoft。接口可能调整；失败时会自动改用其他免密钥引擎。',
    google: 'Google 的非官方翻译接口，无需密钥，也没有可用性保证，可能会被限流。选中的文字会发送到 Google。',
    mymemory: '匿名额度较小，单段大约 450 字。选中的文字会发送到 Translated（MyMemory）。'
  };

  function fillLanguages(select, includeAuto, selected) {
    select.textContent = '';
    ESTNS.LANGUAGES.forEach(function (lang) {
      if (!includeAuto && lang.code === 'auto') return;
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name + ' · ' + lang.nameEn;
      select.appendChild(option);
    });
    select.value = selected;
  }

  function showSaved() {
    saved.hidden = false;
    clearTimeout(showSaved.timer);
    showSaved.timer = setTimeout(function () { saved.hidden = true; }, 1200);
  }

  function paintBadge(enabled) {
    chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#0f6cbd' });
  }

  function collect() {
    return {
      enabled: enabledInput.checked,
      sourceLang: sourceSelect.value,
      targetLang: targetSelect.value,
      engine: engineSelect.value
    };
  }

  function apply(settings) {
    ready = false;
    enabledInput.checked = settings.enabled !== false;
    fillLanguages(sourceSelect, true, settings.sourceLang || 'auto');
    fillLanguages(targetSelect, false, settings.targetLang || 'zh-Hans');
    engineSelect.value = ESTNS.FREE_ENGINES.indexOf(settings.engine) === -1 ? 'bing' : settings.engine;
    hint.textContent = HINTS[engineSelect.value] || '';
    ready = true;
  }

  function persist() {
    if (!ready) return;
    const patch = collect();
    hint.textContent = HINTS[patch.engine] || '';
    ESTNS.saveSettings(chrome.storage.local, patch).then(function (next) {
      paintBadge(next.enabled);
      showSaved();
    });
  }

  [enabledInput, sourceSelect, targetSelect, engineSelect].forEach(function (el) {
    el.addEventListener('change', persist);
  });

  ESTNS.loadSettings(chrome.storage.local).then(apply);
})();
