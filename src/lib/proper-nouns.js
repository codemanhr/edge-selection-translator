(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Latin proper names (two or more title-case words), acronyms, URLs, and emails.
  // Single capitalized words are left alone so sentence starts can still be translated.
  const PATTERN = /https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b[A-Z]{2,}\b|\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;

  function protectProperNouns(text) {
    const tokens = [];
    const source = String(text || '');
    const next = source.replace(PATTERN, function (match) {
      const id = tokens.length;
      tokens.push(match);
      return 'XPN' + id + 'X';
    });
    return { text: next, tokens: tokens };
  }

  function restoreProperNouns(text, tokens) {
    const list = tokens || [];
    return String(text || '').replace(/XPN(\d+)X/g, function (match, index) {
      const value = list[Number(index)];
      return value == null ? match : value;
    });
  }

  return { protectProperNouns, restoreProperNouns };
});
