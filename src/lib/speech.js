(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function languageTable() {
    if (globalThis.EST && globalThis.EST.bcp47) return globalThis.EST;
    return require('./languages.js');
  }

  function buildUtterance(text, langCode) {
    const table = languageTable();
    return {
      text: String(text || ''),
      lang: table.bcp47(langCode) || 'en-US',
      rate: 1
    };
  }

  function speakText(text, langCode, env) {
    const options = buildUtterance(text, langCode);
    if (!options.text.trim()) return { ok: false, reason: 'empty', options: options };
    const synth = env && env.synth;
    const Utterance = env && env.Utterance;
    if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function') {
      return { ok: false, reason: 'unsupported', options: options };
    }
    const utter = new Utterance(options.text);
    utter.lang = options.lang;
    utter.rate = options.rate;
    if (typeof synth.cancel === 'function') synth.cancel();
    synth.speak(utter);
    return { ok: true, options: options };
  }

  return { buildUtterance, speakText };
});
