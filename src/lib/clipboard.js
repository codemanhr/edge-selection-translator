(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  async function copyText(text, env) {
    const value = String(text || '');
    if (!value.trim()) return { ok: false, reason: 'empty' };
    const clipboard = env && env.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      try {
        await clipboard.writeText(value);
        return { ok: true, via: 'clipboard' };
      } catch (err) {
        // The page can reject the async clipboard. Fall back below.
      }
    }
    const doc = env && env.doc;
    if (!doc || typeof doc.createElement !== 'function' || typeof doc.execCommand !== 'function') {
      return { ok: false, reason: 'unsupported' };
    }
    const area = doc.createElement('textarea');
    area.value = value;
    if (area.setAttribute) area.setAttribute('readonly', '');
    if (area.style) {
      area.style.position = 'fixed';
      area.style.left = '-9999px';
    }
    if (doc.body && doc.body.appendChild) doc.body.appendChild(area);
    if (typeof area.select === 'function') area.select();
    let ok = false;
    try {
      ok = !!doc.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    if (typeof area.remove === 'function') area.remove();
    return { ok: ok, via: 'execCommand' };
  }

  return { copyText };
});
