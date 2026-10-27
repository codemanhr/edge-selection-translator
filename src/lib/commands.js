(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COMMANDS = {
    'force-translate': {
      description: '强制翻译当前选区',
      suggestedKey: 'Alt+T'
    },
    'toggle-enabled': {
      description: '开启或关闭划词翻译',
      suggestedKey: 'Alt+Shift+T'
    }
  };

  return { COMMANDS };
});
