'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { protectProperNouns, restoreProperNouns } = require('../src/lib/proper-nouns.js');
const { translateText, chainFor } = require('../src/lib/router.js');

function jsonResponse(status, body) {
  return {
    ok: status < 400,
    status: status,
    text: async function () { return typeof body === 'string' ? body : JSON.stringify(body); }
  };
}

test('proper nouns survive translation and unsupported styles are labeled', async function () {
  const source = 'Meet NASA in New York https://example.com/a';
  const shielded = protectProperNouns(source);
  assert.equal(shielded.text.includes('NASA'), false);
  assert.equal(shielded.text.includes('New York'), false);
  assert.equal(restoreProperNouns(shielded.text, shielded.tokens), source);

  const result = await translateText({
    text: source,
    sourceLang: 'en',
    targetLang: 'zh-Hans',
    engine: 'google',
    style: 'formal',
    keepProperNouns: true
  }, {
    fetch: async function (url) {
      const q = new URL(String(url)).searchParams.get('q');
      return jsonResponse(200, [[['译 ' + q, q]], null, 'en']);
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.translatedText.includes('NASA'), true);
  assert.equal(result.translatedText.includes('New York'), true);
  assert.equal(result.translatedText.includes('https://example.com/a'), true);
  assert.equal(result.translatedText.includes('XPN'), false);
  assert.match(result.note, /普通风格/);
});

test('DeepL formal mode sends formality and a missing key falls back', async function () {
  let body = '';
  const formal = await translateText({
    text: 'Hello',
    sourceLang: 'en',
    targetLang: 'de',
    engine: 'deepl',
    style: 'formal',
    api: { deeplKey: 'test-key', deeplPro: false }
  }, {
    fetch: async function (url, options) {
      body = options.body;
      return jsonResponse(200, { translations: [{ text: 'Hallo', detected_source_language: 'EN' }] });
    }
  });
  assert.equal(formal.engine, 'deepl');
  assert.equal(formal.styleApplied, true);
  assert.equal(formal.translatedText, 'Hallo');
  assert.match(String(body), /formality=prefer_more/);
  assert.match(String(body), /target_lang=DE/);
  assert.deepEqual(chainFor('deepl'), ['deepl', 'mymemory', 'google', 'bing']);

  const fallback = await translateText({
    text: 'Hello secret',
    sourceLang: 'en',
    targetLang: 'zh-Hans',
    engine: 'deepl',
    api: {}
  }, {
    fetch: async function (url) {
      const href = String(url);
      if (href.includes('translate.googleapis.com')) {
        return jsonResponse(200, [[['你好', 'Hello']], null, 'en']);
      }
      return jsonResponse(503, '');
    }
  });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.engine, 'google');
  assert.match(fallback.note, /DeepL/);
  assert.equal(fallback.error, undefined);
  assert.equal(JSON.stringify(fallback).includes('test-key'), false);
});

test('panel and options follow prefers-color-scheme with dark tokens', function () {
  const root = path.join(__dirname, '..');
  const panel = fs.readFileSync(path.join(root, 'src/content/panel.css.js'), 'utf8');
  const options = fs.readFileSync(path.join(root, 'src/options/options.css'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'src/popup/popup.css'), 'utf8');
  assert.match(panel, /prefers-color-scheme:\s*dark/);
  assert.match(panel, /--est-bg:\s*rgba\(28,\s*28,\s*30,\s*0\.88\)/);
  assert.match(panel, /--est-fg:\s*#f3f3f4/);
  assert.match(options, /prefers-color-scheme:\s*dark/);
  assert.match(options, /--bg:\s*#10141b/);
  assert.match(popup, /prefers-color-scheme:\s*dark/);
});
