# DeepSeek Harness Desktop

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 变成一个更方便使用的桌面应用。

当前版本：`v0.1.8`

支持 macOS、Windows 和 Linux。

## 实际界面

### 主界面

![DeepSeek Harness Desktop 主界面](docs/images/main-interface.png)

### 设置与更新

![DeepSeek Harness Desktop 设置与更新页面](docs/images/settings-updates.png)

## 它能做什么？

- 像普通桌面软件一样打开 DeepSeek Harness
- 第一次打开时，自动准备 Node.js 和 DeepSeek Harness
- 不需要用户提前安装 DeepSeek Harness
- 支持在设置里更新 Harness 和桌面应用
- 在设置 → 插件中增加“论坛插件”，可以浏览 GitHub 上的 DSH 插件
- 支持复制、粘贴和常用快捷键
- 支持发送图片
  - DeepSeek 模型保持官方的纯文本限制
  - 其他模型默认尝试发送图片，如果模型不支持，会显示服务商返回的错误
- 支持发送文本和代码文件
  - 点击输入框左下角的回形针按钮选择文件
  - 也可以把文件直接拖到输入框
  - 支持 TXT、Markdown、JSON、CSV 和常见代码文件
  - 单个文件最大 1 MB，一次最多 5 个文件
  - PDF、Word、Excel 等文件暂时不支持
- 支持 macOS、Windows 和 Linux

## 内置插件：用量统计（dsh-usage-stats）

应用自带 [dsh-usage-stats](plugins/dsh-usage-stats) 插件（多供应商余额、订阅额度与 Token 用量分析）。每次启动应用时，它会自动把插件安装/同步到当前 dsh 环境（`DSH_HOME` 或 `~/.dsh`）的 `profiles/web`，并幂等启用：

- 设置 → 插件 → “用量统计”标签页可查看安装状态，手动点击“安装 / 更新”可重新同步。
- 安装后重启 dsh web 并在浏览器硬刷新，侧边栏底部会出现“用量/余额”（Usage/Balance）入口。
- 插件源码位于 [plugins/dsh-usage-stats](plugins/dsh-usage-stats)，安装逻辑见 [usage-stats-plugin.js](usage-stats-plugin.js)。

## 安装使用

### 普通用户

从 [Releases](https://github.com/hx876298682-tech/deepseek-harness-desktop/releases) 下载对应系统的安装包：

- macOS Apple Silicon：下载 `arm64.dmg`
- macOS Intel：下载 `x64.dmg`
- Windows：下载 `.exe`
- Linux：下载 `.AppImage`

安装后直接打开即可。

第一次打开时需要联网，软件会自动下载运行所需的文件。以后打开不需要重复下载。

### macOS 提示

目前安装包没有 Apple 官方签名。如果系统提示无法打开：

1. 右键点击应用
2. 选择“打开”
3. 再点击“打开”确认

## 更新软件

打开应用左下角的“设置”，进入“更新”：

- **DeepSeek Harness CLI**：更新官方 Harness
- **DeepSeek Harness Desktop**：更新桌面应用

桌面应用更新会下载新版本，自动退出、替换旧版本并重新打开应用。若应用正从 DMG 挂载盘运行，请先将它拖入 Applications 文件夹；没有写入权限时会提示你手动安装。

## 从源码运行

需要安装 Node.js 和 npm：

```bash
npm ci
npm start
```

运行测试：

```bash
npm run test:update-utils
```

构建安装包：

```bash
# macOS Apple Silicon
npm run dist:mac-arm64

# macOS Intel
npm run dist:mac-x64

# Linux
npm run dist:linux

# Windows
npm run dist:win
```

## 常见问题

### 需要提前安装 DeepSeek Harness 吗？

不需要。桌面应用第一次启动时会自动准备 Node.js，并自动安装官方 Harness。

### 第一次打开失败怎么办？

请确认网络正常，然后重新打开应用。如果仍然失败，可以查看应用日志：

```text
dsh-desktop.log
```

### 关闭桌面应用时，dsh web 会一起关闭吗？

会。桌面应用启动的 dsh web 是它的子进程，关闭应用时会先给它发 SIGTERM 等待优雅退出（最长约 5 秒），超时再强制结束，不会留下后台孤儿进程。

只有一种情况例外：如果 dsh web 是在打开桌面应用之前就已经由其他方式（例如终端）启动的，桌面应用只是复用它，关闭时不会动它。

### 如何发送文件？

点击输入框左下角的回形针按钮，选择文本或代码文件。也可以直接把文件拖到输入框里。

目前支持 TXT、Markdown、JSON、CSV 和常见代码文件。文件内容会以文字的形式放进消息，并带上文件名。

单个文件不能超过 1 MB，一次最多选择 5 个文件。PDF、Word、Excel 等文件暂时不支持。

### 为什么有些模型不能发图片？

不同模型的能力不一样。桌面端会先尝试发送图片，如果模型或服务商不支持，接口会返回错误。DeepSeek 官方模型仍按官方规则只支持文本。

## 说明

本项目是官方 DeepSeek Harness 的桌面外壳，不是官方 Harness 核心代码的复制版。官方项目仍在持续开发中，后续可能会有功能变化。

官方仓库：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

DSH 插件论坛：[github.com/topics/dsh-plugin](https://github.com/topics/dsh-plugin)

本项目仓库：[deepseek-harness-desktop](https://github.com/hx876298682-tech/deepseek-harness-desktop)

## 许可证

[MIT License](LICENSE)
