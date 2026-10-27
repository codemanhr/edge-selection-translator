(function () {
  'use strict';

  if (globalThis.__EST_LOADED__) return;
  globalThis.__EST_LOADED__ = true;

  const doc = document;
  if (!doc || doc.contentType !== 'text/html') return;
  if (!doc.documentElement) return;

  const ESTNS = globalThis.EST || {};
  const controller = ESTNS.mountPanel(doc);
  const initial = globalThis.__EST_SETTINGS__ || {};
  if (initial.sourceLang || initial.targetLang) {
    controller.setChoice(initial.sourceLang || 'auto', initial.targetLang || 'zh-Hans');
  }

  let lastPointer = { x: 24, y: 24 };
  let requestSeq = 0;

  function settingsSnapshot() {
    const cached = globalThis.__EST_SETTINGS__ || {};
    return {
      enabled: cached.enabled !== false,
      blacklisted: !!cached.blacklisted,
      engine: cached.engine || 'bing',
      sourceLang: cached.sourceLang,
      targetLang: cached.targetLang
    };
  }

  function nodeElement(node) {
    if (!node) return null;
    return node.nodeType === 3 ? node.parentElement : node;
  }

  function nodeFromSelection(selection) {
    if (!selection) return null;
    return selection.anchorNode || selection.focusNode || null;
  }

  function selectionInsidePanel(selection) {
    const el = nodeElement(nodeFromSelection(selection));
    if (!el || typeof el.getRootNode !== 'function') return false;
    const root = el.getRootNode();
    return !!(root && root.host && root.host.id === (ESTNS.HOST_ID || 'est-selection-translator-host'));
  }

  function showMessage(anchor, original, status) {
    controller.open({
      x: anchor.x,
      y: anchor.y,
      original: original,
      translated: '',
      loading: false,
      status: status
    });
  }

  function requestTranslation(text, point) {
    const seq = ++requestSeq;
    const choice = controller.getChoice();
    const flags = settingsSnapshot();
    controller.open({
      x: point.x,
      y: point.y,
      original: text,
      translated: '',
      loading: true,
      status: ''
    });
    let pending;
    try {
      pending = chrome.runtime.sendMessage({
        type: 'translate',
        text: text,
        sourceLang: choice.source,
        targetLang: choice.target,
        engine: flags.engine
      });
    } catch (err) {
      pending = Promise.reject(err);
    }
    Promise.resolve(pending).then(function (response) {
      if (seq !== requestSeq || !controller.isOpen() || controller.getText() !== text) return;
      if (!response || !response.ok) {
        showMessage(point, text, (response && response.error) || '翻译失败');
        return;
      }
      controller.open({
        x: point.x,
        y: point.y,
        original: text,
        translated: response.translatedText || '',
        loading: false,
        status: response.note || '',
        detected: response.detectedLang || '',
        engineLabel: ESTNS.engineLabel ? ESTNS.engineLabel(response.engine) : (response.engine || '')
      });
    }).catch(function () {
      if (seq !== requestSeq || !controller.isOpen()) return;
      showMessage(point, text, '无法连接扩展后台');
    });
  }

  function handleSelection(point, force) {
    const selection = doc.defaultView.getSelection();
    if (selectionInsidePanel(selection)) return;
    const flags = settingsSnapshot();
    const anchorNode = nodeFromSelection(selection);
    const decision = ESTNS.analyzeSelection({
      text: ESTNS.readSelectionText(selection),
      inCode: typeof ESTNS.isInCodeContext === 'function' ? ESTNS.isInCodeContext(anchorNode) : false,
      inPassword: ESTNS.isPasswordNode(anchorNode),
      enabled: flags.enabled,
      blacklisted: flags.blacklisted,
      force: !!force,
      maxLength: ESTNS.MAX_SELECTION_CHARS
    });
    if (decision.action === 'ignore') return;
    const anchor = ESTNS.selectionAnchorPoint(selection) || point || lastPointer;
    if (decision.action === 'error') {
      showMessage(anchor, decision.text, '选区过长，已截断显示，未发送翻译。');
      return;
    }
    if (controller.isOpen() && controller.getText() === decision.text && !force) {
      controller.move(anchor.x, anchor.y);
      return;
    }
    globalThis.__EST_LAST_SELECTION__ = decision.text;
    requestTranslation(decision.text, anchor);
  }

  controller.setHandlers({
    onLanguageChange: function () {
      const text = controller.getText();
      if (!text) return;
      const choice = controller.getChoice();
      globalThis.__EST_SETTINGS__ = Object.assign({}, globalThis.__EST_SETTINGS__ || {}, {
        sourceLang: choice.source,
        targetLang: choice.target
      });
      requestTranslation(text, lastPointer);
    },
    onSwap: function () {
      const choice = controller.getChoice();
      const detected = controller.getDetected() || (ESTNS.detectLanguage ? ESTNS.detectLanguage(controller.getText()) : '');
      const next = ESTNS.swapLanguages({
        source: choice.source,
        target: choice.target,
        detected: detected
      });
      controller.setChoice(next.source, next.target);
      globalThis.__EST_SETTINGS__ = Object.assign({}, globalThis.__EST_SETTINGS__ || {}, next);
      const text = controller.getText();
      if (text) requestTranslation(text, lastPointer);
    }
  });

  doc.addEventListener('mousemove', function (event) {
    lastPointer = { x: event.clientX, y: event.clientY };
  }, true);

  doc.addEventListener('mouseup', function (event) {
    if (event.button !== 0) return;
    if (controller.isEventInside(event)) return;
    const point = { x: event.clientX, y: event.clientY };
    lastPointer = point;
    setTimeout(function () { handleSelection(point, false); }, 0);
  }, true);

  doc.addEventListener('pointerdown', function (event) {
    if (ESTNS.shouldDismissPanel({
      type: 'pointerdown',
      panelOpen: controller.isOpen(),
      insidePanel: controller.isEventInside(event)
    })) {
      controller.close();
      requestSeq += 1;
    }
  }, true);

  doc.addEventListener('keydown', function (event) {
    if (ESTNS.shouldDismissPanel({
      type: 'keydown',
      key: event.key,
      panelOpen: controller.isOpen(),
      insidePanel: false
    })) {
      controller.close();
      requestSeq += 1;
    }
  }, true);

  doc.addEventListener('scroll', function (event) {
    if (ESTNS.shouldDismissPanel({
      type: 'scroll',
      panelOpen: controller.isOpen(),
      insidePanel: controller.isEventInside(event)
    })) {
      controller.close();
      requestSeq += 1;
    }
  }, true);

  globalThis.__EST_FORCE_TRANSLATE__ = function () {
    handleSelection(lastPointer, true);
  };
})();
