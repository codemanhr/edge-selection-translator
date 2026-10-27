(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const EST = (root.EST = root.EST || {});
  Object.assign(EST, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const panelCSS = `
:host { all: initial; }
.panel {
  --est-bg: rgba(255, 255, 255, 0.94);
  --est-fg: #1c2430;
  --est-muted: #5c6778;
  --est-border: rgba(15, 23, 42, 0.12);
  --est-accent: #0f6cbd;
  --est-soft: rgba(15, 108, 189, 0.1);
  box-sizing: border-box;
  width: 312px;
  max-width: min(312px, calc(100vw - 16px));
  max-height: min(340px, 48vh);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 9px;
  border-radius: 12px;
  border: 1px solid var(--est-border);
  background: var(--est-bg);
  color: var(--est-fg);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(10px);
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  pointer-events: auto;
}
.bar { display: flex; align-items: center; gap: 4px; }
.lang {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.lang span {
  font-size: 10px;
  color: var(--est-muted);
  flex: none;
}
select, button { font: inherit; color: inherit; }
select {
  appearance: none;
  border: 1px solid var(--est-border);
  background: rgba(255, 255, 255, 0.72);
  border-radius: 7px;
  font-size: 12px;
  line-height: 1.3;
  padding: 3px 6px;
  max-width: 118px;
}
.swap, .close {
  appearance: none;
  border: 0;
  background: transparent;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  padding: 0;
  flex: none;
}
.swap { color: var(--est-accent); font-size: 14px; }
.close { color: var(--est-muted); font-size: 16px; margin-left: auto; }
.swap:hover, .close:hover { background: var(--est-soft); }
.meta { font-size: 11px; color: var(--est-muted); min-height: 1em; }
.body {
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  user-select: text;
  font-size: 14px;
}
.body.loading { color: var(--est-muted); font-size: 13px; }
.original {
  font-size: 11px;
  color: var(--est-muted);
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  user-select: text;
}
.tools { display: flex; flex-wrap: wrap; gap: 4px; }
.tools button {
  appearance: none;
  border: 1px solid var(--est-border);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 7px;
  padding: 2px 7px;
  font-size: 11px;
  cursor: pointer;
}
.tools button:hover { background: var(--est-soft); }
.status { font-size: 11px; color: #8a4b08; }
.status:empty { display: none; }
@media (prefers-color-scheme: dark) {
  .panel:not(.force-light) {
    --est-bg: rgba(28, 28, 30, 0.88);
    --est-fg: #f3f3f4;
    --est-muted: #c6c6c8;
    --est-border: rgba(255, 255, 255, 0.14);
    --est-accent: #6cb6ff;
    --est-soft: rgba(108, 182, 255, 0.16);
  }
}
.panel.force-dark {
  --est-bg: rgba(28, 28, 30, 0.88);
  --est-fg: #f3f3f4;
  --est-muted: #c6c6c8;
  --est-border: rgba(255, 255, 255, 0.14);
  --est-accent: #6cb6ff;
  --est-soft: rgba(108, 182, 255, 0.16);
}
.panel.force-light {
  --est-bg: rgba(255, 255, 255, 0.94);
  --est-fg: #1c2430;
  --est-muted: #5c6778;
  --est-border: rgba(15, 23, 42, 0.12);
  --est-accent: #0f6cbd;
  --est-soft: rgba(15, 108, 189, 0.1);
}
`.trim();

  return { panelCSS };
});
