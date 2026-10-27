# 划词翻译

在网页上选中文字，译文出现在光标旁边。用于 Microsoft Edge，Chrome 也可以加载。

[English](#english) · [隐私政策](privacy-policy.md)

## 安装

1. 克隆仓库，或下载 ZIP 后解压。
2. 打开 `edge://extensions`，打开「开发人员模式」。
3. 选「加载解压缩的扩展」，指向含有 `manifest.json` 的目录（仓库根目录，不是 `src`）。
4. 在网页上选中文字即可。建议把工具栏上的「划词翻译」固定出来。

Chrome 用 `chrome://extensions`，其余相同。

点面板外面、按 Esc 或滚动页面，面板会关掉。

## 功能

- 面板顶部选目标语言。会判断原文语言，也可以一键对调。原文和目标相同时，在中文和英文之间切换。
- 复制译文，或朗读原文和译文。
- `Alt+T` 强制翻译当前选区，`Alt+Shift+T` 打开或关闭划词翻译。实际按键在 `edge://extensions/shortcuts` 里改。选项页的「快捷键显示系统」只改标签：Windows / Linux 为 `Alt+T`，macOS 为 `⌥T`、`⌥⇧T`。Edge 登记的命令仍是 Alt，在 Mac 上对应 Option。第一次打开设置时按系统选择，之后记住你的选择。
- 工具栏弹窗和选项页可改开关、语言、引擎、语气、深浅色和密钥。
- 最近约 50 条翻译、约 100 条收藏，存在本机。
- 可以按网站停用。`pre`、`code` 以及常见代码编辑器里的选区不翻译，密码框也不读取。
- 默认引擎是 Bing，不用密钥。不可用时改用 Google 或 MyMemory，面板会写明当前用的是哪一个。这几个免密钥接口是公开服务，可能会调整或限流。DeepL、OpenAI 兼容接口、LibreTranslate、Azure 在选项页填写密钥，密钥只保存在本机；没填或失败时退回免密钥引擎。
- 语气可选普通、更口语或更正式。DeepL 和 OpenAI 兼容接口会照此翻译，其他引擎会说明仍按普通风格。
- 可选：网址、邮箱、全大写缩写和连续的英文专名保持原文。
- 面板跟随系统深色或浅色，也可以在选项里固定。

## English

Select text and the translation shows up beside the cursor.

### Install

Open `edge://extensions`, turn on Developer mode, and choose Load unpacked. Pick the folder that contains `manifest.json`. On Chrome the page is `chrome://extensions`.

### Features

Target language sits at the top of the panel. Source language is detected, and the pair can be swapped. Copy or speak the result. `Alt+T` translates the selection even when the feature is off; `Alt+Shift+T` toggles it. On the options page, Shortcut display only changes the labels (`Alt+T` or macOS `⌥T` / `⌥⇧T`). The registered command stays Alt, which is Option on a Mac.

Bing is the default and needs no key. Google and MyMemory are the fallbacks. These free endpoints are public and may change or rate-limit. DeepL, OpenAI-compatible APIs, LibreTranslate, and Azure use a key stored on the device. Tone (neutral, colloquial, formal) is applied by DeepL and OpenAI-compatible APIs. History, favorites, a per-site block list, and skipping code and password fields are included. The panel follows the system theme.

See [privacy-policy.md](privacy-policy.md).

## 开发

直接加载仓库根目录，不用构建。需要 Node.js 18 或更高版本。

```bash
npm test
npm run pack
```

`npm test` 不安装依赖。`npm run pack` 生成 `dist/edge-selection-translator.zip`，里面只有 `manifest.json`、`icons/` 和 `src/`。

## 许可

[MIT](LICENSE) © 2026 codemanhr
