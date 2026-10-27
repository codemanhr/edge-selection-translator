'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { STORAGE_KEY } = require('../src/lib/constants.js');
const { COMMANDS } = require('../src/lib/commands.js');
const {
  mergeSettings,
  loadSettings,
  saveSettings,
  createMemoryStorage
} = require('../src/lib/settings.js');
const { copyText } = require('../src/lib/clipboard.js');
const { buildUtterance, speakText } = require('../src/lib/speech.js');

const root = path.join(__dirname, '..');

test('settings round-trip keeps unrelated fields and honors the enabled toggle', async function () {
  assert.equal(STORAGE_KEY, 'estSettings');
  const storage = createMemoryStorage();
  const first = await saveSettings(storage, {
    enabled: false,
    targetLang: 'ja',
    engine: 'google',
    api: { deeplKey: 'local-only' }
  });
  assert.equal(first.enabled, false);
  assert.equal(first.targetLang, 'ja');
  assert.equal(first.engine, 'google');
  assert.equal(first.api.deeplKey, 'local-only');
  assert.equal(first.api.openaiBaseUrl, 'https://api.openai.com/v1');

  const second = await saveSettings(storage, { enabled: true });
  assert.equal(second.enabled, true);
  assert.equal(second.targetLang, 'ja');
  assert.equal(second.engine, 'google');
  assert.equal(second.api.deeplKey, 'local-only');
  assert.deepEqual(await loadSettings(storage), second);
  assert.equal(mergeSettings(null).enabled, true);
  assert.equal(mergeSettings({ style: 'nope' }).style, 'normal');
});

test('copy uses the clipboard API and falls back to execCommand', async function () {
  let written = '';
  const viaClipboard = await copyText('你好', {
    clipboard: { writeText: async function (value) { written = value; } }
  });
  assert.deepEqual(viaClipboard, { ok: true, via: 'clipboard' });
  assert.equal(written, '你好');

  const removed = [];
  const doc = {
    body: { appendChild: function () {} },
    createElement: function () {
      return { style: {}, setAttribute: function () {}, select: function () {}, remove: function () { removed.push(true); } };
    },
    execCommand: function (cmd) { return cmd === 'copy'; }
  };
  const viaFallback = await copyText('译文', {
    clipboard: { writeText: async function () { throw new Error('denied'); } },
    doc: doc
  });
  assert.equal(viaFallback.ok, true);
  assert.equal(viaFallback.via, 'execCommand');
  assert.equal(removed.length, 1);
  assert.equal((await copyText('   ', {})).reason, 'empty');
});

test('speech builds a BCP-47 utterance and speaks through the provided synth', function () {
  assert.equal(buildUtterance('你好', 'zh-Hans').lang, 'zh-CN');
  assert.equal(buildUtterance('Hello', 'en').lang, 'en-US');
  const spoken = [];
  let cancelled = 0;
  function FakeUtterance(text) { this.text = text; }
  const result = speakText('Hello', 'en', {
    synth: {
      cancel: function () { cancelled += 1; },
      speak: function (utter) { spoken.push(utter); }
    },
    Utterance: FakeUtterance
  });
  assert.equal(result.ok, true);
  assert.equal(cancelled, 1);
  assert.equal(spoken[0].text, 'Hello');
  assert.equal(spoken[0].lang, 'en-US');
  assert.equal(spoken[0].rate, 1);
  assert.equal(spoken[0].pitch, 1);
  assert.equal(speakText('Hello', 'en', {}).reason, 'unsupported');
  assert.equal(speakText('  ', 'en', {}).reason, 'empty');
});

test('manifest commands match the command catalog', function () {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.commands).sort(), Object.keys(COMMANDS).sort());
  Object.keys(COMMANDS).forEach(function (name) {
    assert.equal(manifest.commands[name].description, COMMANDS[name].description);
    assert.equal(manifest.commands[name].suggested_key.default, COMMANDS[name].suggestedKey);
  });
  const worker = fs.readFileSync(path.join(root, 'src/background/service-worker.js'), 'utf8');
  assert.match(worker, /force-translate/);
  assert.match(worker, /toggle-enabled/);
  assert.deepEqual(manifest.permissions, ['storage', 'contextMenus']);
  assert.equal(manifest.action.default_popup, 'src/popup/popup.html');
  assert.equal(manifest.options_ui.page, 'src/options/options.html');
});

test('popup and options pages read and write settings locally', function () {
  ['src/options/options.html', 'src/popup/popup.html'].forEach(function (file) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(/<script[^>]+src="https?:/.test(html), false);
    assert.match(html, /settings\.js/);
  });
  const options = fs.readFileSync(path.join(root, 'src/options/options.js'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8');
  assert.match(options, /loadSettings/);
  assert.match(options, /saveSettings/);
  assert.match(popup, /loadSettings/);
  assert.match(popup, /saveSettings/);
  assert.match(popup, /openOptionsPage/);
});
