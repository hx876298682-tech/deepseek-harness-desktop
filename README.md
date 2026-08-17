# DeepSeek Harness Desktop

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-37-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

一个面向 macOS、Windows 和 Linux 的 Electron 桌面壳，用原生窗口运行官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI。

> 本项目不是对官方 Harness 核心代码的复制或分叉：桌面端在启动时解析本机/托管的 `@deepseek-ai/dsh`，并直接启动官方 `dsh web`。桌面端复用官方 Web 运行时，但不提供官方 CLI 的全部终端入口。

## 与官方仓库的关系

- 官方仓库：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- 本仓库：[hx876298682-tech/deepseek-harness-desktop](https://github.com/hx876298682-tech/deepseek-harness-desktop)
- 对比基线：截至 2026-08-14 对官方仓库 `master` 做人工源码对比；官方基线可在 [`47f9438`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a) 查看。本地桌面端 `v0.1.1` 基于独立 Electron 壳实现。
- 官方项目仍处于 developer preview，可能存在不兼容变更；桌面端每次启动都会重新解析当前已安装或缓存中的 CLI。只有用户在设置页执行 CLI 更新后，下一次启动才会使用托管目录中的新版本。

## 相比官方 Web/CLI 版本的优化

这里的“优化”指桌面壳针对官方 `dsh web` 的补充，不声称修改了官方 Harness 的 Agent、插件或 Web 核心逻辑。

| 能力 | 官方版本 | 本桌面版本的改进 | 实现位置 |
| --- | --- | --- | --- |
| 原生桌面体验 | 通过 `npx @deepseek-ai/dsh web` 启动本地 Web 服务 | 提供 Electron 原生窗口、加载页、窗口标题和单实例聚焦 | `main.js` |
| CLI 发现 | 由用户自行准备并运行 `npx`/`dsh` | 按环境变量、PATH、npx 缓存、全局 npm、npx fallback 的顺序解析；启动时探测版本 | `resolve-dsh.js` |
| CLI 更新 | 手动执行 npm 命令 | 设置页检查 npm 最新版本，安装到应用托管目录，安装后自动重启 | `main.js`、`preload.cjs` |
| 桌面应用更新 | 官方仓库不提供 Electron 安装器更新流程 | 从当前桌面仓库 GitHub Releases 检查并选择平台/架构安装包，流式下载并显示进度 | `main.js`、`update-utils.js`、`update-section.js` |
| 安全边界 | Web UI 在浏览器或本地服务中运行 | `contextIsolation`、`sandbox`、关闭 Node 集成；新窗口链接仅允许 `http(s)` 并交给系统浏览器 | `main.js`、`preload.cjs` |
| 更新链接安全 | 不适用 | IPC 打开 Release 页面前校验 HTTPS、GitHub 主机和本项目路径，避免任意 URL 跳转 | `main.js` |
| 多进程生命周期 | 终端进程负责停止服务 | Electron 退出时尝试终止 dsh 进程组，Unix 下有超时强制回收；Windows 行为需在目标系统验证 | `main.js` |
| 单实例 | 取决于启动方式 | 使用 Electron single-instance lock，重复启动时恢复并聚焦已有窗口 | `main.js` |
| 桌面快捷键 | 浏览器行为受 Web composer 拦截影响 | 原生 Edit 菜单和 `before-input-event` 转发 Cmd/Ctrl+C/X/V/A，修复输入框复制粘贴 | `main.js` |
| 可诊断性 | 主要依赖终端输出 | 将启动、解析、服务异常写入用户数据目录的 `dsh-desktop.log`，并提供菜单入口 | `main.js` |
| 发布分发 | npm 包与源码 | electron-builder 生成 macOS DMG、Windows NSIS、Linux AppImage，并由 GitHub Actions 发布 | `package.json`、`.github/workflows/release.yml` |

### 重点设计取舍

1. **不打包 Harness 核心**：桌面端只负责窗口和进程管理，避免桌面安装包与官方 Web bundle 分叉。
2. **更新分层**：CLI 更新可以安装后自动重启；桌面安装器涉及替换运行中的应用，下载后打开安装包并由用户完成安装。
3. **跨平台资产选择**：根据平台、CPU 架构和扩展名评分，优先选择 macOS DMG/ZIP、Windows EXE/MSI 或 Linux AppImage/DEB/RPM；当前 CI 默认构建并发布 macOS DMG、Windows NSIS 和 Linux AppImage，其他格式可由后续 Release 资产提供。
4. **DMG 安全提示**：从挂载的 DMG 直接运行时阻止更新，并提示先拖入 `Applications`，避免覆盖只读挂载镜像。

## 功能概览

- 启动并嵌入官方 Harness Web UI，通过 `--port 0` 请求自动选择空闲端口。
- 支持通过 `DSH_BIN` 指定 CLI，也支持 npm/npx 缓存和全局安装自动发现；Windows 路径处理已兼容，但仍建议在目标系统执行 smoke test。
- 首次启动自动检测 Node.js/npm；缺少时下载并托管 Node.js 22，缺少 dsh 时自动安装 `@deepseek-ai/dsh`，无需用户预装 Harness。
- 设置页面分别管理 `@deepseek-ai/dsh` CLI 与桌面应用更新。
- GitHub Release 下载使用流式写入、大小校验和进度事件，不会在运行中覆盖当前应用。
- Electron 安全配置：隔离上下文、禁用 Node 集成、启用 sandbox。
- 当前桌面入口只启动官方 `web` profile；CLI 的 headless、插件开发等其他入口仍请直接使用官方 CLI。
- 非 DeepSeek Provider 默认声明支持图片输入，让服务端返回真实的模型能力错误；DeepSeek Provider 保持官方纯文本限制。
- 单实例、原生编辑菜单、外部链接拦截、启动日志和 smoke test。

## 目录结构

```text
.
├── main.js                 # Electron 主进程、窗口、dsh 服务和更新逻辑
├── preload.cjs             # 最小 IPC bridge，并注入桌面更新设置页
├── resolve-dsh.js          # dsh CLI 发现、版本探测和 npx fallback
├── update-utils.js         # 版本比较和发布资产选择
├── update-utils.test.js    # 更新工具单元测试
├── update-section.js       # 设置页更新区块源码
├── _extracted/             # 可复现的应用源快照
├── build/                  # 应用图标等构建资源
└── .github/workflows/      # Release 构建矩阵
```

## 本地运行

### 环境要求

- Node.js 22+（若未安装，桌面端首次启动会从 nodejs.org 自动下载托管版本）
- 网络连接（首次启动需要下载 Node.js 或 `@deepseek-ai/dsh`；Node.js 与 dsh 都已有托管缓存时可离线启动）
- 开发和源码运行需要 npm；发布安装包的普通用户不需要预先安装 dsh

```bash
npm ci
npm start
```

首次启动时，桌面端会自动执行以下准备流程：

1. 检测当前系统是否有满足官方要求的 Node.js 和 npm。
2. 如果没有，自动从 Node.js 官方发行站下载 Node.js 22 LTS，并安装到应用用户数据目录。
3. 检测 `@deepseek-ai/dsh`；如果没有，使用 npm 自动安装到应用用户数据目录。
4. 启动官方 `dsh web`，后续启动复用托管版本。

Node.js 安装包会校验 Node.js 官方提供的 SHA-256 文件摘要。网络不可用且没有本地缓存时，首次准备会失败并写入 `dsh-desktop.log`。

也可以显式指定入口进行调试：

```bash
DSH_BIN=/path/to/@deepseek-ai/dsh/lib/bin.js npm start
```

### Smoke test 与单元测试

```bash
npm run test:update-utils
npm run start:smoke
```

`start:smoke` 会启动桌面壳并验证 dsh 服务报告 URL；在没有可用 Node、dsh 或网络时会失败，此时请查看用户数据目录中的 `dsh-desktop.log`。

## 构建安装包

```bash
# macOS Apple Silicon
npm run dist:mac-arm64

# macOS Intel
npm run dist:mac-x64

# Linux x64
npm run dist:linux

# Windows x64
npm run dist:win
```

推送 `v*` 标签会触发 `.github/workflows/release.yml`，在 macOS arm64、macOS x64、Linux x64 和 Windows x64 构建并发布 GitHub Release：

```bash
git tag v0.1.2
git push origin v0.1.2
```

安装包和本地构建目录默认被 `.gitignore` 排除，不直接提交到源仓库。

## 已知限制

- 官方 Harness 仍在快速迭代，CLI/Web API 可能发生 breaking changes。
- 桌面应用目前未配置代码签名和公证；macOS 首次打开可能需要右键选择“打开”。
- 桌面更新是“下载并打开安装器”，不会自动覆盖正在运行的应用。
- GitHub API、npm registry 或本地网络不可用时，更新检查会失败，但不会影响已安装版本运行；没有托管缓存时，首次自动准备也无法完成。
- Node.js 自动下载会校验官方 SHA-256 摘要；当前托管 Node.js 版本为 22 LTS，同时接受已安装的 Node.js 22.19+ 或 24；桌面 Release 下载目前只校验响应状态和文件大小，不提供 checksum 或签名校验，请只使用可信 Release。
- 设置页更新区是通过 preload 注入官方 Web 的内部模块/slot/plugin hook，官方 Web 大版本升级后可能需要适配。
- 非 DeepSeek Provider 的默认图片能力会写入 `$DSH_HOME/settings.yaml` 的 `defaultInput: [text, image]`；已有显式 `defaultInput` 不会覆盖，DeepSeek Provider 不会修改。
- Windows 的进程组回收和完整发布流程仍需在目标系统执行 smoke test；解析器已使用平台 PATH 分隔符并支持 Windows 路径，但本机无法替代 Windows 验证。

## 许可证

本项目采用 [MIT](https://github.com/hx876298682-tech/deepseek-harness-desktop/blob/main/LICENSE) 许可证。官方 Harness 同样采用 MIT，详见[官方仓库](https://github.com/deepseek-ai/deepseek-harness)。
