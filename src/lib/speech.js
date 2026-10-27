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
      rate: 1,
      pitch: 1
    };
  }

  function normalizeLang(lang) {
    return String(lang || '').toLowerCase().replace(/_/g, '-');
  }

  function primaryLang(lang) {
    const normalized = normalizeLang(lang);
    if (normalized === 'cmn' || normalized.indexOf('cmn-') === 0 || normalized.indexOf('zh') === 0) return 'zh';
    return normalized.split('-')[0];
  }

  function isRemoteVoice(voice) {
    if (!voice || voice.localService === false) return true;
    const name = String(voice.name || '');
    if (/^google\b/i.test(name)) return true;
    if (/\bonline\b/i.test(name) && voice.localService !== true) return true;
    return false;
  }

  function isNoveltyVoice(voice) {
    return /whisper|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|zarvox|wobble|albert|fred|ralph|junior|kathy|grandma|grandpa|rocko|sandy|shelley|eddy|flo|reed/i.test(String(voice && voice.name || ''));
  }

  function chooseVoice(voices, lang) {
    const wanted = normalizeLang(lang);
    const wantedPrimary = primaryLang(wanted);
    let best = null;
    let bestScore = 0;
    (Array.isArray(voices) ? voices : []).forEach(function (voice) {
      if (!voice || isRemoteVoice(voice) || isNoveltyVoice(voice)) return;
      const voiceLang = normalizeLang(voice.lang);
      const samePrimary = primaryLang(voiceLang) && primaryLang(voiceLang) === wantedPrimary;
      if (!samePrimary) return;
      let score = voiceLang === wanted ? 40 : 20;
      if (voice.localService === true) score += 10;
      if (voice.default) score += 8;
      if (/espeak|android/i.test(String(voice.name || ''))) score -= 6;
      if (score > bestScore) {
        best = voice;
        bestScore = score;
      }
    });
    return best;
  }

  function stopSpeech(env) {
    const synth = env && env.synth;
    if (!synth || typeof synth.cancel !== 'function') return false;
    synth.cancel();
    return true;
  }

  function speakText(text, langCode, env) {
    const options = buildUtterance(text, langCode);
    if (!options.text.trim()) return { ok: false, reason: 'empty', options: options };
    const synth = env && env.synth;
    const Utterance = env && env.Utterance;
    if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function') {
      return { ok: false, reason: 'unsupported', options: options };
    }
    const voice = chooseVoice(typeof synth.getVoices === 'function' ? synth.getVoices() : [], options.lang);
    const utter = new Utterance(options.text);
    utter.lang = options.lang;
    utter.rate = 1;
    utter.pitch = 1;
    if (voice) {
      utter.voice = voice;
      options.voice = voice.name;
    }
    stopSpeech(env);
    synth.speak(utter);
    return { ok: true, options: options };
  }

  return { buildUtterance, chooseVoice, stopSpeech, speakText };
});
