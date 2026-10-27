(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HOST_ID = 'est-selection-translator-host';
  const STORAGE_KEY = 'estSettings';
  const MAX_SELECTION_CHARS = 4000;
  const HISTORY_LIMIT = 50;
  const FAVORITES_LIMIT = 100;
  const PANEL_MARGIN = 8;
  const PANEL_WIDTH = 300;

  return {
    HOST_ID,
    STORAGE_KEY,
    MAX_SELECTION_CHARS,
    HISTORY_LIMIT,
    FAVORITES_LIMIT,
    PANEL_MARGIN,
    PANEL_WIDTH
  };
});
