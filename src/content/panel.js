(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function mountPanel(doc, deps) {
    const ESTNS = (typeof globalThis !== 'undefined' && globalThis.EST) || {};
    const constants = (deps && deps.constants) || ESTNS;
    const cssText = (deps && deps.panelCSS) || ESTNS.panelCSS || '';
    const positionOf = (deps && deps.computePanelPosition) || ESTNS.computePanelPosition;
    const hostId = constants.HOST_ID || 'est-selection-translator-host';
    const margin = constants.PANEL_MARGIN || 8;

    let host = doc.getElementById(hostId);
    if (host && host.shadowRoot) {
      host.remove();
      host = null;
    }

    host = doc.createElement('div');
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
      '  <div class="title">划词翻译</div>',
      '  <button type="button" class="close" data-role="close" aria-label="关闭">×</button>',
      '</div>',
      '<div class="body" data-role="body"></div>',
      '<div class="status" data-role="status"></div>'
    ].join('');
    shadow.appendChild(style);
    shadow.appendChild(panel);

    const bodyEl = panel.querySelector('[data-role="body"]');
    const statusEl = panel.querySelector('[data-role="status"]');
    const closeBtn = panel.querySelector('[data-role="close"]');

    let open = false;
    let currentText = '';

    function place(point) {
      const rect = panel.getBoundingClientRect();
      const viewport = {
        width: doc.defaultView ? doc.defaultView.innerWidth : 800,
        height: doc.defaultView ? doc.defaultView.innerHeight : 600
      };
      const pos = positionOf
        ? positionOf(point, { width: rect.width || 300, height: rect.height || 80 }, viewport, margin)
        : { left: point.x + margin, top: point.y + margin };
      host.style.left = pos.left + 'px';
      host.style.top = pos.top + 'px';
    }

    function openPanel(options) {
      const point = options || { x: margin, y: margin };
      currentText = options.text || '';
      bodyEl.textContent = currentText;
      statusEl.textContent = options.status || '';
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
      host.style.display = 'none';
      bodyEl.textContent = '';
      statusEl.textContent = '';
    }

    closeBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
    });

    const parent = doc.documentElement || doc.body;
    parent.appendChild(host);

    return {
      host: host,
      open: openPanel,
      close: closePanel,
      isOpen: function () { return open; },
      getText: function () { return currentText; },
      isEventInside: function (event) {
        if (!event || typeof event.composedPath !== 'function') {
          return event && event.target === host;
        }
        const path = event.composedPath();
        return path.indexOf(host) !== -1 || path.indexOf(panel) !== -1;
      }
    };
  }

  return { mountPanel };
});
