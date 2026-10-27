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
      blacklisted: ESTNS.isBlacklisted
        ? ESTNS.isBlacklisted(cached.blacklist || [], location.hostname)
        : false,
      engine: cached.engine || 'bing',
      sourceLang: cached.sourceLang,
      targetLang: cached.targetLang,
      style: cached.style || 'normal',
      keepProperNouns: cached.keepProperNouns !== false,
      theme: cached.theme || 'system',
      api: cached.api || {}
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

  function stopSpeaking() {
    if (ESTNS.stopSpeech) ESTNS.stopSpeech({ synth: window.speechSynthesis });
  }

  function showMessage(anchor, original, status) {
    stopSpeaking();
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
    stopSpeaking();
    const seq = ++requestSeq;
    const choice = controller.getChoice();
    const flags = settingsSnapshot();
    const style = controller.getStyle ? controller.getStyle() : flags.style;
    controller.open({
      x: point.x,
      y: point.y,
      original: text,
      translated: '',
      loading: true,
      status: '',
      theme: flags.theme
    });
    const payload = {
      type: 'translate',
      text: text,
      sourceLang: choice.source,
      targetLang: choice.target,
      engine: flags.engine,
      style: style,
      keepProperNouns: flags.keepProperNouns,
      api: flags.api
    };
    const pending = ESTNS.sendExtensionMessage
      ? ESTNS.sendExtensionMessage(payload, chrome.runtime)
      : Promise.reject(new Error('无法连接扩展后台'));
    pending.then(function (response) {
      if (seq !== requestSeq || !controller.isOpen() || controller.getText() !== text) return;
      if (!response || !response.ok) {
        showMessage(point, text, (response && response.error) || '翻译失败');
        return;
      }
      try {
        controller.open({
          x: point.x,
          y: point.y,
          original: text,
          translated: response.translatedText || '',
          loading: false,
          status: response.note || '',
          detected: response.detectedLang || '',
          engineLabel: ESTNS.engineLabel ? ESTNS.engineLabel(response.engine) : (response.engine || ''),
          theme: flags.theme
        });
        rememberTranslation(text, response);
        refreshFavorite(text, response.targetLang);
      } catch (err) {
        showMessage(point, text, (err && err.message) || '翻译失败');
      }
    }).catch(function (err) {
      if (seq !== requestSeq || !controller.isOpen()) return;
      const failed = !ESTNS.connectionFailure || ESTNS.connectionFailure(err);
      showMessage(point, text, failed ? '无法连接扩展后台' : ((err && err.message) || '翻译失败'));
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

  function rememberTranslation(text, response) {
    if (!ESTNS.addHistory || !ESTNS.loadSettings || !chrome.storage || !chrome.storage.local) return;
    ESTNS.loadSettings(chrome.storage.local).then(function (settings) {
      return ESTNS.saveSettings(chrome.storage.local, {
        history: ESTNS.addHistory(settings.history, {
          sourceText: text,
          translatedText: response.translatedText,
          sourceLang: response.sourceLang,
          targetLang: response.targetLang,
          engine: response.engine
        })
      });
    }).catch(function () {});
  }

  function refreshFavorite(text, targetLang) {
    if (!ESTNS.isFavorite || !chrome.storage || !chrome.storage.local) return;
    ESTNS.loadSettings(chrome.storage.local).then(function (settings) {
      if (!controller.isOpen() || controller.getText() !== text) return;
      controller.setFavorite(ESTNS.isFavorite(settings.favorites, {
        sourceText: text,
        targetLang: targetLang || controller.getChoice().target
      }));
    }).catch(function () {});
  }

  function persistChoice(choice) {
    globalThis.__EST_SETTINGS__ = Object.assign({}, globalThis.__EST_SETTINGS__ || {}, {
      sourceLang: choice.source,
      targetLang: choice.target
    });
    if (chrome.storage && chrome.storage.local && ESTNS.saveSettings) {
      ESTNS.saveSettings(chrome.storage.local, {
        sourceLang: choice.source,
        targetLang: choice.target
      }).catch(function () {});
    }
  }

  function speak(text, lang) {
    const result = ESTNS.speakText(text, lang, {
      synth: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance
    });
    if (!result.ok) {
      controller.setStatus(result.reason === 'empty' ? '没有可朗读的文本' : '当前环境不支持朗读');
    }
    return result;
  }

  controller.setHandlers({
    onLanguageChange: function () {
      const text = controller.getText();
      const choice = controller.getChoice();
      persistChoice(choice);
      if (text) requestTranslation(text, lastPointer);
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
      persistChoice(next);
      const text = controller.getText();
      if (text) requestTranslation(text, lastPointer);
    },
    onCopy: function () {
      const text = controller.getTranslation();
      ESTNS.copyText(text, { clipboard: navigator.clipboard, doc: doc }).then(function (result) {
        if (!controller.isOpen()) return;
        if (result.reason === 'empty') controller.setStatus('还没有译文');
        else controller.setStatus(result.ok ? '已复制译文' : '复制失败');
      });
    },
    onSpeakOriginal: function () {
      const choice = controller.getChoice();
      const lang = choice.source === 'auto' ? (controller.getDetected() || 'en') : choice.source;
      speak(controller.getText(), lang);
    },
    onSpeakTranslation: function () {
      speak(controller.getTranslation(), controller.getChoice().target);
    },
    onStyleChange: function () {
      const style = controller.getStyle();
      globalThis.__EST_SETTINGS__ = Object.assign({}, globalThis.__EST_SETTINGS__ || {}, { style: style });
      if (ESTNS.saveSettings && chrome.storage && chrome.storage.local) {
        ESTNS.saveSettings(chrome.storage.local, { style: style }).catch(function () {});
      }
      const text = controller.getText();
      if (text) requestTranslation(text, lastPointer);
    },
    onClose: function () {
      stopSpeaking();
    },
    onFavorite: function () {
      const text = controller.getText();
      const translated = controller.getTranslation();
      if (!translated) {
        controller.setStatus('还没有译文');
        return;
      }
      const choice = controller.getChoice();
      const entry = {
        sourceText: text,
        translatedText: translated,
        sourceLang: choice.source === 'auto' ? (controller.getDetected() || '') : choice.source,
        targetLang: choice.target,
        engine: ''
      };
      ESTNS.loadSettings(chrome.storage.local).then(function (settings) {
        const favorites = ESTNS.toggleFavorite(settings.favorites, entry);
        return ESTNS.saveSettings(chrome.storage.local, { favorites: favorites }).then(function () {
          controller.setFavorite(ESTNS.isFavorite(favorites, entry));
          controller.setStatus(ESTNS.isFavorite(favorites, entry) ? '已加入收藏' : '已取消收藏');
        });
      }).catch(function () {
        controller.setStatus('收藏失败');
      });
    }
  });

  function applySettings(settings) {
    globalThis.__EST_SETTINGS__ = settings;
    controller.setChoice(settings.sourceLang, settings.targetLang);
    if (controller.setStyle) controller.setStyle(settings.style || 'normal');
  }

  if (chrome.storage && chrome.storage.local && ESTNS.mergeSettings) {
    const key = ESTNS.STORAGE_KEY || 'estSettings';
    chrome.storage.local.get(key, function (data) {
      if (chrome.runtime.lastError) return;
      applySettings(ESTNS.mergeSettings(data && data[key]));
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes[key]) return;
      applySettings(ESTNS.mergeSettings(changes[key].newValue));
    });
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message) return undefined;
    // runtime.sendMessage is broadcast to every frame. Translation replies
    // belong to the service worker; answering here would close its port.
    if (message.type === 'translate') return false;
    if (message.type === 'force-translate') {
      globalThis.__EST_FORCE_TRANSLATE__();
      return undefined;
    }
    if (message.type === 'site-status') {
      const cached = globalThis.__EST_SETTINGS__ || {};
      sendResponse({
        host: location.hostname,
        blacklisted: ESTNS.isBlacklisted
          ? ESTNS.isBlacklisted(cached.blacklist || [], location.hostname)
          : false
      });
      return true;
    }
    if (message.type === 'toggle-blacklist') {
      ESTNS.loadSettings(chrome.storage.local).then(function (settings) {
        const host = location.hostname;
        const blacklist = ESTNS.isBlacklisted(settings.blacklist, host)
          ? ESTNS.removeHost(settings.blacklist, host)
          : ESTNS.addHost(settings.blacklist, host);
        return ESTNS.saveSettings(chrome.storage.local, { blacklist: blacklist }).then(function (next) {
          globalThis.__EST_SETTINGS__ = next;
          sendResponse({
            host: host,
            blacklisted: ESTNS.isBlacklisted(next.blacklist, host)
          });
        });
      }).catch(function () { sendResponse({ ok: false }); });
      return true;
    }
    return undefined;
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
