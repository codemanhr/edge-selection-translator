'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { COMMANDS } = require('../src/lib/commands.js');
const { mergeSettings, saveSettings, createMemoryStorage } = require('../src/lib/settings.js');
const {
  detectShortcutPlatform,
  formatShortcut,
  normalizeShortcutDisplay,
  shortcutLines
} = require('../src/lib/shortcuts.js');

const root = path.join(__dirname, '..');

test('shortcut formatter uses Windows chords and macOS symbols', function () {
  assert.equal(formatShortcut('Alt+T', 'windows'), 'Alt+T');
  assert.equal(formatShortcut('Alt+Shift+T', 'windows'), 'Alt+Shift+T');
  assert.equal(formatShortcut('Alt+T', 'linux'), 'Alt+T');
  assert.equal(formatShortcut('Alt+T', 'mac'), '⌥T');
  assert.equal(formatShortcut('Alt+Shift+T', 'mac'), '⌥⇧T');

  const mac = shortcutLines('mac');
  const win = shortcutLines('windows');
  assert.deepEqual(mac.map(function (line) { return line.chord; }), ['⌥T', '⌥⇧T']);
  assert.deepEqual(win.map(function (line) { return line.chord; }), ['Alt+T', 'Alt+Shift+T']);
  assert.equal(mac[0].short, '强制翻译');
  assert.equal(mac[1].short, '开关');
  assert.match(mac[0].detail, /强制翻译/);
  assert.match(win[1].detail, /开启或关闭/);
});

test('platform detection prefers userAgentData and falls back to Windows', function () {
  assert.equal(detectShortcutPlatform({ userAgentData: { platform: 'macOS' }, platform: 'Win32' }), 'mac');
  assert.equal(detectShortcutPlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' }), 'windows');
  assert.equal(detectShortcutPlatform({ userAgentData: { platform: 'Linux' } }), 'windows');
  assert.equal(detectShortcutPlatform({ userAgentData: { platform: '  ' }, platform: 'MacIntel' }), 'mac');
  assert.equal(detectShortcutPlatform({ platform: 'iPhone' }), 'mac');
  assert.equal(detectShortcutPlatform({ platform: 'Linux x86_64' }), 'windows');
  assert.equal(detectShortcutPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }), 'mac');
  assert.equal(detectShortcutPlatform({}), 'windows');
  assert.equal(normalizeShortcutDisplay('mac'), 'mac');
  assert.equal(normalizeShortcutDisplay('windows'), 'windows');
  assert.equal(normalizeShortcutDisplay('auto'), 'auto');
  assert.equal(normalizeShortcutDisplay(''), 'auto');
});

test('shortcut display is stored with settings and manifest bindings stay Alt', async function () {
  assert.equal(mergeSettings({}).shortcutDisplay, 'auto');
  assert.equal(mergeSettings({ shortcutDisplay: 'mac' }).shortcutDisplay, 'mac');
  assert.equal(mergeSettings({ shortcutDisplay: 'linux' }).shortcutDisplay, 'auto');
  const storage = createMemoryStorage();
  await saveSettings(storage, { shortcutDisplay: 'mac', targetLang: 'en' });
  const next = await saveSettings(storage, { enabled: false });
  assert.equal(next.shortcutDisplay, 'mac');
  assert.equal(next.targetLang, 'en');
  assert.equal(next.enabled, false);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.commands['force-translate'].suggested_key.default, 'Alt+T');
  assert.equal(manifest.commands['toggle-enabled'].suggested_key.default, 'Alt+Shift+T');
  assert.equal(COMMANDS['force-translate'].suggestedKey, 'Alt+T');

  const options = fs.readFileSync(path.join(root, 'src/options/options.html'), 'utf8');
  const optionsJs = fs.readFileSync(path.join(root, 'src/options/options.js'), 'utf8');
  assert.match(options, /id="shortcut-display"/);
  assert.match(options, /shortcuts\.js/);
  assert.match(options, /Windows \/ Linux/);
  assert.match(options, /macOS/);
  assert.match(optionsJs, /paintShortcuts/);
  assert.match(optionsJs, /detectShortcutPlatform/);
  assert.match(optionsJs, /shortcutDisplay/);

  const popup = fs.readFileSync(path.join(root, 'src/popup/popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8');
  assert.equal(/shortcut-display|快捷键显示|shortcuts\.js/.test(popup), false);
  assert.equal(/shortcutDisplay|paintShortcuts|detectShortcutPlatform/.test(popupJs), false);
});
