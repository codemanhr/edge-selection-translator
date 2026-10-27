(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FREE_CHAIN = ['bing', 'google', 'mymemory'];
  const KEYED_ENGINES = ['deepl', 'openai', 'libretranslate', 'azure'];

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
    const requested = engine || 'bing';
    if (FREE_CHAIN.indexOf(requested) !== -1) {
      return [requested].concat(FREE_CHAIN.filter(function (name) { return name !== requested; }));
    }
    if (KEYED_ENGINES.indexOf(requested) !== -1) {
      return [requested].concat(FREE_CHAIN);
    }
    return ['bing'].concat(FREE_CHAIN.filter(function (name) { return name !== 'bing'; }));
  }

  function nounTools() {
    if (globalThis.EST && globalThis.EST.protectProperNouns) return globalThis.EST;
    return require('./proper-nouns.js');
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
    const nouns = nounTools();
    const keepNames = !request || request.keepProperNouns !== false;
    const shielded = keepNames ? nouns.protectProperNouns(sourceText) : { text: sourceText, tokens: [] };
    const style = (request && request.style) || 'normal';

    for (let i = 0; i < chain.length; i += 1) {
      const name = chain[i];
      try {
        const result = await engines.runEngine(name, {
          text: shielded.text,
          sourceLang: sourceLang === 'auto' ? 'auto' : direction.source,
          targetLang: direction.target,
          detected: detectedLocal,
          style: style,
          keepProperNouns: keepNames,
          api: (request && request.api) || {}
        }, runtime);
        const detected = languages.normalizeCode(result.detectedLang) || detectedLocal;
        const notes = [];
        if (direction.flipped) {
          notes.push('原文语言与目标语言相同，已改译为' + languages.languageName(direction.target));
        }
        if (name !== preferred) {
          notes.push(languages.engineLabel(preferred) + ' 不可用，已改用 ' + languages.engineLabel(name));
        }
        if (style !== 'normal' && !result.styleApplied) {
          notes.push('当前引擎不支持语气调整，已按普通风格翻译');
        }
        return {
          ok: true,
          translatedText: nouns.restoreProperNouns(result.text, shielded.tokens),
          styleApplied: !!result.styleApplied,
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
