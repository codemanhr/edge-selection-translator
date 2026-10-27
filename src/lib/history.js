(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createId(now) {
    const stamp = (now || Date.now()).toString(36);
    const noise = Math.random().toString(36).slice(2, 8);
    return stamp + noise;
  }

  function clip(text, max) {
    const value = String(text || '');
    return value.length > max ? value.slice(0, max) : value;
  }

  function samePhrase(left, right) {
    if (!left || !right) return false;
    return left.sourceText === right.sourceText && left.targetLang === right.targetLang;
  }

  function toEntry(entry, now) {
    return {
      id: (entry && entry.id) || createId(now),
      sourceText: clip(entry && entry.sourceText, 2000),
      translatedText: clip(entry && entry.translatedText, 4000),
      sourceLang: (entry && entry.sourceLang) || '',
      targetLang: (entry && entry.targetLang) || '',
      engine: (entry && entry.engine) || '',
      createdAt: (entry && entry.createdAt) || now || Date.now()
    };
  }

  function addHistory(history, entry, limit) {
    const item = toEntry(entry);
    if (!item.sourceText || !item.translatedText) return (history || []).slice();
    const next = [item].concat((history || []).filter(function (row) {
      return row && row.id !== item.id && !samePhrase(row, item);
    }));
    return next.slice(0, limit || 50);
  }

  function removeById(list, id) {
    return (list || []).filter(function (row) { return row && row.id !== id; });
  }

  function isFavorite(favorites, entry) {
    return (favorites || []).some(function (row) { return samePhrase(row, entry); });
  }

  function toggleFavorite(favorites, entry, limit) {
    const item = toEntry(entry);
    if (!item.sourceText || !item.translatedText) return (favorites || []).slice();
    if (isFavorite(favorites, item)) {
      return (favorites || []).filter(function (row) { return !samePhrase(row, item); });
    }
    item.savedAt = Date.now();
    return [item].concat(favorites || []).slice(0, limit || 100);
  }

  return {
    createId,
    samePhrase,
    addHistory,
    removeById,
    isFavorite,
    toggleFavorite
  };
});
