# Progress

Verified stage by stage. A stage is recorded only after its checks pass.
Later stages are not started until the previous stage is green.

| Stage | Status | Notes |
| --- | --- | --- |
| A. MV3 scaffold | PASS | 2026-10-27 |
| B. Translation pipeline | PASS | 2026-10-27 |
| C. Copy, TTS, shortcuts, options | PASS | 2026-10-27 |
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

## Stage B — Translation pipeline

Status: PASS (2026-10-27)

What shipped:

- Target-language menu at the top of the panel, source language menu, one-click swap
- Local script/stopword detection, plus the detected language returned by the engine
- If the detected source equals the target, the target flips (Chinese ↔ English) and the panel says so
- Free pipeline, no API key:
  - **Bing 翻译** (default). `https://www.bing.com/translator` HTML contains a short-lived token; the extension POSTs to `https://www.bing.com/ttranslatev3`. Text is sent to Microsoft. The older `https://edge.microsoft.com/translate/auth` endpoint currently returns HTTP 404, so it is not used.
  - **Google 翻译** fallback. Unofficial `translate.googleapis.com` `client=gtx` endpoint. No SLA; may be rate-limited. Text is sent to Google.
  - **MyMemory** fallback. `api.mymemory.translated.net`, about 450 characters per chunk and a small anonymous daily quota. Text is sent to Translated.
- Failures try the next engine and the panel shows which one was used. Errors do not include the selected text.
- Host permissions are only those three origins.

Checks:

- `npm test` — 25 passed, 0 failed
  - detect, swap, code mapping, payload parsers, router fallback, same-language redirect, manifest hosts
- `node scripts/smoke-translate.js` — `SMOKE_TRANSLATE_OK` engine `bing`, `Hello` → `你好`, detected `en`, no fallback
- `npm run smoke:inject` — `SMOKE_INJECT_OK` (panel still shows the selection and the target-language menu)
- `npm run smoke:e2e` — `SMOKE_E2E_OK`
  - Headless Chrome’s user agent is rejected by Bing (HTTP 401). The panel fell back to Google and rendered `译者您好，这是一个供选择的句子。` with the note `Bing 翻译 不可用，已改用 Google 翻译`
  - A normal Edge window sends a browser user agent, which is the path the Node smoke used successfully for Bing

Not in this stage: copy, speech, shortcuts, options page.

## Stage C — Copy, speech, shortcuts, options

Status: PASS (2026-10-27)

What shipped:

- Copy translation (Clipboard API, then a textarea fallback) and Web Speech buttons for the original and the translation
- Commands: `Alt+T` force-translate, `Alt+Shift+T` global enable toggle. Descriptions match `src/lib/commands.js`
- Toolbar popup and options page. Both read and write `chrome.storage.local` under `estSettings` (enabled, languages, free engine). API keys stay in that same local object and are not synced by the extension
- Disabled state shows an `OFF` badge. Language changes in the panel are saved

Checks:

- `npm test` — 30 passed, 0 failed
  - settings round-trip (turning translation off does not wipe the target language or a stored key)
  - clipboard success and fallback
  - utterance language mapping and a fake speech synth
  - manifest command names, suggested keys, and descriptions match the catalog
  - popup and options reference `loadSettings` / `saveSettings` and do not load remote scripts
- `npm run smoke:e2e` — `SMOKE_E2E_OK` (panel still translates after the new buttons and settings boot)

Not in this stage: history, favorites, site blacklist, code-block skipping.
