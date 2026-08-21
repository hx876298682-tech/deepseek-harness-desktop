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

### 待处理建议

1. 将桌面应用启动时使用的 dsh CLI 更新到 `0.1.0-rc.7` 或更高版本，并避免优先选取过期 npx 缓存。
2. 更新后重启应用；若仍不显示，再对 `settings.describe`/`llm.providers` 的实际返回做一次界面层核对。
