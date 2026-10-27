# Progress

Verified stage by stage. A stage is recorded only after its checks pass.
Later stages are not started until the previous stage is green.

| Stage | Status | Notes |
| --- | --- | --- |
| A. MV3 scaffold | PASS | 2026-10-27 |
| B. Translation pipeline | pending | |
| C. Copy, TTS, shortcuts, options | pending | |
| D. History, favorites, blacklist, code skip | pending | |
| E. Engines, style, dark UI | pending | |
| F. Store docs and hygiene | pending | |

## Stage A — MV3 scaffold

Status: PASS (2026-10-27)

What shipped:

- Manifest V3 (`manifest.json`): content script on `http://*/*` and `https://*/*`, service worker, local CSP, icons 16/32/48/128
- Shadow DOM floating panel mounted beside the cursor
- Show/hide rules: empty selection ignored; code / password / disabled / blacklist flags; force overrides only the toggle and blacklist
- Dismiss on outside pointerdown, Escape, and scroll (scroll inside the panel does not dismiss)
- Panel flips and clamps so it stays in the viewport

Checks:

- `npm test` — 16 passed, 0 failed
  - manifest JSON, MV3, icon PNG signatures, script order, CSP, `node --check` on every `src/**/*.js`
  - panel show/hide, dismiss, selection geometry, cursor positioning
- `npm run smoke:inject` — `SMOKE_INJECT_OK`
  - Headless Chrome for Testing loaded the unpacked extension, the content script mounted `#est-selection-translator-host`, a mouse selection opened the panel with the selected text, and an outside pointerdown hid it
  - Branded Google Chrome 156 ignores `--load-extension` (`--load-extension is not allowed in Google Chrome`). The smoke script uses Chrome for Testing when it is installed at `/tmp/chrome-for-testing/chrome-linux64/chrome`

Not in this stage: translation requests, toolbar popup, storage.
