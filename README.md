# DeepSeek Harness Desktop

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-37-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

一个面向 macOS、Windows 和 Linux 的 Electron 桌面壳，用原生窗口运行官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI。

> 本项目不是对官方 Harness 核心代码的复制或分叉：桌面端在启动时解析本机/托管的 `@deepseek-ai/dsh`，并直接启动官方 `dsh web`。因此 Web UI、插件系统和 CLI 能够保持同一套运行时。

## 与官方仓库的关系

- 官方仓库：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- 本仓库：[hx876298682-tech/deepseek-harness-desktop](https://github.com/hx876298682-tech/deepseek-harness-desktop)
- 对比基线：官方仓库 `master` 的提交 `47f9438`（2026-08-13）；本地桌面端 `v0.1.1` 基于独立 Electron 壳实现。
- 官方项目仍处于 developer preview，可能存在不兼容变更；桌面端会在下次启动时使用解析到的最新 CLI。

## 相比官方 Web/CLI 版本的优化

这里的“优化”指桌面壳针对官方 `dsh web` 的补充，不声称修改了官方 Harness 的 Agent、插件或 Web 核心逻辑。

| 能力 | 官方版本 | 本桌面版本的改进 | 实现位置 |
| --- | --- | --- | --- |
| 原生桌面体验 | 通过 `npx @deepseek-ai/dsh web` 启动本地 Web 服务 | 提供 Electron 原生窗口、加载页、窗口标题和单实例聚焦 | `main.js` |
| CLI 发现 | 由用户自行准备并运行 `npx`/`dsh` | 按环境变量、PATH、npx 缓存、全局 npm、npx fallback 的顺序解析；启动时探测版本 | `resolve-dsh.js` |
| CLI 更新 | 手动执行 npm 命令 | 设置页检查 npm 最新版本，安装到应用托管目录，安装后自动重启 | `main.js`、`preload.cjs` |
| 桌面应用更新 | 官方仓库不提供 Electron 安装器更新流程 | 从当前桌面仓库 GitHub Releases 检查并选择平台/架构安装包，流式下载并显示进度 | `main.js`、`update-utils.js`、`update-section.js` |
| 安全边界 | Web UI 在浏览器或本地服务中运行 | `contextIsolation`、`sandbox`、关闭 Node 集成；外部窗口仅允许 `http(s)` 并交给系统浏览器 | `main.js`、`preload.cjs` |
| 更新链接安全 | 不适用 | IPC 打开外部页面前校验 HTTPS、GitHub 主机和本项目路径，避免任意 URL 跳转 | `main.js` |
| 多进程生命周期 | 终端进程负责停止服务 | Electron 退出时终止 dsh 进程组，超时后强制回收，避免残留本地服务 | `main.js` |
| 单实例 | 取决于启动方式 | 使用 Electron single-instance lock，重复启动时恢复并聚焦已有窗口 | `main.js` |
| 桌面快捷键 | 浏览器行为受 Web composer 拦截影响 | 原生 Edit 菜单和 `before-input-event` 转发 Cmd/Ctrl+C/X/V/A，修复输入框复制粘贴 | `main.js` |
| 可诊断性 | 主要依赖终端输出 | 将启动、解析、服务异常写入用户数据目录的 `dsh-desktop.log`，并提供菜单入口 | `main.js` |
| 发布分发 | npm 包与源码 | electron-builder 生成 macOS DMG、Windows NSIS、Linux AppImage，并由 GitHub Actions 发布 | `package.json`、`.github/workflows/release.yml` |

### 重点设计取舍

1. **不打包 Harness 核心**：桌面端只负责窗口和进程管理，避免桌面安装包与官方 Web bundle 分叉。
2. **更新分层**：CLI 更新可以安装后自动重启；桌面安装器涉及替换运行中的应用，下载后打开安装包并由用户完成安装。
3. **跨平台资产选择**：根据平台、CPU 架构和扩展名评分，优先选择 macOS DMG / Windows EXE 或 MSI / Linux AppImage、DEB、RPM；排除 blockmap、校验文件和元数据。
4. **DMG 安全提示**：从挂载的 DMG 直接运行时阻止更新，并提示先拖入 `Applications`，避免覆盖只读挂载镜像。

## 功能概览

- 启动并嵌入官方 Harness Web UI，启动端口由 `dsh` 自动分配。
- 支持通过 `DSH_BIN` 指定 CLI，也支持 npm/npx 缓存和全局安装自动发现。
- 设置页面分别管理 `@deepseek-ai/dsh` CLI 与桌面应用更新。
- GitHub Release 下载使用流式写入、大小校验和进度事件，不会在运行中覆盖当前应用。
- Electron 安全配置：隔离上下文、禁用 Node 集成、启用 sandbox。
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

- Node.js（推荐 LTS；运行官方 dsh 时请以官方仓库当前要求为准）
- npm
- 已安装的 `@deepseek-ai/dsh`，或可用的 `npx`

```bash
npm ci
npm start
```

如果没有全局安装 CLI，桌面端会尝试通过 npx 启动：

```bash
npx @deepseek-ai/dsh web
```

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
git tag v0.1.1
git push origin v0.1.1
```

安装包和本地构建目录默认被 `.gitignore` 排除，不直接提交到源仓库。

## 已知限制

- 官方 Harness 仍在快速迭代，CLI/Web API 可能发生 breaking changes。
- 桌面应用目前未配置代码签名和公证；macOS 首次打开可能需要右键选择“打开”。
- 桌面更新是“下载并打开安装器”，不会自动覆盖正在运行的应用。
- GitHub API、npm registry 或本地网络不可用时，更新检查会失败，但不会影响已安装版本运行。

## 许可证

本项目采用 [MIT](https://github.com/hx876298682-tech/deepseek-harness-desktop/blob/main/LICENSE) 许可证。官方 Harness 同样采用 MIT，详见[官方仓库](https://github.com/deepseek-ai/deepseek-harness)。
