# 划词翻译隐私政策

生效日期：2026-10-27

本政策说明 Microsoft Edge 扩展「划词翻译」（Selection Translator）如何处理数据。扩展在你的浏览器里运行。作者没有自己的服务器，扩展不会把选中的文字或译文发到作者的服务器。

英文说明见文末 [English](#english)。

## 扩展处理哪些数据

扩展只在你主动划选文字、或使用强制翻译（快捷键、右键菜单）时读取当前选区的文本。

本地保存在 `chrome.storage.local`（键名 `estSettings`）里的内容包括：

- 开关、源语言、目标语言、引擎、语气、主题、是否保留专名
- 你填写的 API 密钥（DeepL、OpenAI 兼容接口、LibreTranslate、Azure）
- 最近约 50 条翻译记录，以及最多约 100 条收藏
- 你加入黑名单的网站主机名

这些数据留在本机的扩展存储中。扩展不使用 `chrome.storage.sync`，不会为了同步把设置或密钥上传到浏览器账号。

历史和收藏里会包含原文和译文，因为这是你在选项页里查看它们所需要的。删除历史或取消收藏后，对应条目会从本地存储中移除。

## 选中的文字会发给谁

翻译请求由扩展的后台脚本发出。选中的文字、语言代码，以及（仅在 DeepL 或 OpenAI 兼容接口上）语气要求，会发送到**你当前选择的翻译引擎**。启用「尽量不翻译专名」时，网址、邮箱、全大写缩写和连续的首字母大写专名会先换成占位符，再随请求发出，返回后在本地还原。

扩展作者不接收这些请求，也不记录它们。

| 引擎 | 请求发往 | 是否需要密钥 |
| --- | --- | --- |
| Bing 翻译（默认） | `https://www.bing.com/translator` 与 `https://www.bing.com/ttranslatev3`（Microsoft） | 否 |
| Google 翻译 | `https://translate.googleapis.com/translate_a/single`（Google，非官方接口） | 否 |
| MyMemory | `https://api.mymemory.translated.net/get`（Translated） | 否 |
| DeepL | `https://api-free.deepl.com` 或 `https://api.deepl.com` | 是，密钥只存在本机 |
| OpenAI 兼容 | 你填写的地址，默认 `https://api.openai.com/v1/chat/completions` | 是，密钥只存在本机 |
| LibreTranslate | 你填写的地址，默认 `https://libretranslate.com/translate` | 视该实例而定，密钥只存在本机 |
| Azure 翻译 | `https://api.cognitive.microsofttranslator.com/translate`（Microsoft） | 是，密钥只存在本机 |

首选引擎失败时，扩展会改用免密钥引擎（Bing、Google、MyMemory）并在面板上说明。此时文字会发给实际完成翻译的那一家。

各引擎对数据的保存期限和用途以其自身的隐私政策为准。本扩展不能控制它们。

## API 密钥

密钥由你在选项页输入，只写入本机的扩展存储。扩展不会把密钥发到作者的服务器。密钥只会放在发往对应引擎的请求头或请求体里（DeepL 的 `Authorization`、OpenAI 的 `Bearer`、LibreTranslate 的 `api_key`、Azure 的 `Ocp-Apim-Subscription-Key`）。错误提示不会回显密钥或原文。

## 不出售数据，默认没有遥测

- 作者不出售、不出租、不交换你的选区、译文、历史、收藏或密钥。
- 扩展默认不收集遥测、不使用分析脚本、不接入广告。没有可选的遥测开关，因为根本没有遥测。
- 扩展不读取密码框中的文字。代码块和常见代码编辑器里的选区不会送去翻译。
- 网站黑名单只在本地保存主机名，用于决定要不要在该站弹出面板。

## 权限与远程代码

扩展使用 `storage` 保存上面列出的本地设置，使用 `contextMenus` 提供「翻译选中文字」和按网站停用。内容脚本运行在 `http` 与 `https` 页面上，以便读取选区并显示面板。免密钥翻译需要访问 Bing、Google 与 MyMemory 的主机权限。DeepL、OpenAI、LibreTranslate 和 Azure 使用可选主机权限，只在你于选项页保存对应引擎时由你确认授权。

扩展是 Manifest V3，不下载、不执行远程代码。页面脚本的内容安全策略只允许 `'self'`。

## 保留与删除

卸载扩展即可删除浏览器为它保存的本地数据，包括密钥、历史、收藏和黑名单。你也可以在选项页清空历史、删除收藏，或清空密钥字段后保存。

## 联系

问题与更正请提交到仓库：<https://github.com/codemanhr/edge-selection-translator/issues>

## English

Effective date: 2026-10-27

Selection Translator runs entirely in your browser. The author operates no server for this extension. Selected text and translations are not sent to the author.

The extension reads text only when you select it, or when you force a translation with the shortcut or the context menu. Settings, API keys, about 50 recent translations, about 100 favorites, and blacklisted hostnames are stored in `chrome.storage.local` under `estSettings`. The extension does not use `chrome.storage.sync`.

Selected text is sent only to the translation engine you pick:

- Bing Translator (default), no key: `https://www.bing.com/translator` and `https://www.bing.com/ttranslatev3`
- Google Translate, no key, unofficial: `https://translate.googleapis.com/translate_a/single`
- MyMemory, no key: `https://api.mymemory.translated.net/get`
- DeepL, your key, stored locally: `https://api-free.deepl.com` or `https://api.deepl.com`
- An OpenAI-compatible chat API, your key, stored locally: the base URL you enter, default `https://api.openai.com/v1/chat/completions`
- LibreTranslate, optional key, stored locally: the URL you enter, default `https://libretranslate.com/translate`
- Azure Translator, your key, stored locally: `https://api.cognitive.microsofttranslator.com/translate`

If the preferred engine fails, the extension tries the free engines and tells you which one answered. Those providers' own privacy policies govern what they do with the text. This extension does not.

API keys stay in extension storage on the device. They are attached only to the request for that provider. Error text does not include the key or the source sentence.

The author does not sell, rent, or trade selections, translations, history, favorites, or keys. Telemetry is none by default: there is no analytics, no advertising, and no optional telemetry switch, because none is implemented. Password fields are ignored. Selections inside code blocks and common code editors are not translated.

Uninstalling the extension removes its local storage. You can also clear history, favorites, and key fields from the options page.

Contact: <https://github.com/codemanhr/edge-selection-translator/issues>
