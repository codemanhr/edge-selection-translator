(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Place the panel tightly beside the cursor, flipping toward the
   * opposite side when it would leave the viewport.
   * anchor: {x, y} in client pixels (typically the mouseup point)
   * panel: {width, height}
   * viewport: {width, height}
   */
  function computePanelPosition(anchor, panel, viewport, margin) {
    const gap = Number.isFinite(margin) ? margin : 8;
    const width = Math.max(0, Number(panel && panel.width) || 0);
    const height = Math.max(0, Number(panel && panel.height) || 0);
    const vw = Math.max(0, Number(viewport && viewport.width) || 0);
    const vh = Math.max(0, Number(viewport && viewport.height) || 0);
    const x = Number(anchor && anchor.x) || 0;
    const y = Number(anchor && anchor.y) || 0;

    let left = x + gap;
    let top = y + gap;

    if (left + width + gap > vw) left = x - width - gap;
    if (top + height + gap > vh) top = y - height - gap;

    const maxLeft = Math.max(gap, vw - width - gap);
    const maxTop = Math.max(gap, vh - height - gap);
    left = clamp(left, Math.min(gap, maxLeft), maxLeft);
    top = clamp(top, Math.min(gap, maxTop), maxTop);

    return {
      left: Math.round(left),
      top: Math.round(top)
    };
  }

  return { computePanelPosition };
});
