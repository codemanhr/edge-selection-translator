# Progress

Verified stage by stage. A stage is recorded only after its checks pass.
Later stages are not started until the previous stage is green.

| Stage | Status | Notes |
| --- | --- | --- |
| A. MV3 scaffold | PASS | 2026-10-27 |
| B. Translation pipeline | PASS | 2026-10-27 |
| C. Copy, TTS, shortcuts, options | PASS | 2026-10-27 |
| D. History, favorites, blacklist, code skip | PASS | 2026-10-27 |
| E. Engines, style, dark UI | PASS | 2026-10-27 |
| F. Store docs and hygiene | PASS | 2026-10-27 |

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

## Stage D — History, favorites, blacklist, code skip

Status: PASS (2026-10-27)

What shipped:

- Recent translations (50) and favorites (100) stay in `chrome.storage.local`. The same source text and target language collapse to one history row. The panel favorite button and the options page can add, remove, or clear entries
- Per-site blacklist matches the host and its subdomains (`github.com` covers `gist.github.com`, not `notgithub.com`). The popup, options page, and the page context menu can add or remove the current site
- Context menus: “翻译选中文字” force-translates the selection; “在此网站停用 / 恢复划词翻译” toggles the blacklist
- Selections inside `pre`, `code`, `kbd`, `samp`, `role=code`, or known editor/highlighter surfaces (Monaco, CodeMirror, Ace, highlight.js, Shiki, GitHub blob code, and similar) do not open the panel. Password fields stay skipped. Force-translate does not override a code or password context

Checks:

- `npm test` — 34 passed, 0 failed (recorded before the stage E tests were added)
  - HTML fixtures: code tags and editor classes are skipped; ordinary prose, a generic `highlight` class, and a generic textarea are not
  - blacklist exact and subdomain rules; history dedupe and favorite toggle
  - manifest content-script order includes the code detector; `contextMenus` and the blacklist menu id are present
- `npm run smoke:e2e` — exit 0
  - Selecting `const skip = true` inside `<pre><code id="code">` left the panel `display:none` and did not copy that text into the original slot
  - The prose selection still translated (`SMOKE_E2E_OK`)

## Stage E — Engines, style, dark UI

Status: PASS (2026-10-27)

What shipped:

- Engine router. Free engines (`bing`, `google`, `mymemory`) try the chosen engine first, then the other free engines. Keyed engines (`deepl`, `openai`, `libretranslate`, `azure`) try themselves, then the free chain. A missing key is an error and falls through. The panel says which engine was used
- Optional keys live in `chrome.storage.local` (`estSettings.api`): DeepL (free or Pro), OpenAI-compatible chat completions (base URL, model, key), LibreTranslate (URL and optional key), Azure Translator (key and region). Saving a keyed engine asks for optional host permission from the options page (`https://*/*`, plus localhost / 127.0.0.1 for a self-hosted LibreTranslate). Required host permissions stay the three free origins
- Style: normal / colloquial / formal. DeepL sends `formality=prefer_less` or `prefer_more` and retries without it on HTTP 400. OpenAI puts the tone in the system prompt. Other engines translate normally and the panel notes that the tone was not applied
- Proper nouns: URLs, emails, ALL-CAPS acronyms, and multi-word Title Case names are replaced with `XPNnX` placeholders before the request and restored after. Single capitalized words are left alone. The option can be turned off
- Dark mode follows `prefers-color-scheme`, with explicit light and dark overrides. The panel stays compact and semi-transparent

Checks:

- `npm test` — 37 passed, 0 failed
  - proper-noun round trip through a mocked Google response; formal Google notes the unsupported tone
  - DeepL formal body contains `formality=prefer_more` and `target_lang=DE`; a missing key falls back to Google and the result JSON does not contain the key
  - `chainFor('deepl')` is `deepl`, `bing`, `google`, `mymemory`
  - panel, options, and popup CSS include `prefers-color-scheme: dark`; panel dark tokens `--est-bg: rgba(28, 28, 30, 0.88)` and `--est-fg: #f3f3f4`; options dark `--bg: #10141b`
  - `node --check` on every `src/**/*.js`, including the options page
- `npm run smoke:e2e` — `SMOKE_E2E_OK` and `SMOKE_INJECT_OK`, exit 0, after the style control, theme class, and optional host permissions were added. Headless Chrome still falls back from Bing to Google, as in stage B

Not in this stage: privacy policy, store listing, bilingual README.

## Stage F — Store docs and hygiene

Status: PASS (2026-10-27)

What shipped:

- `privacy-policy.md` and a GitHub Pages page at `docs/privacy-policy.html`: selected text, each engine endpoint, keys only in `chrome.storage.local`, no sale, telemetry none by default
- README in Chinese and English: Load unpacked, features, a permission table, and the Partner Center checklist
- `STORE_LISTING.md`: store name 划词翻译, the manifest short description, zh-CN and English long descriptions, category Productivity, privacy disclosure aligned with the policy
- Icons 16/32/48/128. `scripts/pack.js` writes `dist/edge-selection-translator.zip` with `manifest.json`, `icons/`, and `src/` only. `.gitignore` already excludes `node_modules/`, `dist/`, zip packages, and Chrome profiles
- Fixture screenshots at `docs/screenshots/` (1280×800). They come from headless Chrome; replace them with Edge captures before store submission

Checks:

- `npm test` — 40 passed, 0 failed, including the docs, icon, and zip checks
- `npm run pack` — `PACK_OK`, zip starts with `PK`, includes the manifest and content script, and excludes `tests/` and `README.md`
- `node scripts/capture-ui.js` — `CAPTURE_OK`. `panel.png`, `options.png`, and `popup.png` are 1280×800 PNGs
- Runtime code did not change in this stage. The stage E `npm run smoke:e2e` result still covers the panel

## Final checklist

| Item | Result |
| --- | --- |
| Manifest V3, local CSP, no remote scripts | PASS |
| Selection panel, dismiss, target language, detect, swap | PASS |
| Copy, speech, Alt+T, Alt+Shift+T, popup, options | PASS |
| History, favorites, blacklist, code skip | PASS |
| Free and keyed engines, style, proper nouns, dark UI | PASS |
| Privacy policy, store listing, bilingual README, icons, pack | PASS |
| `npm test` | PASS, 40 tests |
| Load unpacked in a normal Edge window | Needs a person |
| Partner Center account, GitHub Pages, store screenshots, API keys | Needs a person |

## Follow-up — Shortcut display labels

Status: PASS (2026-10-27)

The registered commands stay `Alt+T` and `Alt+Shift+T` in `manifest.json`. A `shortcutDisplay` field on `estSettings` (`auto`, `windows`, or `mac`) controls only the labels in the options page and the toolbar popup. `auto` is resolved once from `navigator.userAgentData.platform`, then `navigator.platform`, then the user agent, and stored as `windows` or `mac`. An unclear environment stays Windows / Linux. macOS labels are `⌥T（强制翻译）` and `⌥⇧T（开关）`.

Checks:

- `npm test` — 43 passed, 0 failed, including `tests/shortcuts.test.js`: Windows chords, macOS symbols, platform detection, and a settings round-trip that keeps `mac` when another field is saved
- Manifest suggested keys remain `Alt+T` and `Alt+Shift+T`

README was rewritten for readers and store submitters: install steps stay separate from `npm test` / `npm run pack`, and the screenshot section is the three images plus one note to replace them with Edge captures before submission.
