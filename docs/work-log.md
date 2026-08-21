# 工作记录

## 2026-08-21

- 排查已安装的 `/Applications/DeepSeek Harness Desktop.app`（当前版本 `0.1.8`）中自定义模型配置不显示的问题。
- 确认配置没有丢失：`/Users/huxiao07/.dsh/settings.yaml` 仍存在且可解析，包含 `gongsi-claude`、`gongsi`、`opencode-go` 3 个 provider，以及 27 个自定义模型；另有两份 settings 备份。
- 确认桌面应用实际使用的 Electron 数据目录是 `/Users/huxiao07/Library/Application Support/DeepSeek Harness Desktop`。旧目录 `/Users/huxiao07/Library/Application Support/DSH Desktop` 仅为旧壳缓存，不是模型配置来源。
- 发现桌面日志多次显示应用解析并启动 `~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh` 的 `0.1.0-rc.6`。npm 当前 `latest` 已为 `0.1.0-rc.7`。
- 代码中的解析顺序优先使用 npx 缓存（`resolve-dsh.js`），只要缓存版本存在就不会安装/使用托管的 dsh，因此升级桌面壳后仍可能运行旧 CLI。这是当前最可能导致模型配置界面与现有 settings 不匹配的原因。
- 另发现 `dsh-usage-stats` 在 `app.asar` 下报 `ENOTDIR`，与模型配置显示无直接关系。
- 本次仅做只读诊断并启动后关闭应用，未修改用户配置、未删除任何数据。

### 2026-08-21 压缩包回溯与 App 复现

- 检查 `/Users/huxiao07/Downloads/dsh-session-session-739de26c-5ad8-4ab8-b0ff-a104e10eb6e3.zip`：记录显示故障前曾直接编辑 `/Users/huxiao07/.dsh/settings.yaml`，给 `gongsi`、`gongsi-claude` 模型批量加入 `reasoningEfforts` 和 `compat`。
- 实际启动 `/Applications/DeepSeek Harness Desktop.app` 并进入设置 -> 模型，AX/UI 状态确认“添加自定义提供方”按钮为 disabled；页面本身正常渲染，问题确实发生在 App 的 provider 数据层。
- 用 App 当前使用的 `@deepseek-ai/dsh-llm-pi-ai` 运行时直接加载配置，得到明确错误：`llm-pi-ai: provider "gongsi" model "DeepSeek-V4-Flash" reasoningEfforts.minimal needs the wire value dispatch should send; only "off" may leave it empty`。修改前备份 `settings.yaml.bak-reasoning-20260821-162940` 加载通过。
- 根因已闭合：批量修改把非 `off` 的思考档位写成了 `null`（例如 `minimal: null`、`low: null`），违反运行时 schema，导致整个 `llm-pi-ai` provider namespace 无法正常注册，App 因没有可添加的 provider 而禁用按钮。
- 本轮只读验证，尚未修改 `/Users/huxiao07/.dsh/settings.yaml`；不要把 CLI 版本差异当作本次按钮 disabled 的唯一原因。

### 2026-08-21 恢复

- 按用户要求，将 `/Users/huxiao07/.dsh/settings.yaml` 恢复为故障前备份 `settings.yaml.bak-reasoning-20260821-162940`。
- 恢复前的故障配置已保留为 `/Users/huxiao07/.dsh/settings.yaml.bak-before-restore-20260821-172241`，未删除任何文件。
- 恢复后的配置通过 `@deepseek-ai/dsh-llm-pi-ai` 运行时校验。
- 重启桌面 App 后，模型页重新显示 `gongsi-claude`、`gongsi`，且“添加自定义提供方”按钮已恢复可用。

### 2026-08-21 方案 A 实现与发布准备

- 在项目中新增 `model-capabilities.js`：按 dsh/pi-ai 官方模型目录为 `gongsi`、`gongsi-claude` 写入模型级 `reasoningEfforts`/`compat`；未知能力模型使用 `false`，非 `off` 档位不写 `null`。
- 在 `main.js` 启动 dsh 前执行一次迁移；迁移带 marker，写入前创建 `settings.yaml.bak-model-capabilities-*`，失败只记录日志，不阻断 App 启动。
- 新增 3 个迁移测试并纳入测试脚本；修复多 provider 块边界后，项目测试共 32 项全部通过。
- 使用真实 `@deepseek-ai/dsh-llm-pi-ai` runtime 校验迁移后的当前配置，`gongsi-claude`、`gongsi` 两个 provider 均 serviceable。
- 版本从 `0.1.8` 更新到 `0.1.9`，electron-builder 白名单包含新模块；源码 smoke test 通过，asar 内容确认包含 `model-capabilities.js`。
- 已构建 `dist/DeepSeekHarnessDesktop-0.1.9-arm64.dmg`（104 MB）；由于当前无 GUI 会话，直接运行打包裸二进制的 smoke 未完成，未将其记为通过。
- 发布代码提交：`97cb86f feat: migrate model-specific reasoning capabilities`，分支：`codex/model-capabilities`；随该版本一并包含此前已暂存的 dsh 更新超时处理改动。
- 已推送标签 `v0.1.9` 并发布 GitHub Release：`https://github.com/hx876298682-tech/deepseek-harness-desktop/releases/tag/v0.1.9`，资产为 arm64 DMG（SHA-256：`93e2a2e1be1f4980fe830df0f1231b97f6e290b3578dbc3b63526ae5d1c89c7e`）及 blockmap。
- 用更新器同一套版本比较/资产匹配逻辑验证：已安装 `0.1.8` 会发现 `0.1.9` 并选择 `DeepSeekHarnessDesktop-0.1.9-arm64.dmg`。

### 待处理建议

1. 将桌面应用启动时使用的 dsh CLI 更新到 `0.1.0-rc.7` 或更高版本，并避免优先选取过期 npx 缓存。
2. 更新后重启应用；若仍不显示，再对 `settings.describe`/`llm.providers` 的实际返回做一次界面层核对。

### 2026-08-21 工作区与用量插件核查

- 当前分支 `codex/model-capabilities` 工作区干净：没有已暂存或未暂存的改动。
- 仓库内置完整的 `dsh-usage-stats` 用量插件，源码在 `plugins/dsh-usage-stats`；服务端接口在 `lib/index.js`，前端面板在 `lib/client.js`，Token 聚合在 `lib/usage.js`。
- 桌面壳通过根目录 `usage-stats-plugin.js` 在启动时同步插件至 `~/.dsh/profiles/node_modules/dsh-usage-stats` 并幂等写入 Cordis 配置；`main.js` 还提供状态查询和手动安装 IPC。构建配置已包含插件目录与安装逻辑。
- 相关功能由提交 `224ed0a feat: bundle dsh-usage-stats plugin and auto-install at launch` 引入。

### 2026-08-21 更新后启动报错核查

- 当前已安装 App 为 `0.1.9`；启动日志明确报错：`usage-stats plugin setup failed: ENOTDIR`，路径为 `app.asar/plugins/dsh-usage-stats/lib`。
- 根因是 electron-builder 将插件放进 `app.asar` 后，桌面端安装器使用 `fs.cp` 递归读取 asar 虚拟目录；Electron 的 asar 路径不能按普通目录遍历，因此插件同步失败。dsh 主进程随后仍能启动。
- 已先写入一个回归测试，要求打包模块把插件根目录解析到 `app.asar.unpacked`；尚未写生产修复。
- 实施过程中发现 `package.json` 在 2026-08-21 18:44 被外部改成仅 8 行，原有 scripts、devDependencies 与 electron-builder 配置全部消失；该改动不是本轮产生，已暂停构建修复和版本发布，等待确认是否需要恢复。

### 2026-08-21 启动报错修复与 v0.1.10

- 按用户要求恢复 `package.json` 原有 scripts、devDependencies 和 electron-builder 配置，并同步恢复完整构建元数据。
- `usage-stats-plugin.js` 新增打包路径解析：模块位于 `app.asar` 时改用同级 `app.asar.unpacked/plugins/dsh-usage-stats`；`package.json` 增加 `asarUnpack`，避免 `fs.cp` 遍历 asar 虚拟目录触发 `ENOTDIR`。
- 新增打包路径回归测试；项目测试共 33 项全部通过。
- 版本与 lockfile 更新到 `0.1.10`；已成功构建 `dist/DeepSeekHarnessDesktop-0.1.10-arm64.dmg`，并确认插件文件实际位于 `dist/mac-arm64/.../app.asar.unpacked/plugins/dsh-usage-stats/lib/index.js`。
- 裸应用 smoke 在当前无可用 GUI 会话环境中无法完成，手动中断；DMG 未使用正式 Developer ID 签名。
