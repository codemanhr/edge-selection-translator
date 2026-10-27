(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CODE_TAGS = { PRE: true, CODE: true, KBD: true, SAMP: true };
  const CODE_CLASS = /(?:^|[\s_])(?:monaco-editor|cm-editor|cm-content|codemirror|ace_editor|hljs|prettyprint|wp-block-code|blob-code|blob-code-inner|react-syntax-highlighter|shiki|chroma|notion-code-block)(?:$|[\s_])/i;
  const LANGUAGE_CLASS = /(?:^|[\s_])language-[a-z0-9_+-]+/i;

  function classText(el) {
    const className = el && typeof el.className === 'string' ? el.className : '';
    const id = el && el.id ? el.id : '';
    return className + ' ' + id;
  }

  function elementLooksLikeCode(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (CODE_TAGS[tag]) return true;
    const role = el.getAttribute && el.getAttribute('role');
    if (role === 'code') return true;
    const text = classText(el);
    if (CODE_CLASS.test(text) || LANGUAGE_CLASS.test(text)) return true;
    return false;
  }

  function isInCodeContext(node) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    let hops = 0;
    while (el && hops < 40) {
      if (elementLooksLikeCode(el)) return true;
      el = el.parentElement || null;
      hops += 1;
    }
    return false;
  }

  return { elementLooksLikeCode, isInCodeContext };
});
