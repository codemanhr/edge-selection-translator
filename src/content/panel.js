(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FALLBACK_LANGUAGES = [
    { code: 'auto', name: '自动检测' },
    { code: 'zh-Hans', name: '简体中文' },
    { code: 'en', name: '英语' }
  ];

  function mountPanel(doc, deps) {
    const ESTNS = (typeof globalThis !== 'undefined' && globalThis.EST) || {};
    const constants = (deps && deps.constants) || ESTNS;
    const cssText = (deps && deps.panelCSS) || ESTNS.panelCSS || '';
    const positionOf = (deps && deps.computePanelPosition) || ESTNS.computePanelPosition;
    const languages = (deps && deps.languages) || ESTNS.LANGUAGES || FALLBACK_LANGUAGES;
    const hostId = constants.HOST_ID || 'est-selection-translator-host';
    const margin = constants.PANEL_MARGIN || 8;

    const existing = doc.getElementById(hostId);
    if (existing) existing.remove();

    const host = doc.createElement('div');
    host.id = hostId;
    host.setAttribute('data-est-root', 'true');
    host.style.cssText = [
      'all: initial',
      'position: fixed',
      'z-index: 2147483646',
      'left: 0',
      'top: 0',
      'width: max-content',
      'height: max-content',
      'margin: 0',
      'padding: 0',
      'border: 0',
      'display: none',
      'pointer-events: none'
    ].join(';');

    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = cssText;
    const panel = doc.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '划词翻译');
    panel.innerHTML = [
      '<div class="bar">',
      '  <label class="lang"><span>目标</span><select data-role="target" aria-label="目标语言"></select></label>',
      '  <button type="button" class="swap" data-role="swap" title="交换语言" aria-label="交换语言">⇄</button>',
      '  <label class="lang"><span>源</span><select data-role="source" aria-label="源语言"></select></label>',
      '  <button type="button" class="close" data-role="close" aria-label="关闭">×</button>',
      '</div>',
      '<div class="meta" data-role="meta"></div>',
      '<div class="body" data-role="body"></div>',
      '<div class="tools">',
      '  <button type="button" data-role="copy">复制译文</button>',
      '  <button type="button" data-role="speak-original">读原文</button>',
      '  <button type="button" data-role="speak-translation">读译文</button>',
      '  <button type="button" data-role="fav" aria-pressed="false">收藏</button>',
      '  <select data-role="style" aria-label="翻译风格" title="翻译风格">',
      '    <option value="normal">普通</option>',
      '    <option value="colloquial">口语</option>',
      '    <option value="formal">正式</option>',
      '  </select>',
      '</div>',
      '<div class="original" data-role="original"></div>',
      '<div class="status" data-role="status"></div>'
    ].join('');
    shadow.appendChild(style);
    shadow.appendChild(panel);

    const targetSelect = panel.querySelector('[data-role="target"]');
    const sourceSelect = panel.querySelector('[data-role="source"]');
    const bodyEl = panel.querySelector('[data-role="body"]');
    const originalEl = panel.querySelector('[data-role="original"]');
    const statusEl = panel.querySelector('[data-role="status"]');
    const metaEl = panel.querySelector('[data-role="meta"]');
    const closeBtn = panel.querySelector('[data-role="close"]');
    const swapBtn = panel.querySelector('[data-role="swap"]');
    const copyBtn = panel.querySelector('[data-role="copy"]');
    const speakOriginalBtn = panel.querySelector('[data-role="speak-original"]');
    const speakTranslationBtn = panel.querySelector('[data-role="speak-translation"]');
    const favBtn = panel.querySelector('[data-role="fav"]');
    const styleSelect = panel.querySelector('[data-role="style"]');

    function fillSelect(select, includeAuto, selected) {
      select.textContent = '';
      languages.forEach(function (lang) {
        if (!includeAuto && lang.code === 'auto') return;
        const option = doc.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        if (lang.code === selected) option.selected = true;
        select.appendChild(option);
      });
    }

    fillSelect(targetSelect, false, 'zh-Hans');
    fillSelect(sourceSelect, true, 'auto');

    let open = false;
    let currentText = '';
    let translated = '';
    let loading = false;
    let detected = '';
    let engineName = '';
    let handlers = {
      onLanguageChange: function () {},
      onSwap: function () {},
      onCopy: function () {},
      onSpeakOriginal: function () {},
      onSpeakTranslation: function () {},
      onFavorite: function () {},
      onStyleChange: function () {}
    };

    function place(point) {
      const rect = panel.getBoundingClientRect();
      const view = doc.defaultView || { innerWidth: 800, innerHeight: 600 };
      const pos = positionOf
        ? positionOf(
          point,
          { width: rect.width || 312, height: rect.height || 120 },
          { width: view.innerWidth, height: view.innerHeight },
          margin
        )
        : { left: point.x + margin, top: point.y + margin };
      host.style.left = pos.left + 'px';
      host.style.top = pos.top + 'px';
    }

    function renderMeta() {
      const parts = [];
      if (engineName) parts.push(engineName);
      const source = sourceSelect.value;
      if (source === 'auto' && detected) parts.push('检测到' + (ESTNS.languageName ? ESTNS.languageName(detected) : detected));
      else if (source !== 'auto') parts.push(ESTNS.languageName ? ESTNS.languageName(source) : source);
      metaEl.textContent = parts.join(' · ');
    }

    function openPanel(options) {
      const point = options || { x: margin, y: margin };
      if (options.original != null) currentText = options.original;
      if (options.detected != null) detected = options.detected || '';
      if (options.engineLabel != null) engineName = options.engineLabel || '';
      if (options.sourceLang) sourceSelect.value = options.sourceLang;
      if (options.targetLang) targetSelect.value = options.targetLang;
      if (options.style) styleSelect.value = options.style;
      panel.classList.remove('force-dark', 'force-light');
      if (options.theme === 'dark') panel.classList.add('force-dark');
      if (options.theme === 'light') panel.classList.add('force-light');
      originalEl.textContent = currentText;
      loading = !!options.loading;
      if (loading) {
        translated = '';
        favBtn.textContent = '收藏';
        favBtn.setAttribute('aria-pressed', 'false');
        bodyEl.textContent = '正在翻译…';
        bodyEl.classList.add('loading');
      } else {
        if (options.translated != null) translated = options.translated;
        bodyEl.textContent = translated;
        bodyEl.classList.remove('loading');
      }
      statusEl.textContent = options.status || '';
      renderMeta();
      host.style.display = 'block';
      host.style.pointerEvents = 'none';
      panel.style.pointerEvents = 'auto';
      open = true;
      place(point);
      place(point);
    }

    function closePanel() {
      open = false;
      currentText = '';
      translated = '';
      loading = false;
      detected = '';
      engineName = '';
      host.style.display = 'none';
      bodyEl.textContent = '';
      originalEl.textContent = '';
      statusEl.textContent = '';
      metaEl.textContent = '';
    }

    function move(x, y) {
      if (!open) return;
      place({ x: x, y: y });
    }

    closeBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
    });
    swapBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onSwap();
    });
    targetSelect.addEventListener('change', function () { handlers.onLanguageChange(); });
    sourceSelect.addEventListener('change', function () { handlers.onLanguageChange(); });
    copyBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onCopy();
    });
    speakOriginalBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onSpeakOriginal();
    });
    speakTranslationBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onSpeakTranslation();
    });
    favBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onFavorite();
    });
    styleSelect.addEventListener('change', function () { handlers.onStyleChange(); });

    (doc.documentElement || doc.body).appendChild(host);

    return {
      host: host,
      open: openPanel,
      close: closePanel,
      move: move,
      isOpen: function () { return open; },
      getText: function () { return currentText; },
      getTranslation: function () { return loading ? '' : translated; },
      getDetected: function () { return detected; },
      setStatus: function (text) { statusEl.textContent = text || ''; },
      getStyle: function () { return styleSelect.value || 'normal'; },
      setStyle: function (style) { if (style) styleSelect.value = style; },
      setFavorite: function (on) {
        favBtn.textContent = on ? '已收藏' : '收藏';
        favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      },
      getChoice: function () {
        return { source: sourceSelect.value || 'auto', target: targetSelect.value || 'zh-Hans' };
      },
      setChoice: function (source, target) {
        if (source) sourceSelect.value = source;
        if (target) targetSelect.value = target;
        renderMeta();
      },
      setHandlers: function (next) {
        handlers = Object.assign(handlers, next || {});
      },
      isEventInside: function (event) {
        if (!event) return false;
        if (typeof event.composedPath === 'function') {
          const path = event.composedPath();
          return path.indexOf(host) !== -1 || path.indexOf(panel) !== -1;
        }
        return event.target === host;
      }
    };
  }

  return { mountPanel };
});
