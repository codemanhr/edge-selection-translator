(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const panelCSS = `
:host {
  all: initial;
}
.panel {
  box-sizing: border-box;
  width: 300px;
  max-width: min(300px, calc(100vw - 16px));
  max-height: min(320px, 46vh);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 9px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.94);
  color: #1c2430;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(10px);
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  letter-spacing: 0;
  pointer-events: auto;
}
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}
.title {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: #0f6cbd;
  flex: 1;
}
.close {
  appearance: none;
  border: 0;
  background: transparent;
  color: #5c6778;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}
.close:hover { background: rgba(15, 108, 189, 0.1); color: #0f6cbd; }
.body {
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  padding: 2px 1px 1px;
  user-select: text;
}
.status {
  font-size: 11px;
  color: #8a4b08;
}
.status:empty { display: none; }
`.trim();

  return { panelCSS };
});
