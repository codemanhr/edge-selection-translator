'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isInCodeContext } = require('../src/lib/code-detector.js');
const { hostFromUrl, isBlacklisted, addHost, removeHost } = require('../src/lib/blacklist.js');
const { addHistory, toggleFavorite, isFavorite, removeById } = require('../src/lib/history.js');

function element(tag, attrs, parent) {
  return {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    className: (attrs && attrs.className) || '',
    id: (attrs && attrs.id) || '',
    parentElement: parent || null,
    getAttribute: function (name) {
      if (!attrs || attrs[name] == null) return null;
      return attrs[name];
    }
  };
}

function textNode(parent) {
  return { nodeType: 3, parentElement: parent };
}

test('code blocks and editor surfaces are skipped, ordinary prose is not', function () {
  const page = element('div', { className: 'article' });
  const paragraph = element('p', {}, page);
  assert.equal(isInCodeContext(textNode(paragraph)), false);

  const pre = element('pre', {}, page);
  const code = element('code', {}, pre);
  assert.equal(isInCodeContext(textNode(code)), true);

  const monaco = element('div', { className: 'monaco-editor' });
  const line = element('div', { className: 'view-line' }, monaco);
  assert.equal(isInCodeContext(textNode(line)), true);

  const github = element('td', { className: 'blob-code blob-code-inner js-file-line' });
  assert.equal(isInCodeContext(textNode(github)), true);

  const highlighted = element('div', { className: 'highlight search-hit' });
  assert.equal(isInCodeContext(textNode(highlighted)), false);

  const fenced = element('code', { className: 'language-js' });
  assert.equal(isInCodeContext(textNode(fenced)), true);
  const python = element('div', { className: 'language-python highlighter' });
  assert.equal(isInCodeContext(textNode(python)), true);

  const role = element('div', { role: 'code' });
  assert.equal(isInCodeContext(textNode(role)), true);

  const kbd = element('kbd');
  assert.equal(isInCodeContext(kbd), true);
});

test('blacklist matches a host and its subdomains only', function () {
  assert.equal(hostFromUrl('https://docs.Example.com:443/a/b'), 'docs.example.com');
  const list = addHost([], 'https://github.com/foo');
  assert.deepEqual(list, ['github.com']);
  assert.equal(isBlacklisted(list, 'github.com'), true);
  assert.equal(isBlacklisted(list, 'gist.github.com'), true);
  assert.equal(isBlacklisted(list, 'github.com.evil.test'), false);
  assert.equal(isBlacklisted(list, 'notgithub.com'), false);
  assert.deepEqual(addHost(list, 'github.com'), ['github.com']);
  assert.deepEqual(removeHost(list, 'GitHub.com'), []);
});

test('history dedupes phrases and favorites toggle', function () {
  const first = addHistory([], {
    sourceText: 'Hello',
    translatedText: '你好',
    sourceLang: 'en',
    targetLang: 'zh-Hans',
    engine: 'bing'
  });
  const second = addHistory(first, {
    sourceText: 'Hello',
    translatedText: '您好',
    sourceLang: 'en',
    targetLang: 'zh-Hans',
    engine: 'google'
  });
  assert.equal(second.length, 1);
  assert.equal(second[0].translatedText, '您好');
  const other = addHistory(second, {
    sourceText: 'Hello',
    translatedText: 'こんにちは',
    targetLang: 'ja'
  });
  assert.equal(other.length, 2);
  assert.equal(addHistory(other, { sourceText: '   ', translatedText: '' }).length, 2);

  const saved = toggleFavorite([], second[0]);
  assert.equal(isFavorite(saved, { sourceText: 'Hello', targetLang: 'zh-Hans' }), true);
  const removed = toggleFavorite(saved, second[0]);
  assert.equal(removed.length, 0);
  assert.equal(removeById(other, other[0].id).length, 1);
});

test('content script loads the code detector and the manifest allows the context menu', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.indexOf('src/lib/code-detector.js') < scripts.indexOf('src/content/content.js'));
  assert.ok(scripts.indexOf('src/lib/blacklist.js') < scripts.indexOf('src/content/content.js'));
  assert.ok(scripts.includes('src/lib/history.js'));
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.permissions.includes('contextMenus'));
  const worker = fs.readFileSync(path.join(__dirname, '..', 'src/background/service-worker.js'), 'utf8');
  assert.match(worker, /contextMenus/);
  assert.match(worker, /est-blacklist/);
});
