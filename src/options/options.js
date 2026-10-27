(function () {
  'use strict';

  const ESTNS = globalThis.EST;
  const enabledInput = document.getElementById('enabled');
  const sourceSelect = document.getElementById('source');
  const targetSelect = document.getElementById('target');
  const engineSelect = document.getElementById('engine');
  const styleSelect = document.getElementById('style');
  const themeSelect = document.getElementById('theme');
  const namesInput = document.getElementById('names');
  const deeplKey = document.getElementById('deepl-key');
  const deeplPro = document.getElementById('deepl-pro');
  const openaiUrl = document.getElementById('openai-url');
  const openaiKey = document.getElementById('openai-key');
  const openaiModel = document.getElementById('openai-model');
  const libreUrl = document.getElementById('libre-url');
  const libreKey = document.getElementById('libre-key');
  const azureKey = document.getElementById('azure-key');
  const azureRegion = document.getElementById('azure-region');
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
      engine: engineSelect.value,
      style: styleSelect.value,
      theme: themeSelect.value,
      keepProperNouns: namesInput.checked,
      api: {
        deeplKey: deeplKey.value.trim(),
        deeplPro: deeplPro.checked,
        openaiKey: openaiKey.value.trim(),
        openaiBaseUrl: openaiUrl.value.trim() || 'https://api.openai.com/v1',
        openaiModel: openaiModel.value.trim() || 'gpt-4o-mini',
        libreUrl: libreUrl.value.trim() || 'https://libretranslate.com',
        libreKey: libreKey.value.trim(),
        azureKey: azureKey.value.trim(),
        azureRegion: azureRegion.value.trim() || 'global'
      }
    };
  }

  function originPattern(url) {
    try {
      const parsed = new URL(url);
      const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !local) return '';
      if (!local && parsed.protocol !== 'https:') return '';
      return parsed.origin + '/*';
    } catch (err) {
      return '';
    }
  }

  function originsFor(patch) {
    const origins = [];
    function add(url) {
      const pattern = originPattern(url);
      if (pattern && origins.indexOf(pattern) === -1) origins.push(pattern);
    }
    if (patch.engine === 'deepl' || patch.api.deeplKey) {
      add(patch.api.deeplPro ? 'https://api.deepl.com/v2' : 'https://api-free.deepl.com/v2');
    }
    if (patch.engine === 'openai' || patch.api.openaiKey) add(patch.api.openaiBaseUrl);
    if (patch.engine === 'libretranslate' || patch.api.libreKey) add(patch.api.libreUrl);
    if (patch.engine === 'azure' || patch.api.azureKey) add('https://api.cognitive.microsofttranslator.com/translate');
    return origins;
  }

  function grant(origins) {
    if (!origins.length || !chrome.permissions) return Promise.resolve(true);
    return chrome.permissions.contains({ origins: origins }).then(function (has) {
      if (has) return true;
      return chrome.permissions.request({ origins: origins });
    }).catch(function () { return false; });
  }

  function apply(settings) {
    ready = false;
    enabledInput.checked = settings.enabled !== false;
    fillLanguages(sourceSelect, true, settings.sourceLang || 'auto');
    fillLanguages(targetSelect, false, settings.targetLang || 'zh-Hans');
    engineSelect.value = ESTNS.ENGINES.indexOf(settings.engine) === -1 ? 'bing' : settings.engine;
    styleSelect.value = settings.style || 'normal';
    themeSelect.value = settings.theme || 'system';
    namesInput.checked = settings.keepProperNouns !== false;
    const api = settings.api || {};
    deeplKey.value = api.deeplKey || '';
    deeplPro.checked = !!api.deeplPro;
    openaiUrl.value = api.openaiBaseUrl || '';
    openaiKey.value = api.openaiKey || '';
    openaiModel.value = api.openaiModel || '';
    libreUrl.value = api.libreUrl || '';
    libreKey.value = api.libreKey || '';
    azureKey.value = api.azureKey || '';
    azureRegion.value = api.azureRegion || '';
    hint.textContent = HINTS[engineSelect.value] || '密钥只保存在本机。失败时会自动改用免密钥引擎。';
    renderLists(settings);
    ready = true;
  }

  function itemButton(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function phrase(source, translated) {
    const box = document.createElement('div');
    box.className = 'phrase';
    const strong = document.createElement('b');
    strong.textContent = translated || '';
    const span = document.createElement('span');
    span.textContent = source || '';
    box.appendChild(strong);
    box.appendChild(span);
    return box;
  }

  function renderLists(settings) {
    const blacklist = document.getElementById('blacklist');
    const history = document.getElementById('history');
    const favorites = document.getElementById('favorites');
    blacklist.textContent = '';
    history.textContent = '';
    favorites.textContent = '';
    (settings.blacklist || []).forEach(function (host) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = host;
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.appendChild(itemButton('移除', function () {
        ESTNS.saveSettings(chrome.storage.local, {
          blacklist: ESTNS.removeHost(settings.blacklist, host)
        }).then(apply);
      }));
      li.appendChild(name);
      li.appendChild(actions);
      blacklist.appendChild(li);
    });
    (settings.history || []).forEach(function (entry) {
      const li = document.createElement('li');
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.appendChild(itemButton(ESTNS.isFavorite(settings.favorites, entry) ? '已收藏' : '收藏', function () {
        ESTNS.saveSettings(chrome.storage.local, {
          favorites: ESTNS.toggleFavorite(settings.favorites, entry)
        }).then(apply);
      }));
      actions.appendChild(itemButton('删除', function () {
        ESTNS.saveSettings(chrome.storage.local, {
          history: ESTNS.removeById(settings.history, entry.id)
        }).then(apply);
      }));
      li.appendChild(phrase(entry.sourceText, entry.translatedText));
      li.appendChild(actions);
      history.appendChild(li);
    });
    (settings.favorites || []).forEach(function (entry) {
      const li = document.createElement('li');
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.appendChild(itemButton('取消', function () {
        ESTNS.saveSettings(chrome.storage.local, {
          favorites: ESTNS.toggleFavorite(settings.favorites, entry)
        }).then(apply);
      }));
      li.appendChild(phrase(entry.sourceText, entry.translatedText));
      li.appendChild(actions);
      favorites.appendChild(li);
    });
    if (!settings.history.length) history.appendChild(empty('还没有翻译记录'));
    if (!settings.favorites.length) favorites.appendChild(empty('还没有收藏'));
    if (!settings.blacklist.length) blacklist.appendChild(empty('没有停用的网站'));
  }

  function empty(text) {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }

  function persist() {
    if (!ready) return;
    const patch = collect();
    hint.textContent = HINTS[patch.engine] || '密钥只保存在本机。失败时会自动改用免密钥引擎。';
    grant(originsFor(patch)).then(function () {
      return ESTNS.saveSettings(chrome.storage.local, patch);
    }).then(function (next) {
      paintBadge(next.enabled);
      showSaved();
    });
  }

  [
    enabledInput, sourceSelect, targetSelect, engineSelect, styleSelect, themeSelect, namesInput,
    deeplKey, deeplPro, openaiUrl, openaiKey, openaiModel, libreUrl, libreKey, azureKey, azureRegion
  ].forEach(function (el) {
    el.addEventListener('change', persist);
  });

  document.getElementById('add-host').addEventListener('click', function () {
    const input = document.getElementById('host');
    ESTNS.loadSettings(chrome.storage.local).then(function (settings) {
      return ESTNS.saveSettings(chrome.storage.local, {
        blacklist: ESTNS.addHost(settings.blacklist, input.value)
      });
    }).then(function (next) {
      input.value = '';
      apply(next);
      showSaved();
    });
  });
  document.getElementById('clear-history').addEventListener('click', function () {
    ESTNS.saveSettings(chrome.storage.local, { history: [] }).then(function (next) {
      apply(next);
      showSaved();
    });
  });

  ESTNS.loadSettings(chrome.storage.local).then(apply);
})();
