(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LANGUAGES = [
    { code: 'auto', name: '自动检测', nameEn: 'Auto', bing: 'auto-detect', google: 'auto', mymemory: 'Autodetect', deepl: null, libre: 'auto', bcp47: '' },
    { code: 'zh-Hans', name: '简体中文', nameEn: 'Chinese (Simplified)', bing: 'zh-Hans', google: 'zh-CN', mymemory: 'zh-CN', deepl: 'ZH-HANS', libre: 'zh', bcp47: 'zh-CN' },
    { code: 'zh-Hant', name: '繁体中文', nameEn: 'Chinese (Traditional)', bing: 'zh-Hant', google: 'zh-TW', mymemory: 'zh-TW', deepl: 'ZH-HANT', libre: 'zt', bcp47: 'zh-TW' },
    { code: 'en', name: '英语', nameEn: 'English', bing: 'en', google: 'en', mymemory: 'en', deepl: 'EN', libre: 'en', bcp47: 'en-US' },
    { code: 'ja', name: '日语', nameEn: 'Japanese', bing: 'ja', google: 'ja', mymemory: 'ja', deepl: 'JA', libre: 'ja', bcp47: 'ja-JP' },
    { code: 'ko', name: '韩语', nameEn: 'Korean', bing: 'ko', google: 'ko', mymemory: 'ko', deepl: 'KO', libre: 'ko', bcp47: 'ko-KR' },
    { code: 'fr', name: '法语', nameEn: 'French', bing: 'fr', google: 'fr', mymemory: 'fr', deepl: 'FR', libre: 'fr', bcp47: 'fr-FR' },
    { code: 'de', name: '德语', nameEn: 'German', bing: 'de', google: 'de', mymemory: 'de', deepl: 'DE', libre: 'de', bcp47: 'de-DE' },
    { code: 'es', name: '西班牙语', nameEn: 'Spanish', bing: 'es', google: 'es', mymemory: 'es', deepl: 'ES', libre: 'es', bcp47: 'es-ES' },
    { code: 'pt', name: '葡萄牙语', nameEn: 'Portuguese', bing: 'pt', google: 'pt', mymemory: 'pt', deepl: 'PT-BR', libre: 'pt', bcp47: 'pt-BR' },
    { code: 'ru', name: '俄语', nameEn: 'Russian', bing: 'ru', google: 'ru', mymemory: 'ru', deepl: 'RU', libre: 'ru', bcp47: 'ru-RU' },
    { code: 'it', name: '意大利语', nameEn: 'Italian', bing: 'it', google: 'it', mymemory: 'it', deepl: 'IT', libre: 'it', bcp47: 'it-IT' },
    { code: 'nl', name: '荷兰语', nameEn: 'Dutch', bing: 'nl', google: 'nl', mymemory: 'nl', deepl: 'NL', libre: 'nl', bcp47: 'nl-NL' },
    { code: 'pl', name: '波兰语', nameEn: 'Polish', bing: 'pl', google: 'pl', mymemory: 'pl', deepl: 'PL', libre: 'pl', bcp47: 'pl-PL' },
    { code: 'tr', name: '土耳其语', nameEn: 'Turkish', bing: 'tr', google: 'tr', mymemory: 'tr', deepl: 'TR', libre: 'tr', bcp47: 'tr-TR' },
    { code: 'uk', name: '乌克兰语', nameEn: 'Ukrainian', bing: 'uk', google: 'uk', mymemory: 'uk', deepl: 'UK', libre: 'uk', bcp47: 'uk-UA' },
    { code: 'ar', name: '阿拉伯语', nameEn: 'Arabic', bing: 'ar', google: 'ar', mymemory: 'ar', deepl: 'AR', libre: 'ar', bcp47: 'ar-SA' },
    { code: 'he', name: '希伯来语', nameEn: 'Hebrew', bing: 'he', google: 'he', mymemory: 'he', deepl: null, libre: 'he', bcp47: 'he-IL' },
    { code: 'hi', name: '印地语', nameEn: 'Hindi', bing: 'hi', google: 'hi', mymemory: 'hi', deepl: null, libre: 'hi', bcp47: 'hi-IN' },
    { code: 'th', name: '泰语', nameEn: 'Thai', bing: 'th', google: 'th', mymemory: 'th', deepl: null, libre: 'th', bcp47: 'th-TH' },
    { code: 'vi', name: '越南语', nameEn: 'Vietnamese', bing: 'vi', google: 'vi', mymemory: 'vi', deepl: null, libre: 'vi', bcp47: 'vi-VN' },
    { code: 'id', name: '印尼语', nameEn: 'Indonesian', bing: 'id', google: 'id', mymemory: 'id', deepl: 'ID', libre: 'id', bcp47: 'id-ID' }
  ];

  const ALIASES = {
    zh: 'zh-Hans',
    'zh-cn': 'zh-Hans',
    'zh-hans': 'zh-Hans',
    'zh-chs': 'zh-Hans',
    'zh-sg': 'zh-Hans',
    'zh-tw': 'zh-Hant',
    'zh-hk': 'zh-Hant',
    'zh-hant': 'zh-Hant',
    'zh-cht': 'zh-Hant',
    'en-us': 'en',
    'en-gb': 'en',
    'pt-br': 'pt',
    'pt-pt': 'pt',
    'auto-detect': 'auto',
    autodetect: 'auto',
    und: ''
  };

  function languageByCode(code) {
    const normalized = normalizeCode(code);
    for (let i = 0; i < LANGUAGES.length; i += 1) {
      if (LANGUAGES[i].code === normalized) return LANGUAGES[i];
    }
    return null;
  }

  function normalizeCode(code) {
    if (code == null) return '';
    const raw = String(code).trim();
    if (!raw) return '';
    const key = raw.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ALIASES, key)) return ALIASES[key];
    for (let i = 0; i < LANGUAGES.length; i += 1) {
      const lang = LANGUAGES[i];
      if (lang.code.toLowerCase() === key) return lang.code;
      if (lang.bing && lang.bing.toLowerCase() === key) return lang.code;
      if (lang.google && lang.google.toLowerCase() === key) return lang.code;
      if (lang.mymemory && lang.mymemory.toLowerCase() === key) return lang.code;
    }
    return raw;
  }

  function engineCode(code, engine) {
    if (code === 'auto' || code === '' || code == null) {
      if (engine === 'bing') return 'auto-detect';
      if (engine === 'google') return 'auto';
      if (engine === 'mymemory') return 'Autodetect';
      return 'auto';
    }
    const lang = languageByCode(code);
    if (!lang) return String(code);
    if (engine === 'bing') return lang.bing;
    if (engine === 'google') return lang.google;
    if (engine === 'mymemory') return lang.mymemory;
    if (engine === 'deepl') return lang.deepl;
    if (engine === 'libre') return lang.libre;
    return lang.code;
  }

  function languageName(code) {
    if (!code || code === 'auto') return '自动检测';
    const lang = languageByCode(code);
    return lang ? lang.name : String(code);
  }

  function bcp47(code) {
    const lang = languageByCode(code);
    return (lang && lang.bcp47) || 'en-US';
  }

  const ENGINE_LABELS = {
    bing: 'Bing 翻译',
    google: 'Google 翻译',
    mymemory: 'MyMemory',
    deepl: 'DeepL',
    libretranslate: 'LibreTranslate',
    openai: 'OpenAI 兼容',
    azure: 'Azure 翻译'
  };

  function engineLabel(engine) {
    return ENGINE_LABELS[engine] || engine || '翻译引擎';
  }

  return {
    LANGUAGES,
    languageByCode,
    normalizeCode,
    engineCode,
    languageName,
    bcp47,
    ENGINE_LABELS,
    engineLabel
  };
});
