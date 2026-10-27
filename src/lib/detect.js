(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STOPWORDS = {
    en: ['the', 'and', 'is', 'are', 'to', 'of', 'in', 'that', 'it', 'for', 'you', 'with', 'this', 'was', 'on', 'as', 'be'],
    es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'por', 'con', 'para', 'es', 'hola', 'como', 'está', 'estas'],
    fr: ['le', 'la', 'les', 'des', 'de', 'du', 'et', 'est', 'un', 'une', 'que', 'dans', 'pour', 'pas', 'sur', 'bonjour', 'avec'],
    de: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'nicht', 'mit', 'den', 'von', 'für', 'auf', 'auch', 'sich'],
    pt: ['os', 'as', 'de', 'que', 'em', 'um', 'uma', 'para', 'com', 'não', 'na', 'do', 'da', 'é'],
    it: ['il', 'lo', 'la', 'gli', 'che', 'di', 'un', 'una', 'per', 'non', 'con', 'del', 'sono', 'ciao'],
    id: ['yang', 'dan', 'itu', 'untuk', 'dengan', 'ini', 'tidak', 'dari', 'ada'],
    nl: ['het', 'een', 'van', 'en', 'niet', 'dat', 'op', 'voor', 'met', 'zijn'],
    pl: ['się', 'nie', 'jest', 'na', 'że', 'to', 'jak', 'ale', 'czy'],
    vi: ['của', 'và', 'là', 'không', 'một', 'những', 'được', 'cho', 'trong']
  };

  function count(text, pattern) {
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }

  function scoreWords(text, words) {
    const tokens = text.toLowerCase().match(/[a-zà-ÿā-žđơưăâêô]+/gi) || [];
    if (!tokens.length) return 0;
    const wanted = new Set(words);
    let score = 0;
    for (let i = 0; i < tokens.length; i += 1) {
      if (wanted.has(tokens[i])) score += 1;
    }
    return score;
  }

  function detectLanguage(text) {
    const sample = String(text || '').slice(0, 2000);
    if (!sample.trim()) return 'en';

    const hangul = count(sample, /[\uac00-\ud7af]/g);
    const kana = count(sample, /[\u3040-\u30ff]/g);
    const han = count(sample, /[\u4e00-\u9fff]/g);
    const arabic = count(sample, /[\u0600-\u06ff]/g);
    const cyrillic = count(sample, /[\u0400-\u04ff]/g);
    const hebrew = count(sample, /[\u0590-\u05ff]/g);
    const thai = count(sample, /[\u0e00-\u0e7f]/g);
    const devanagari = count(sample, /[\u0900-\u097f]/g);
    const letters = count(sample, /\p{L}/gu) || count(sample, /[A-Za-z\u00c0-\u024f\u0400-\u04ff\u4e00-\u9fff]/g);

    if (kana >= 2 || (kana >= 1 && han >= 1)) return 'ja';
    if (hangul >= 2 || (hangul >= 1 && hangul >= han)) return 'ko';
    if (han >= 2 || (han >= 1 && han >= kana)) return 'zh-Hans';
    if (arabic >= 2) return 'ar';
    if (hebrew >= 2) return 'he';
    if (cyrillic >= 2) return 'ru';
    if (thai >= 2) return 'th';
    if (devanagari >= 2) return 'hi';
    if (/[ăâêôơưđáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(sample)) {
      return 'vi';
    }

    let best = 'en';
    let bestScore = 0;
    const keys = Object.keys(STOPWORDS);
    for (let i = 0; i < keys.length; i += 1) {
      const score = scoreWords(sample, STOPWORDS[keys[i]]);
      if (score > bestScore) {
        best = keys[i];
        bestScore = score;
      }
    }
    if (bestScore === 0 && letters === 0) return 'en';
    return best;
  }

  return { detectLanguage };
});
