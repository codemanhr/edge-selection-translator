(function () {
  'use strict';

  if (globalThis.__EST_LOADED__) return;
  globalThis.__EST_LOADED__ = true;

  const doc = document;
  if (!doc || doc.contentType !== 'text/html') return;
  if (!doc.documentElement) return;

  const ESTNS = globalThis.EST || {};
  const controller = ESTNS.mountPanel(doc);

  let lastPointer = { x: 24, y: 24 };

  function settingsSnapshot() {
    const cached = globalThis.__EST_SETTINGS__ || {};
    return {
      enabled: cached.enabled !== false,
      blacklisted: !!cached.blacklisted
    };
  }

  function nodeFromSelection(selection) {
    if (!selection) return null;
    return selection.anchorNode || selection.focusNode || null;
  }

  function handleSelection(point, force) {
    const selection = doc.defaultView.getSelection();
    const inside = selection && controller.isEventInside({
      target: nodeElement(nodeFromSelection(selection)),
      composedPath: function () {
        const node = nodeFromSelection(selection);
        const el = nodeElement(node);
        return el ? [el] : [];
      }
    });
    if (inside) return;

    const flags = settingsSnapshot();
    const inCode = typeof ESTNS.isInCodeContext === 'function'
      ? ESTNS.isInCodeContext(nodeFromSelection(selection))
      : false;
    const decision = ESTNS.analyzeSelection({
      text: ESTNS.readSelectionText(selection),
      inCode: inCode,
      inPassword: ESTNS.isPasswordNode(nodeFromSelection(selection)),
      enabled: flags.enabled,
      blacklisted: flags.blacklisted,
      force: !!force,
      maxLength: ESTNS.MAX_SELECTION_CHARS
    });

    if (decision.action === 'ignore') return;

    const anchor = ESTNS.selectionAnchorPoint(selection) || point || lastPointer;
    if (decision.action === 'error') {
      controller.open({
        x: anchor.x,
        y: anchor.y,
        text: decision.text,
        status: '选区过长，已截断到 ' + ESTNS.MAX_SELECTION_CHARS + ' 字，仍未发送翻译。'
      });
      return;
    }

    if (controller.isOpen() && controller.getText() === decision.text && !force) {
      controller.open({
        x: anchor.x,
        y: anchor.y,
        text: decision.text,
        status: ''
      });
      return;
    }

    controller.open({
      x: anchor.x,
      y: anchor.y,
      text: decision.text,
      status: ''
    });
    globalThis.__EST_LAST_SELECTION__ = decision.text;
  }

  function nodeElement(node) {
    if (!node) return null;
    return node.nodeType === 3 ? node.parentElement : node;
  }

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
    }
  }, true);

  doc.addEventListener('scroll', function (event) {
    const inside = controller.isEventInside(event);
    if (ESTNS.shouldDismissPanel({
      type: 'scroll',
      panelOpen: controller.isOpen(),
      insidePanel: inside
    })) {
      controller.close();
    }
  }, true);

  globalThis.__EST_FORCE_TRANSLATE__ = function () {
    handleSelection(lastPointer, true);
  };
})();
