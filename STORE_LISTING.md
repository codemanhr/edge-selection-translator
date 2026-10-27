# Microsoft Edge Add-ons 商店文案

提交前用 Edge 实机截图替换 `docs/screenshots/` 里的自动截图。商店截图尺寸必须是 **640×480** 或 **1280×800**。长描述每种语言至少 250 个字符、至多 10,000 个字符。扩展名称和简短描述来自 `manifest.json`，改文案后要重新打包上传。

分类 Category：**Productivity**（合作伙伴中心里可能显示为「工作效率」或「生产力」）。

建议搜索词（每种语言最多 7 条，每条不超过 30 个字符，总词数不超过 21）：

- zh-CN：`划词翻译`、`选中翻译`、`网页翻译`、`双语朗读`
- en：`selection translator`、`webpage translate`、`bilingual`

## 名称

商店名称必须与清单一致。

- zh-CN / 清单 `name`：**划词翻译**
- 若以后增加 `_locales`，英文显示名可用 **Selection Translator**。当前包没有 `_locales`，英文商店页也使用「划词翻译」。

## 简短描述

简短描述就是清单里的 `description`（建议不超过 132 个字符）：

> 选中网页文字，在光标旁显示翻译。Translate selected text in a compact panel beside the cursor.

## 长描述 zh-CN

复制下面标记之间的正文。

<!-- DESC_ZH_START -->
划词翻译让你在 Microsoft Edge 里选中网页文字后，立刻在光标旁边看到译文。面板紧贴选区，顶部可以更换目标语言；点到面板外面、按 Esc 或滚动页面就会收起，尽量不挡住正在阅读的正文。

扩展会在本地判断原文语言，并提供一键对调。译文可以复制，也可以用浏览器自带的语音合成朗读原文或译文。Alt+T 强制翻译当前选区，Alt+Shift+T 打开或关闭划词翻译。工具栏图标提供快捷开关、目标语言和引擎；完整选项页可以调整语气、外观、黑名单、历史和收藏。

默认引擎是无需密钥的 Bing 翻译。如果它暂时不可用，会自动改用 Google 翻译或 MyMemory，并在面板里说明。你也可以填入自己的 DeepL、OpenAI 兼容接口、LibreTranslate 或 Azure 翻译密钥。密钥只保存在这台设备的扩展存储里，不会上传到扩展作者的服务器。语气可选普通、更口语或更正式：DeepL 和 OpenAI 兼容接口会按语气翻译，其他引擎会注明仍按普通风格处理。网址、邮箱、全大写缩写和连续的英文专名可以尽量保持原样。

代码块、常见代码编辑器和密码框里的选区不会被翻译。你可以把某个网站加入黑名单。最近的翻译和收藏都留在本机。界面跟随系统的深色或浅色外观，面板半透明。

本扩展没有作者一方的服务器，不出售数据，默认也不收集任何遥测。选中的文字只会发送到你所选择的翻译服务。Bing 与 Google 的免密钥接口不属于官方稳定承诺，可能调整或限流；需要稳定额度时请使用你自己的密钥。
<!-- DESC_ZH_END -->

## Long description (en)

<!-- DESC_EN_START -->
Selection Translator shows a translation beside the cursor when you select text in Microsoft Edge. The panel sits next to the selection. Pick the target language at the top. Click outside the panel, press Esc, or scroll the page to dismiss it. The panel is compact and semi-transparent so it does not cover the paragraph you are reading.

The extension detects the source language on your device and can swap the language pair in one click. Copy the translation, or speak the original and the translation with the browser speech API. Alt+T forces a translation of the current selection. Alt+Shift+T turns selection translation on or off. The toolbar icon changes the switch, the target language, and the engine. The options page also sets tone, theme, the site blacklist, history, and favorites.

The default engine is Bing Translator and needs no key. If it is unavailable, the extension tries Google Translate and then MyMemory, and the panel names the engine that answered. You can store your own DeepL, OpenAI-compatible, LibreTranslate, or Azure Translator key. Keys stay in extension storage on this device and are not uploaded to the author. Tone can be neutral, more colloquial, or more formal. DeepL and OpenAI-compatible endpoints apply the tone. The other engines say they translated in a neutral tone. URLs, email addresses, acronyms, and multi-word proper names can be left unchanged.

Selections inside code blocks, common code editors, and password fields are not translated. You can skip a whole site. Recent translations and favorites remain on the device. The panel follows the system light or dark theme.

This extension has no author-operated server. It does not sell data. Telemetry is off because none is built. Selected text is sent only to the translation service you choose. The keyless Bing and Google endpoints are unofficial and may change or rate-limit; use your own key when you need a stable quota.
<!-- DESC_EN_END -->

## 隐私披露（与 privacy-policy.md 一致）

贴到合作伙伴中心 Privacy 页。

单一用途：在用户选中网页文字时，于光标旁显示译文。

权限理由：

- `storage`：在本机保存开关、语言、引擎、语气、黑名单、历史、收藏和用户自己的 API 密钥。
- `contextMenus`：提供「翻译选中文字」和「在此网站停用 / 恢复划词翻译」。
- 主机权限 `https://www.bing.com/*`、`https://translate.googleapis.com/*`、`https://api.mymemory.translated.net/*`：把选中的文字发给用户选择的免密钥翻译接口。
- 可选主机权限：仅当用户在选项页保存 DeepL、OpenAI 兼容接口、LibreTranslate 或 Azure 时，由用户确认后访问对应的 HTTPS 地址（以及本机 LibreTranslate 的 localhost）。

远程代码：否。Manifest V3，不加载远程脚本。

数据使用声明：

- 处理的数据是用户选中的文本，以及由此产生的译文。历史、收藏、设置和 API 密钥只留在 `chrome.storage.local`。
- 选中的文本会发送到用户所选引擎（见上表中的 Bing、Google、MyMemory、DeepL、OpenAI 兼容服务、LibreTranslate 或 Azure）。扩展作者不接收这些内容。
- 不出售、不出租、不交换用户数据。
- 不将数据用于广告、信用评估或与划词翻译无关的目的。
- 遥测：默认没有，扩展内也没有遥测代码。

隐私政策 URL（启用 GitHub Pages、源为 `main` 分支 `/docs` 之后）：

`https://codemanhr.github.io/edge-selection-translator/privacy-policy.html`

在 Pages 生效前，审查员需要一个可公开访问的页面。不要只填 GitHub 上的 Markdown 源文件，除非该 URL 能直接打开渲染后的政策正文。

## 认证备注

免密钥即可测试：在任意 https 页面选中一句英文，面板应出现中文译文。Alt+T 为强制翻译。代码块内选中不应出现面板。DeepL、OpenAI、LibreTranslate 和 Azure 需要审查员自己的密钥；未填写时会回退到免密钥引擎并在面板提示。扩展不提供测试账号。
