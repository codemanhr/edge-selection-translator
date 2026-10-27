(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Free engines used by the extension. No API key.
   *
   * Bing: the public Bing Translator page (www.bing.com/translator) exposes a
   * short-lived token in the HTML (`params_AbusePreventionHelper`) and a POST
   * endpoint `/ttranslatev3`. This replaced the older edge.microsoft.com/translate/auth
   * endpoint, which currently returns 404. The HTML contract can change, and
   * some non-browser user agents receive HTTP 401. Text is sent to Microsoft.
   *
   * Google: unofficial `translate.googleapis.com` `client=gtx` endpoint. It has
   * no key, no SLA, and can be rate-limited or removed. Text is sent to Google.
   *
   * MyMemory: anonymous translated.net API, about 500 characters per request and
   * a small daily word quota. Quota errors come back as "MYMEMORY WARNING".
   * Text is sent to Translated.
   */

  function EngineError(message, info) {
    const err = new Error(message);
    err.name = 'EngineError';
    err.engine = info && info.engine;
    err.status = info && info.status;
    return err;
  }

  function langApi() {
    if (globalThis.EST && globalThis.EST.engineCode) return globalThis.EST;
    return require('./languages.js');
  }

  function splitForLimit(text, limit) {
    const source = String(text || '');
    if (source.length <= limit) return [source];
    const chunks = [];
    let start = 0;
    const breaks = ['\n', '。', '！', '？', '. ', '! ', '? ', '; ', '，', ', ', ' '];
    while (start < source.length) {
      if (source.length - start <= limit) {
        chunks.push(source.slice(start));
        break;
      }
      const window = source.slice(start, start + limit);
      let cut = -1;
      for (let i = 0; i < breaks.length; i += 1) {
        const at = window.lastIndexOf(breaks[i]);
        if (at >= Math.floor(limit * 0.4)) {
          cut = at + breaks[i].length;
          break;
        }
      }
      if (cut < 0) cut = limit;
      chunks.push(source.slice(start, start + cut));
      start += cut;
    }
    return chunks;
  }

  function createAuthCache() {
    const store = new Map();
    return {
      get: function (name, now) {
        const hit = store.get(name);
        if (!hit || hit.exp <= now) return null;
        return hit.value;
      },
      set: function (name, value, exp) {
        store.set(name, { value: value, exp: exp });
      }
    };
  }

  async function httpRequest(url, options, deps) {
    const fetchImpl = (deps && deps.fetch) || fetch;
    const headers = Object.assign({}, (options && options.headers) || {});
    if (deps && deps.userAgent) headers['User-Agent'] = deps.userAgent;
    const timeoutMs = (deps && deps.timeoutMs) || 12000;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    try {
      return await fetchImpl(url, Object.assign({}, options, {
        headers: headers,
        signal: controller ? controller.signal : undefined
      }));
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw EngineError('请求超时', { engine: options && options.engine });
      }
      throw EngineError('网络错误', { engine: options && options.engine });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function parseBingAuth(html) {
    const source = String(html || '');
    const ig = source.match(/IG:"([A-F0-9]+)"/i);
    const params = source.match(/params_AbusePreventionHelper\s*=\s*\[(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\]/);
    if (!ig || !params) {
      throw EngineError('无法读取 Bing 翻译令牌', { engine: 'bing' });
    }
    return {
      ig: ig[1],
      key: params[1],
      token: params[2],
      ttl: Number(params[3]) || 600000
    };
  }

  async function bingCredentials(deps) {
    const now = typeof deps.now === 'function' ? deps.now() : Date.now();
    const cache = deps.authCache;
    if (cache) {
      const cached = cache.get('bing', now);
      if (cached) return cached;
    }
    const response = await httpRequest('https://www.bing.com/translator', {
      method: 'GET',
      engine: 'bing'
    }, deps);
    if (!response.ok) {
      throw EngineError('Bing 页面不可用（HTTP ' + response.status + '）', { engine: 'bing', status: response.status });
    }
    const html = await response.text();
    const creds = parseBingAuth(html);
    if (cache) cache.set('bing', creds, now + Math.min(creds.ttl || 600000, 30 * 60 * 1000) - 60000);
    return creds;
  }

  function parseBingTranslation(payload) {
    let data = payload;
    if (typeof payload === 'string') {
      try { data = JSON.parse(payload); } catch (err) {
        throw EngineError('Bing 返回了无法解析的结果', { engine: 'bing' });
      }
    }
    if (data && data.ShowCaptcha) {
      throw EngineError('Bing 要求验证，请稍后重试', { engine: 'bing' });
    }
    if (data && data.statusCode && !Array.isArray(data)) {
      throw EngineError('Bing 翻译失败（' + data.statusCode + '）', { engine: 'bing', status: data.statusCode });
    }
    const first = Array.isArray(data) ? data[0] : null;
    const translated = first && first.translations && first.translations[0] && first.translations[0].text;
    if (!translated) throw EngineError('Bing 返回空结果', { engine: 'bing' });
    const detected = first.detectedLanguage && first.detectedLanguage.language;
    return { text: translated, detectedLang: langApi().normalizeCode(detected) };
  }

  async function translateBing(request, deps) {
    const langs = langApi();
    const creds = await bingCredentials(deps);
    const chunks = splitForLimit(request.text, 1000);
    const pieces = [];
    let detectedLang = '';
    for (let i = 0; i < chunks.length; i += 1) {
      const body = new URLSearchParams({
        fromLang: langs.engineCode(request.sourceLang || 'auto', 'bing'),
        to: langs.engineCode(request.targetLang, 'bing'),
        text: chunks[i],
        token: creds.token,
        key: creds.key
      });
      const response = await httpRequest(
        'https://www.bing.com/ttranslatev3?isVertical=1&IG=' + encodeURIComponent(creds.ig) + '&IID=translator.5023.1',
        {
          method: 'POST',
          engine: 'bing',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        },
        deps
      );
      const raw = await response.text();
      if (!response.ok) {
        throw EngineError('Bing 翻译失败（HTTP ' + response.status + '）', { engine: 'bing', status: response.status });
      }
      const parsed = parseBingTranslation(raw);
      pieces.push(parsed.text);
      if (!detectedLang && parsed.detectedLang) detectedLang = parsed.detectedLang;
    }
    return { text: pieces.join(''), detectedLang: detectedLang };
  }

  function parseGoogleTranslation(payload) {
    let data = payload;
    if (typeof payload === 'string') {
      try { data = JSON.parse(payload); } catch (err) {
        throw EngineError('Google 返回了无法解析的结果', { engine: 'google' });
      }
    }
    const rows = data && data[0];
    if (!Array.isArray(rows) || !rows.length) {
      throw EngineError('Google 返回空结果', { engine: 'google' });
    }
    const text = rows.map(function (row) { return (row && row[0]) || ''; }).join('');
    if (!text.trim()) throw EngineError('Google 返回空结果', { engine: 'google' });
    return { text: text, detectedLang: langApi().normalizeCode(data[2]) };
  }

  async function translateGoogle(request, deps) {
    const langs = langApi();
    const chunks = splitForLimit(request.text, 800);
    const pieces = [];
    let detectedLang = '';
    const source = request.sourceLang && request.sourceLang !== 'auto'
      ? langs.engineCode(request.sourceLang, 'google')
      : 'auto';
    const target = langs.engineCode(request.targetLang, 'google');
    for (let i = 0; i < chunks.length; i += 1) {
      const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl='
        + encodeURIComponent(source)
        + '&tl=' + encodeURIComponent(target)
        + '&dt=t&q=' + encodeURIComponent(chunks[i]);
      const response = await httpRequest(url, { method: 'GET', engine: 'google' }, deps);
      const raw = await response.text();
      if (!response.ok) {
        throw EngineError('Google 翻译失败（HTTP ' + response.status + '）', { engine: 'google', status: response.status });
      }
      const parsed = parseGoogleTranslation(raw);
      pieces.push(parsed.text);
      if (!detectedLang && parsed.detectedLang) detectedLang = parsed.detectedLang;
    }
    return { text: pieces.join(''), detectedLang: detectedLang };
  }

  function parseMyMemory(payload) {
    let data = payload;
    if (typeof payload === 'string') {
      try { data = JSON.parse(payload); } catch (err) {
        throw EngineError('MyMemory 返回了无法解析的结果', { engine: 'mymemory' });
      }
    }
    const translated = data && data.responseData && data.responseData.translatedText;
    if (!translated || data.responseStatus !== 200 || data.quotaFinished || /MYMEMORY WARNING/i.test(translated)) {
      throw EngineError('MyMemory 配额用尽或翻译失败', { engine: 'mymemory', status: data && data.responseStatus });
    }
    return { text: translated, detectedLang: '' };
  }

  async function translateMyMemory(request, deps) {
    const langs = langApi();
    const from = request.sourceLang && request.sourceLang !== 'auto'
      ? langs.engineCode(request.sourceLang, 'mymemory')
      : langs.engineCode(request.detected || 'en', 'mymemory');
    const to = langs.engineCode(request.targetLang, 'mymemory');
    if (!to || from === to) {
      throw EngineError('MyMemory 不支持这对语言', { engine: 'mymemory' });
    }
    const chunks = splitForLimit(request.text, 450);
    const pieces = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const url = 'https://api.mymemory.translated.net/get?q='
        + encodeURIComponent(chunks[i])
        + '&langpair=' + encodeURIComponent(from + '|' + to);
      const response = await httpRequest(url, { method: 'GET', engine: 'mymemory' }, deps);
      const raw = await response.text();
      if (!response.ok) {
        throw EngineError('MyMemory 翻译失败（HTTP ' + response.status + '）', { engine: 'mymemory', status: response.status });
      }
      pieces.push(parseMyMemory(raw).text);
    }
    return { text: pieces.join(''), detectedLang: request.detected || '' };
  }

  function styleLine(style) {
    if (style === 'colloquial') return 'Use a more colloquial, conversational tone.';
    if (style === 'formal') return 'Use a more formal, professional tone.';
    return 'Use a natural, neutral tone.';
  }

  function deeplSourceCode(code) {
    const mapped = langApi().engineCode(code, 'deepl');
    if (!mapped) return '';
    if (mapped.indexOf('ZH') === 0) return 'ZH';
    if (mapped.indexOf('EN') === 0) return 'EN';
    if (mapped.indexOf('PT') === 0) return 'PT';
    return mapped;
  }

  async function translateDeepL(request, deps) {
    const api = request.api || {};
    if (!api.deeplKey) throw EngineError('未填写 DeepL API 密钥', { engine: 'deepl' });
    const langs = langApi();
    const target = langs.engineCode(request.targetLang, 'deepl');
    if (!target) throw EngineError('DeepL 不支持该目标语言', { engine: 'deepl' });
    const host = api.deeplPro ? 'https://api.deepl.com' : 'https://api-free.deepl.com';
    const formality = request.style === 'formal' ? 'prefer_more' : request.style === 'colloquial' ? 'prefer_less' : '';

    async function call(useFormality) {
      const body = new URLSearchParams();
      body.set('text', request.text);
      body.set('target_lang', target);
      if (request.sourceLang && request.sourceLang !== 'auto') {
        const source = deeplSourceCode(request.sourceLang);
        if (source) body.set('source_lang', source);
      }
      if (useFormality && formality) body.set('formality', formality);
      const response = await httpRequest(host + '/v2/translate', {
        method: 'POST',
        engine: 'deepl',
        headers: {
          Authorization: 'DeepL-Auth-Key ' + api.deeplKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      }, deps);
      const raw = await response.text();
      if (!response.ok) {
        throw EngineError('DeepL 翻译失败（HTTP ' + response.status + '）', { engine: 'deepl', status: response.status });
      }
      let data;
      try { data = JSON.parse(raw); } catch (err) {
        throw EngineError('DeepL 返回了无法解析的结果', { engine: 'deepl' });
      }
      const row = data.translations && data.translations[0];
      if (!row || !row.text) throw EngineError('DeepL 返回空结果', { engine: 'deepl' });
      return {
        text: row.text,
        detectedLang: langs.normalizeCode(row.detected_source_language),
        styleApplied: !!(useFormality && formality)
      };
    }

    try {
      return await call(true);
    } catch (err) {
      if (formality && err && err.status === 400) return call(false);
      throw err;
    }
  }

  async function translateOpenAI(request, deps) {
    const api = request.api || {};
    if (!api.openaiKey) throw EngineError('未填写 OpenAI 兼容接口的密钥', { engine: 'openai' });
    const base = String(api.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const langs = langApi();
    const system = [
      'You are a translator. Translate the user text into ' + langs.languageName(request.targetLang) + '.',
      styleLine(request.style),
      request.keepProperNouns === false ? '' : 'Keep proper nouns, brand names, URLs, and tokens like XPN0X unchanged.',
      'Output only the translation.'
    ].filter(Boolean).join(' ');
    const response = await httpRequest(base + '/chat/completions', {
      method: 'POST',
      engine: 'openai',
      headers: {
        Authorization: 'Bearer ' + api.openaiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: api.openaiModel || 'gpt-4o-mini',
        temperature: request.style && request.style !== 'normal' ? 0.4 : 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: request.text }
        ]
      })
    }, deps);
    const raw = await response.text();
    if (!response.ok) {
      throw EngineError('OpenAI 兼容接口失败（HTTP ' + response.status + '）', { engine: 'openai', status: response.status });
    }
    let data;
    try { data = JSON.parse(raw); } catch (err) {
      throw EngineError('OpenAI 兼容接口返回了无法解析的结果', { engine: 'openai' });
    }
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text || !String(text).trim()) throw EngineError('OpenAI 兼容接口返回空结果', { engine: 'openai' });
    return {
      text: String(text).trim(),
      detectedLang: request.detected || '',
      styleApplied: true
    };
  }

  async function translateLibre(request, deps) {
    const api = request.api || {};
    const base = String(api.libreUrl || 'https://libretranslate.com').replace(/\/+$/, '');
    const langs = langApi();
    const target = langs.engineCode(request.targetLang, 'libre');
    if (!target) throw EngineError('LibreTranslate 不支持该目标语言', { engine: 'libretranslate' });
    const source = !request.sourceLang || request.sourceLang === 'auto'
      ? 'auto'
      : (langs.engineCode(request.sourceLang, 'libre') || 'auto');
    const response = await httpRequest(base + '/translate', {
      method: 'POST',
      engine: 'libretranslate',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: request.text,
        source: source,
        target: target,
        format: 'text',
        api_key: api.libreKey || ''
      })
    }, deps);
    const raw = await response.text();
    if (!response.ok) {
      throw EngineError('LibreTranslate 失败（HTTP ' + response.status + '）', { engine: 'libretranslate', status: response.status });
    }
    let data;
    try { data = JSON.parse(raw); } catch (err) {
      throw EngineError('LibreTranslate 返回了无法解析的结果', { engine: 'libretranslate' });
    }
    if (!data.translatedText) {
      throw EngineError(data.error || 'LibreTranslate 返回空结果', { engine: 'libretranslate' });
    }
    return { text: data.translatedText, detectedLang: request.detected || '', styleApplied: false };
  }

  async function translateAzure(request, deps) {
    const api = request.api || {};
    if (!api.azureKey) throw EngineError('未填写 Azure 翻译密钥', { engine: 'azure' });
    const langs = langApi();
    const params = new URLSearchParams({
      'api-version': '3.0',
      to: langs.engineCode(request.targetLang, 'bing')
    });
    if (request.sourceLang && request.sourceLang !== 'auto') {
      params.set('from', langs.engineCode(request.sourceLang, 'bing'));
    }
    const response = await httpRequest('https://api.cognitive.microsofttranslator.com/translate?' + params.toString(), {
      method: 'POST',
      engine: 'azure',
      headers: {
        'Ocp-Apim-Subscription-Key': api.azureKey,
        'Ocp-Apim-Subscription-Region': api.azureRegion || 'global',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{ Text: request.text }])
    }, deps);
    const raw = await response.text();
    if (!response.ok) {
      throw EngineError('Azure 翻译失败（HTTP ' + response.status + '）', { engine: 'azure', status: response.status });
    }
    const parsed = parseBingTranslation(raw);
    return { text: parsed.text, detectedLang: parsed.detectedLang, styleApplied: false };
  }

  async function runEngine(engine, request, deps) {
    if (engine === 'bing') return translateBing(request, deps);
    if (engine === 'google') return translateGoogle(request, deps);
    if (engine === 'mymemory') return translateMyMemory(request, deps);
    if (engine === 'deepl') return translateDeepL(request, deps);
    if (engine === 'openai') return translateOpenAI(request, deps);
    if (engine === 'libretranslate') return translateLibre(request, deps);
    if (engine === 'azure') return translateAzure(request, deps);
    throw EngineError('未知翻译引擎', { engine: engine });
  }

  return {
    EngineError,
    splitForLimit,
    createAuthCache,
    parseBingAuth,
    parseBingTranslation,
    parseGoogleTranslation,
    parseMyMemory,
    translateBing,
    translateGoogle,
    translateMyMemory,
    translateDeepL,
    translateOpenAI,
    translateLibre,
    translateAzure,
    runEngine
  };
});
