(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeHost(input) {
    let host = String(input || '').trim().toLowerCase();
    host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    if (host.indexOf('@') !== -1) host = host.slice(host.lastIndexOf('@') + 1);
    host = host.replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/^\.+/, '').replace(/\.+$/, '');
    return host;
  }

  function hostFromUrl(url) {
    try {
      return normalizeHost(new URL(url).hostname);
    } catch (err) {
      return normalizeHost(url);
    }
  }

  function isBlacklisted(list, host) {
    const target = normalizeHost(host);
    if (!target) return false;
    return (list || []).some(function (item) {
      const rule = normalizeHost(item);
      if (!rule) return false;
      return target === rule || target.endsWith('.' + rule);
    });
  }

  function addHost(list, host) {
    const rule = normalizeHost(host);
    const next = [];
    (list || []).forEach(function (item) {
      const normalized = normalizeHost(item);
      if (normalized && next.indexOf(normalized) === -1) next.push(normalized);
    });
    if (!rule || next.indexOf(rule) !== -1) return next;
    return [rule].concat(next).slice(0, 200);
  }

  function removeHost(list, host) {
    const rule = normalizeHost(host);
    return (list || []).map(normalizeHost).filter(function (item) {
      return item && item !== rule;
    });
  }

  return { normalizeHost, hostFromUrl, isBlacklisted, addHost, removeHost };
});
