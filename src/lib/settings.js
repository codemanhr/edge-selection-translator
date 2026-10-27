(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'estSettings';
  const FREE_ENGINES = ['mymemory', 'google', 'bing'];
  const ENGINES = ['mymemory', 'google', 'bing', 'deepl', 'openai', 'libretranslate', 'azure'];
  const STYLES = ['normal', 'colloquial', 'formal'];

  const DEFAULT_API = {
    deeplKey: '',
    deeplPro: false,
    openaiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-4o-mini',
    libreUrl: 'https://libretranslate.com',
    libreKey: '',
    azureKey: '',
    azureRegion: 'global'
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeSettings(partial) {
    const src = partial && typeof partial === 'object' ? partial : {};
    const style = STYLES.indexOf(src.style) === -1 ? 'normal' : src.style;
    const engine = typeof src.engine === 'string' && src.engine ? src.engine : 'mymemory';
    return {
      enabled: src.enabled !== false,
      sourceLang: src.sourceLang || 'auto',
      targetLang: src.targetLang || 'zh-Hans',
      engine: engine,
      style: style,
      keepProperNouns: src.keepProperNouns !== false,
      theme: src.theme === 'light' || src.theme === 'dark' ? src.theme : 'system',
      shortcutDisplay: src.shortcutDisplay === 'mac' || src.shortcutDisplay === 'windows' ? src.shortcutDisplay : 'auto',
      blacklist: Array.isArray(src.blacklist) ? src.blacklist.map(String).slice(0, 200) : [],
      history: Array.isArray(src.history) ? src.history.slice(0, 50) : [],
      favorites: Array.isArray(src.favorites) ? src.favorites.slice(0, 100) : [],
      api: Object.assign({}, DEFAULT_API, src.api || {})
    };
  }

  async function loadSettings(storage) {
    const data = await storage.get(STORAGE_KEY);
    return mergeSettings(data && data[STORAGE_KEY]);
  }

  async function saveSettings(storage, partial) {
    const current = await loadSettings(storage);
    const patch = partial && typeof partial === 'object' ? partial : {};
    const merged = Object.assign({}, current, patch);
    if (!Object.prototype.hasOwnProperty.call(patch, 'blacklist')) merged.blacklist = current.blacklist;
    if (!Object.prototype.hasOwnProperty.call(patch, 'history')) merged.history = current.history;
    if (!Object.prototype.hasOwnProperty.call(patch, 'favorites')) merged.favorites = current.favorites;
    merged.api = Object.assign({}, current.api, patch.api || {});
    const next = mergeSettings(merged);
    const payload = {};
    payload[STORAGE_KEY] = next;
    await storage.set(payload);
    return next;
  }

  function createMemoryStorage(initial) {
    const data = clone(initial || {});
    return {
      async get(key) {
        if (typeof key === 'string') {
          const out = {};
          out[key] = data[key];
          return out;
        }
        return clone(data);
      },
      async set(obj) {
        Object.keys(obj || {}).forEach(function (key) {
          data[key] = obj[key];
        });
      },
      dump: function () { return clone(data); }
    };
  }

  return {
    STORAGE_KEY,
    FREE_ENGINES,
    ENGINES,
    STYLES,
    DEFAULT_API,
    mergeSettings,
    loadSettings,
    saveSettings,
    createMemoryStorage
  };
});
