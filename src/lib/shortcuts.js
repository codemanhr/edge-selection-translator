(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAC_MODIFIER = {
    Alt: '⌥',
    Option: '⌥',
    Shift: '⇧',
    Ctrl: '⌃',
    Control: '⌃',
    Meta: '⌘',
    Command: '⌘',
    Cmd: '⌘'
  };

  const DISPLAY = {
    'force-translate': {
      short: '强制翻译',
      detail: '强制翻译当前选区，即使总开关关闭'
    },
    'toggle-enabled': {
      short: '开关',
      detail: '开启或关闭划词翻译'
    }
  };

  function commandCatalog() {
    if (globalThis.EST && globalThis.EST.COMMANDS) return globalThis.EST.COMMANDS;
    return require('./commands.js').COMMANDS;
  }

  function normalizeShortcutDisplay(value) {
    return value === 'mac' || value === 'windows' ? value : 'auto';
  }

  function detectShortcutPlatform(nav) {
    const info = nav || {};
    const hinted = info.userAgentData && info.userAgentData.platform;
    if (typeof hinted === 'string' && hinted.trim()) {
      return /mac/i.test(hinted) ? 'mac' : 'windows';
    }
    const platform = String(info.platform || '');
    if (platform) return /Mac|iPhone|iPad|iPod/i.test(platform) ? 'mac' : 'windows';
    const ua = String(info.userAgent || '');
    if (/Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua)) return 'mac';
    return 'windows';
  }

  function formatShortcut(combo, platform) {
    const parts = String(combo || '').split('+').filter(Boolean);
    if (platform === 'mac') {
      return parts.map(function (part) { return MAC_MODIFIER[part] || part; }).join('');
    }
    return parts.join('+');
  }

  function shortcutLines(platform) {
    const commands = commandCatalog();
    const mode = platform === 'mac' ? 'mac' : 'windows';
    return Object.keys(commands).map(function (id) {
      const command = commands[id];
      const copy = DISPLAY[id] || { short: command.description, detail: command.description };
      return {
        id: id,
        chord: formatShortcut(command.suggestedKey, mode),
        short: copy.short,
        detail: copy.detail
      };
    });
  }

  return {
    normalizeShortcutDisplay,
    detectShortcutPlatform,
    formatShortcut,
    shortcutLines
  };
});
