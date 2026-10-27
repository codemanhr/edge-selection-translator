'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { detectLanguage } = require('../src/lib/detect.js');
const { resolveDirection, swapLanguages } = require('../src/lib/direction.js');
const { normalizeCode, engineCode, languageName } = require('../src/lib/languages.js');
const {
  parseBingAuth,
  parseBingTranslation,
  parseGoogleTranslation,
  parseMyMemory,
  splitForLimit,
  createAuthCache
} = require('../src/lib/engines.js');
const { translateText, chainFor } = require('../src/lib/router.js');

function jsonResponse(status, body) {
  return {
    ok: status < 400,
    status: status,
    text: async function () { return typeof body === 'string' ? body : JSON.stringify(body); }
  };
}

test('local detection covers the main scripts and a few Latin languages', function () {
  assert.equal(detectLanguage('The cat is on the mat'), 'en');
  assert.equal(detectLanguage('你好，世界'), 'zh-Hans');
  assert.equal(detectLanguage('こんにちは、世界'), 'ja');
  assert.equal(detectLanguage('안녕하세요'), 'ko');
  assert.equal(detectLanguage('Привет, мир'), 'ru');
  assert.equal(detectLanguage('Bonjour le monde'), 'fr');
  assert.equal(detectLanguage('Das ist ein Test'), 'de');
  assert.equal(detectLanguage('Hola, esto es una prueba'), 'es');
  assert.equal(detectLanguage(''), 'en');
});

test('language codes normalize and map onto each free engine', function () {
  assert.equal(normalizeCode('zh-CN'), 'zh-Hans');
  assert.equal(normalizeCode('zh-Hant'), 'zh-Hant');
  assert.equal(engineCode('zh-Hans', 'bing'), 'zh-Hans');
  assert.equal(engineCode('zh-Hans', 'google'), 'zh-CN');
  assert.equal(engineCode('zh-Hans', 'mymemory'), 'zh-CN');
  assert.equal(engineCode('auto', 'bing'), 'auto-detect');
  assert.equal(languageName('ja'), '日语');
});

test('auto-detect swaps with the detected language and avoids a no-op pair', function () {
  assert.deepEqual(
    swapLanguages({ source: 'auto', target: 'zh-Hans', detected: 'en' }),
    { source: 'zh-Hans', target: 'en' }
  );
  assert.deepEqual(
    swapLanguages({ source: 'en', target: 'ja', detected: 'en' }),
    { source: 'ja', target: 'en' }
  );
  assert.deepEqual(
    swapLanguages({ source: 'auto', target: 'en', detected: 'en' }),
    { source: 'en', target: 'zh-Hans' }
  );
  assert.deepEqual(
    resolveDirection({ sourceLang: 'auto', targetLang: 'zh-Hans', detected: 'zh-Hans' }),
    { source: 'zh-Hans', target: 'en', flipped: true }
  );
  assert.equal(
    resolveDirection({ sourceLang: 'en', targetLang: 'zh-Hans', detected: 'en' }).flipped,
    false
  );
});

test('chunks rejoin to the original text', function () {
  const original = 'Hello world. This is a longer sentence that should split cleanly.';
  assert.equal(splitForLimit(original, 24).join(''), original);
  assert.equal(splitForLimit('short', 40).length, 1);
});

test('Bing, Google, and MyMemory payloads parse, and quota warnings fail', function () {
  const auth = parseBingAuth(
    'var x; IG:"AABBCCDDEEFF00112233445566778899"; params_AbusePreventionHelper = [123,"token-value",3600000];'
  );
  assert.equal(auth.token, 'token-value');
  assert.equal(auth.key, '123');
  assert.throws(() => parseBingAuth('<html>no token</html>'), /令牌/);

  const bing = parseBingTranslation([{
    translations: [{ text: '你好', to: 'zh-Hans' }],
    detectedLanguage: { language: 'en' }
  }]);
  assert.equal(bing.text, '你好');
  assert.equal(bing.detectedLang, 'en');
  assert.throws(() => parseBingTranslation({ ShowCaptcha: true }), /验证/);

  const google = parseGoogleTranslation([[['你好', 'Hello'], ['世界', 'world']], null, 'en']);
  assert.equal(google.text, '你好世界');
  assert.equal(google.detectedLang, 'en');

  assert.equal(parseMyMemory({
    responseStatus: 200,
    responseData: { translatedText: '你好' }
  }).text, '你好');
  assert.throws(() => parseMyMemory({
    responseStatus: 200,
    quotaFinished: true,
    responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' }
  }), /配额/);
});

test('router falls through a failing engine and keeps the token cache', async function () {
  let bingPageReads = 0;
  const fetchImpl = async function (url) {
    const href = String(url);
    if (href.includes('bing.com/translator')) {
      bingPageReads += 1;
      return jsonResponse(503, '');
    }
    if (href.includes('translate.googleapis.com')) {
      return jsonResponse(200, [[['你好', 'Hello']], null, 'en']);
    }
    return jsonResponse(500, { error: 'unexpected' });
  };
  const cache = createAuthCache();
  const result = await translateText({
    text: 'Hello',
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    engine: 'bing'
  }, { fetch: fetchImpl, authCache: cache });
  assert.equal(result.ok, true);
  assert.equal(result.translatedText, '你好');
  assert.equal(result.detectedLang, 'en');
  assert.equal(result.engine, 'google');
  assert.equal(result.fallback, true);
  assert.match(result.note, /Google/);
  assert.equal(bingPageReads, 1);
  assert.deepEqual(chainFor('google'), ['google', 'bing', 'mymemory']);
});

test('same-language Chinese is redirected to English before the request', async function () {
  let target = '';
  const fetchImpl = async function (url) {
    const href = String(url);
    target = new URL(href).searchParams.get('tl');
    return jsonResponse(200, [[['Hello', '你好世界']], null, 'zh-CN']);
  };
  const result = await translateText({
    text: '你好世界',
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    engine: 'google'
  }, { fetch: fetchImpl });
  assert.equal(target, 'en');
  assert.equal(result.ok, true);
  assert.equal(result.targetLang, 'en');
  assert.equal(result.translatedText, 'Hello');
  assert.match(result.note, /英语/);
});

test('a total outage returns a message and does not echo the source text', async function () {
  const secret = 'secret-selection-should-not-leak';
  const result = await translateText({
    text: secret,
    sourceLang: 'en',
    targetLang: 'zh-Hans',
    engine: 'mymemory'
  }, {
    fetch: async function () { return jsonResponse(429, ''); }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /翻译失败/);
  assert.equal(result.error.includes(secret), false);
  assert.equal(result.attempts.length, 3);
});

test('manifest allows only the free translation hosts and loads language libs first', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.host_permissions, [
    'https://www.bing.com/*',
    'https://translate.googleapis.com/*',
    'https://api.mymemory.translated.net/*'
  ]);
  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.indexOf('src/lib/languages.js') < scripts.indexOf('src/content/content.js'));
  assert.ok(scripts.indexOf('src/lib/detect.js') < scripts.indexOf('src/content/content.js'));
  assert.ok(scripts.indexOf('src/lib/direction.js') < scripts.indexOf('src/content/content.js'));
  const worker = fs.readFileSync(path.join(__dirname, '..', 'src/background/service-worker.js'), 'utf8');
  assert.match(worker, /importScripts\([\s\S]*router\.js/);
  assert.match(worker, /type !== 'translate'/);
});
