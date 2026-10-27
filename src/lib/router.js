(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FREE_CHAIN = ['bing', 'google', 'mymemory'];

  function lib(file) {
    if (globalThis.EST && globalThis.EST.detectLanguage && globalThis.EST.runEngine && globalThis.EST.resolveDirection) {
      return globalThis.EST;
    }
    if (file === 'detect') return require('./detect.js');
    if (file === 'direction') return require('./direction.js');
    if (file === 'engines') return require('./engines.js');
    if (file === 'languages') return require('./languages.js');
    return globalThis.EST || {};
  }

  function chainFor(engine) {
    const preferred = FREE_CHAIN.indexOf(engine) === -1 ? 'bing' : engine;
    return [preferred].concat(FREE_CHAIN.filter(function (name) { return name !== preferred; }));
  }

  async function translateText(request, deps) {
    const detect = lib('detect');
    const directionApi = lib('direction');
    const engines = lib('engines');
    const languages = lib('languages');
    const sourceText = String((request && request.text) || '').replace(/\s+/g, ' ').trim();
    if (!sourceText) return { ok: false, error: '没有可翻译的文本', attempts: [] };

    const sourceLang = (request && request.sourceLang) || 'auto';
    const targetLang = (request && request.targetLang) || 'zh-Hans';
    const preferred = (request && request.engine) || 'bing';
    const detectedLocal = sourceLang === 'auto' ? detect.detectLanguage(sourceText) : sourceLang;
    const direction = directionApi.resolveDirection({
      sourceLang: sourceLang,
      targetLang: targetLang,
      detected: detectedLocal
    });
    const chain = chainFor(preferred);
    const attempts = [];
    const runtime = Object.assign({}, deps || {});
    if (!runtime.authCache) runtime.authCache = engines.createAuthCache();

    for (let i = 0; i < chain.length; i += 1) {
      const name = chain[i];
      try {
        const result = await engines.runEngine(name, {
          text: sourceText,
          sourceLang: sourceLang === 'auto' ? 'auto' : direction.source,
          targetLang: direction.target,
          detected: detectedLocal
        }, runtime);
        const detected = languages.normalizeCode(result.detectedLang) || detectedLocal;
        const notes = [];
        if (direction.flipped) {
          notes.push('原文语言与目标语言相同，已改译为' + languages.languageName(direction.target));
        }
        if (name !== preferred) {
          notes.push(languages.engineLabel(preferred) + ' 不可用，已改用 ' + languages.engineLabel(name));
        }
        return {
          ok: true,
          translatedText: result.text,
          detectedLang: detected,
          sourceLang: sourceLang === 'auto' ? detected : direction.source,
          targetLang: direction.target,
          engine: name,
          fallback: name !== preferred,
          note: notes.join(' '),
          attempts: attempts
        };
      } catch (err) {
        attempts.push({
          engine: name,
          error: (err && err.message) || '翻译失败'
        });
      }
    }

    return {
      ok: false,
      error: '翻译失败。' + attempts.map(function (item) {
        return languages.engineLabel(item.engine) + '：' + item.error;
      }).join(' '),
      attempts: attempts
    };
  }

  return { translateText, FREE_CHAIN, chainFor };
});
