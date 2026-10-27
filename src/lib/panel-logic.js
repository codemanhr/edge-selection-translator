(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_MAX = 4000;

  function normalizeSelectionText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Decide whether the floating panel should open for a selection.
   * Force overrides the global toggle and the site blacklist.
   * Code blocks and password fields stay closed even when forced.
   */
  function analyzeSelection(input) {
    const source = input || {};
    const text = normalizeSelectionText(source.text);
    const maxLength = source.maxLength || DEFAULT_MAX;

    if (!text) return { action: 'ignore', reason: 'empty', text: '' };
    if (source.inPassword) return { action: 'ignore', reason: 'password', text: '' };
    if (source.inCode) return { action: 'ignore', reason: 'code', text: '' };
    if (!source.force && source.enabled === false) {
      return { action: 'ignore', reason: 'disabled', text: '' };
    }
    if (!source.force && source.blacklisted) {
      return { action: 'ignore', reason: 'blacklist', text: '' };
    }
    if (text.length > maxLength) {
      return {
        action: 'error',
        reason: 'too-long',
        text: text.slice(0, maxLength)
      };
    }
    return { action: 'show', reason: 'ok', text };
  }

  function shouldDismissPanel(event) {
    const source = event || {};
    if (!source.panelOpen) return false;
    if (source.type === 'keydown' && (source.key === 'Escape' || source.key === 'Esc')) {
      return true;
    }
    if (source.type === 'scroll') return !source.insidePanel;
    if (source.type === 'pointerdown') return !source.insidePanel;
    return false;
  }

  function readSelectionText(selection) {
    if (!selection || typeof selection.toString !== 'function') return '';
    if (typeof selection.isCollapsed === 'boolean' && selection.isCollapsed) return '';
    return normalizeSelectionText(selection.toString());
  }

  function selectionAnchorPoint(selection) {
    if (!selection || typeof selection.getRangeAt !== 'function') return null;
    if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!range || typeof range.getBoundingClientRect !== 'function') return null;
    const rect = range.getBoundingClientRect();
    if (!rect) return null;
    const empty =
      !rect.width && !rect.height && !rect.top && !rect.left && !rect.bottom && !rect.right;
    if (empty) return null;
    return {
      x: rect.left,
      y: rect.bottom
    };
  }

  function isPasswordNode(node) {
    let el = node;
    if (!el) return false;
    if (el.nodeType === 3) el = el.parentElement;
    if (!el || typeof el.closest !== 'function') return false;
    const input = el.closest('input, textarea');
    if (!input) return false;
    const type = String(input.type || (input.getAttribute && input.getAttribute('type')) || '').toLowerCase();
    return type === 'password';
  }

  return {
    normalizeSelectionText,
    analyzeSelection,
    shouldDismissPanel,
    readSelectionText,
    selectionAnchorPoint,
    isPasswordNode
  };
});
