(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function alternate(code) {
    return code === 'en' ? 'zh-Hans' : 'en';
  }

  function resolveDirection(input) {
    const sourceLang = (input && input.sourceLang) || 'auto';
    const targetLang = (input && input.targetLang) || 'zh-Hans';
    const detected = (input && input.detected) || '';
    const source = sourceLang === 'auto' ? (detected || 'en') : sourceLang;
    let target = targetLang;
    let flipped = false;
    if (source && source === target) {
      target = alternate(source);
      flipped = true;
    }
    return { source: source, target: target, flipped: flipped };
  }

  function swapLanguages(input) {
    const source = (input && input.source) || 'auto';
    const target = (input && input.target) || 'zh-Hans';
    const detected = (input && input.detected) || '';
    const resolvedSource = source === 'auto' ? (detected || 'en') : source;
    let nextSource = target === 'auto' ? (detected || 'en') : target;
    let nextTarget = resolvedSource;
    if (nextSource === nextTarget) nextTarget = alternate(nextSource);
    return { source: nextSource, target: nextTarget };
  }

  return { resolveDirection, swapLanguages };
});
