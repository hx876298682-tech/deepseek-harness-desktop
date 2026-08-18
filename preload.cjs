const { contextBridge, ipcRenderer, webFrame } = require("electron");

const updater = {
  check: () => ipcRenderer.invoke("dsh-update:check"),
  install: () => ipcRenderer.invoke("dsh-update:install"),
  checkDesktop: () => ipcRenderer.invoke("dsh-desktop-update:check"),
  installDesktop: () => ipcRenderer.invoke("dsh-desktop-update:install"),
  openExternal: (url) => ipcRenderer.invoke("dsh-desktop-update:open", url),
  onDesktopProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("dsh-desktop-update:progress", listener);
    return () => ipcRenderer.removeListener("dsh-desktop-update:progress", listener);
  }
};

contextBridge.exposeInMainWorld("__DSH_DESKTOP_UPDATER__", updater);
contextBridge.exposeInMainWorld("__DSH_DESKTOP_FORUM_PLUGINS__", { list: () => ipcRenderer.invoke("dsh-forum-plugins:list") });
const MAIN_WORLD = "(() => {\n  if (window.__DSH_DESKTOP_UPDATER_SECTION__) return;\n  window.__DSH_DESKTOP_UPDATER_SECTION__ = true;\n  const PLUGIN_ID = \"dsh-desktop-updater\";\n\n  function ensureEntry(graph) {\n    if (!graph || !Array.isArray(graph.entries)) return graph;\n    const entry = graph.entries.find((row) => row && row.id === PLUGIN_ID);\n    if (entry) { entry.rev = \"desktop-2\"; return graph; }\n    graph.entries.push({ id: PLUGIN_ID, url: \"about:blank\", rev: \"desktop-2\", immediately: true, inject: [\"@deepseek-ai/dsh-client-ui-settings-general\"] });\n    return graph;\n  }\n\n  function hookBoot() {\n    const current = window.__DSH_BOOT__;\n    if (current) ensureEntry(current);\n    try {\n      let value = current;\n      Object.defineProperty(window, \"__DSH_BOOT__\", { configurable: true, enumerable: true, get() { return value; }, set(next) { value = ensureEntry(next); } });\n    } catch { if (current) ensureEntry(current); }\n  }\n\n  function factory(require) {\n    const React = require(\"react\");\n    const jsxRuntime = require(\"react/jsx-runtime\");\n    const primitives = require(\"@deepseek-ai/dsh-client-ui-primitives\");\n    const jsx = jsxRuntime.jsx;\n    const jsxs = jsxRuntime.jsxs;\n    const Button = primitives.Button;\n    const css = [\n      \".dshDeskUpd_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}\",\n      \".dshDeskUpd_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}\",\n      \".dshDeskUpd_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}\",\n      \".dshDeskUpd_card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:12px;padding:12px 14px;display:flex}\",\n      \".dshDeskUpd_row{align-items:center;gap:10px;display:flex}\",\n      \".dshDeskUpd_copy{min-width:0;flex:1}\",\n      \".dshDeskUpd_name{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}\",\n      \".dshDeskUpd_meta{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;line-height:18px}\",\n      \".dshDeskUpd_actions{align-items:center;gap:4px;margin-left:auto;display:inline-flex}\",\n      \".dshDeskUpd_ok{color:var(--dsw-alias-state-success-primary);margin:0;font-size:12px;line-height:18px}\",\n      \".dshDeskUpd_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}\"\n    ].join(\"\");\n\n    function injectCss() {\n      if (typeof document === \"undefined\" || document.querySelector(\"style[data-plugin-css=dsh-desktop-updater]\")) return;\n      const tag = document.createElement(\"style\");\n      tag.dataset.plugin = PLUGIN_ID; tag.dataset.pluginCss = \"dsh-desktop-updater\"; tag.textContent = css; document.head.appendChild(tag);\n    }\n\n    function UpdateCard({ updater, desktop, title, idleMessage }) {\n      const [phase, setPhase] = React.useState(\"idle\");\n      const [current, setCurrent] = React.useState(\"\");\n      const [latest, setLatest] = React.useState(\"\");\n      const [status, setStatus] = React.useState(\"\");\n      const [kind, setKind] = React.useState(\"\");\n      const [releaseUrl, setReleaseUrl] = React.useState(\"\");\n      const [progress, setProgress] = React.useState(null);\n      React.useEffect(() => {\n        if (!desktop || !updater || typeof updater.onDesktopProgress !== \"function\") return undefined;\n        return updater.onDesktopProgress((payload) => setProgress(payload));\n      }, [desktop, updater]);\n      const show = (message, nextKind = \"\") => { setStatus(message); setKind(nextKind); };\n      const check = async () => {\n        if (!updater || phase === \"checking\" || phase === \"downloading\") return;\n        setPhase(\"checking\"); setProgress(null); show(\"正在检查最新版本…\");\n        try {\n          const result = await (desktop ? updater.checkDesktop() : updater.check());\n          setCurrent(result.currentVersion || \"\"); setLatest(result.latestVersion || \"\"); setReleaseUrl(result.releaseUrl || \"\");\n          if (!result.latestVersion) { setPhase(\"idle\"); show(result.message || \"还没有发布桌面应用版本\", desktop ? \"\" : \"ok\"); return; }\n          if (!result.hasUpdate) { setPhase(\"current\"); show(\"当前已是最新版本。\", \"ok\"); return; }\n          if (desktop && result.runningFromMountedImage) { setPhase(\"blocked\"); show(\"当前应用从 DMG 挂载盘运行，请先拖入 Applications 文件夹。\", \"err\"); return; }\n          if (desktop && !result.available) { setPhase(\"no-asset\"); show(result.message || \"有新版本，但没有当前平台安装包。\", \"err\"); return; }\n          if (desktop) { setPhase(\"ready\"); show(\"发现 v\" + result.latestVersion + \"，点击“自动更新并重启”继续。\", \"ok\"); return; }\n          setPhase(\"downloading\"); show(\"发现新版本，正在下载安装…\");\n          const installed = await updater.install(); setPhase(\"installed\"); show(\"已安装 v\" + installed.version + \"，应用即将重启…\", \"ok\");\n        } catch (error) { setPhase(\"error\"); show(\"更新失败：\" + (error?.message || String(error)), \"err\"); }\n      };\n      const install = async () => {\n        if (!desktop || phase !== \"ready\") return;\n        setPhase(\"downloading\"); setProgress(null); show(\"正在下载安装包…\");\n        try { const installed = await updater.installDesktop(); setPhase(\"installed\"); show(installed.message || \"安装包已打开，请完成安装后重启应用。\", \"ok\"); }\n        catch (error) { setPhase(\"error\"); show(\"更新失败：\" + (error?.message || String(error)), \"err\"); }\n      };\n      const label = phase === \"checking\" ? \"检查中…\" : phase === \"downloading\" ? \"下载中…\" : phase === \"ready\" ? \"自动更新\" : phase === \"current\" ? \"重新检查\" : phase === \"installed\" ? \"重新检查\" : phase === \"error\" ? \"重试\" : \"检查更新\";\n      const busy = phase === \"checking\" || phase === \"downloading\";\n      const progressText = progress?.total && progress.percent !== null ? \" \" + Math.round(progress.percent * 100) + \"%\" : \"\";\n      const statusClass = kind === \"err\" ? \"dshDeskUpd_error\" : kind === \"ok\" ? \"dshDeskUpd_ok\" : \"dshDeskUpd_meta\";\n      const openRelease = () => { if (releaseUrl && updater.openExternal) updater.openExternal(releaseUrl).catch(() => {}); };\n      return jsxs(\"div\", { className: \"dshDeskUpd_card\", children: [\n        jsxs(\"div\", { className: \"dshDeskUpd_row\", children: [\n          jsxs(\"div\", { className: \"dshDeskUpd_copy\", children: [jsx(\"div\", { className: \"dshDeskUpd_name\", children: title }), jsx(\"p\", { className: \"dshDeskUpd_meta\", children: current ? (latest ? \"当前版本 v\" + current + \" · 最新版本 v\" + latest : \"当前版本 v\" + current) : idleMessage })] }),\n          jsxs(\"div\", { className: \"dshDeskUpd_actions\", children: [jsx(Button, { variant: \"primary\", size: \"sm\", disabled: busy || !updater, onClick: phase === \"ready\" ? install : check, children: label + (phase === \"downloading\" ? progressText : \"\") }), desktop && releaseUrl && (phase === \"no-asset\" || phase === \"blocked\" || !latest) ? jsx(Button, { variant: \"secondary\", size: \"sm\", onClick: openRelease, children: \"打开发布页\" }) : null] })\n        ] }),\n        status ? jsx(\"p\", { className: statusClass, children: status }) : null\n      ] });\n    }\n\n    function UpdateSection() {\n      const updater = window.__DSH_DESKTOP_UPDATER__;\n      return jsxs(\"div\", { className: \"dshDeskUpd_section\", children: [\n        jsx(\"h2\", { className: \"dshDeskUpd_title\", children: \"更新\" }),\n        jsx(\"p\", { className: \"dshDeskUpd_intro\", children: \"分别检查 CLI 与桌面应用。桌面应用会自动下载、替换并重启；从 DMG 直接运行时需要先复制到 Applications。\" }),\n        jsx(UpdateCard, { updater, desktop: false, title: \"DeepSeek Harness CLI\", idleMessage: \"从 npm 检查 CLI 最新版本\" }),\n        jsx(UpdateCard, { updater, desktop: true, title: \"DeepSeek Harness Desktop\", idleMessage: \"从 GitHub Releases 检查当前平台安装包\" })\n      ] });\n    }\n\n    const dictionaries = { zh: { nav: \"更新\" }, en: { nav: \"Updates\" } };\n    function apply(ctx) {\n      injectCss();\n      if (ctx.locale && typeof ctx.locale.register === \"function\") ctx.effect(() => ctx.locale.register(\"settings.desktopUpdate\", dictionaries), \"dsh-desktop-updater: locale\");\n      const t = ctx.locale && typeof ctx.locale.bind === \"function\" ? ctx.locale.bind(\"settings.desktopUpdate\") : () => \"更新\";\n      ctx.slots.inject(\"settings.section\", () => ctx.slots.register({ name: \"settings.section\", id: \"update\", order: 30, label: () => { try { return t(\"nav\"); } catch { return \"更新\"; } } }, UpdateSection));\n    }\n    return { apply, inject: [\"slots\", \"locale\"] };\n  }\n\n  function registerFactory(loader) { if (loader && typeof loader.load === \"function\") { try { loader.load({ id: PLUGIN_ID, factory }); } catch {} } }\n  function hookLoader() {\n    const current = window.__ModuleLoader__; if (current) registerFactory(current);\n    try { let value = current; Object.defineProperty(window, \"__ModuleLoader__\", { configurable: true, enumerable: true, get() { return value; }, set(next) { value = next; registerFactory(next); } }); } catch { if (current) registerFactory(current); }\n  }\n  hookBoot(); hookLoader();\n})();\n";
webFrame.executeJavaScript(MAIN_WORLD).catch(() => {});

const TEXT_FILES_WORLD = String.raw`(() => {
  if (window.__DSH_DESKTOP_TEXT_FILES__) return;
  window.__DSH_DESKTOP_TEXT_FILES__ = true;
  const MAX_BYTES = 1024 * 1024;
  const extensions = new Set("txt md mdx csv json yaml yml xml html htm css js mjs cjs ts tsx jsx py java c h cpp cc cs go rs rb php swift kt kts sh bash zsh sql vue svelte toml ini conf env log rst tex".split(" "));
  const isTextName = (name) => {
    const clean = String(name || "").split(/[\\/]/).pop().toLowerCase();
    return clean === "dockerfile" || clean === ".env" || extensions.has(clean.split(".").pop());
  };
  const format = (files) => files.map(({ name, content }) => "\n\n--- 文件：" + name + " ---\n" + content + "\n--- 文件结束：" + name + " ---").join("");
  const showError = (message) => { window.alert(message); };
  const insert = (files) => {
    const textarea = document.querySelector("[data-composer-card] textarea");
    if (!textarea || !files.length) return;
    const text = format(files);
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const next = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!setter) return;
    setter.call(textarea, next);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    textarea.focus();
    textarea.setSelectionRange(start + text.length, start + text.length);
  };
  const readBrowserFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    if (list.length > 5) return showError("一次最多选择 5 个文件。");
    if (list.reduce((total, file) => total + file.size, 0) > 4 * MAX_BYTES) return showError("所选文件总大小超过 4 MB，暂不支持发送。");
    for (const file of list) {
      if (!isTextName(file.name)) return showError("暂不支持“" + file.name + "”。请选择文本、Markdown、JSON、CSV 或常见代码文件。");
      if (file.size > MAX_BYTES) return showError("“" + file.name + "”超过 1 MB，暂不支持发送。");
    }
    try {
      const contents = await Promise.all(list.map(async file => ({ name: file.name, content: await file.text() })));
      if (contents.some(file => file.content.includes("\u0000"))) return showError("所选文件中包含二进制内容，暂不支持发送。");
      insert(contents);
    }
    catch (error) { showError("读取文件失败：" + (error?.message || String(error))); }
  };
  const pick = () => {
    const input = document.querySelector("[data-dsh-text-file-input]");
    input?.click();
  };
  const install = () => {
    const card = document.querySelector("[data-composer-card]");
    const addButton = card?.querySelector("button[aria-haspopup='listbox']") || card?.querySelector("button");
    const tools = addButton?.parentElement;
    if (!card || !tools || tools.querySelector("[data-dsh-text-file-button]")) return;
    const button = document.createElement("button");
    button.type = "button"; button.dataset.dshTextFileButton = ""; button.title = "添加文本文件"; button.setAttribute("aria-label", "添加文本文件");
    button.textContent = "📎";
    button.style.cssText = "border:0;background:transparent;cursor:pointer;font-size:16px;width:28px;height:28px;border-radius:6px";
    button.addEventListener("click", pick);
    tools.insertBefore(button, tools.firstChild);
    const input = document.createElement("input");
    input.type = "file"; input.multiple = true; input.accept = ".txt,.md,.mdx,.csv,.json,.yaml,.yml,.xml,.html,.htm,.css,.js,.mjs,.cjs,.ts,.tsx,.jsx,.py,.java,.c,.h,.cpp,.cc,.cs,.go,.rs,.rb,.php,.swift,.kt,.kts,.sh,.bash,.zsh,.sql,.vue,.svelte,.toml,.ini,.conf,.env,.log,.rst,.tex";
    input.hidden = true; input.dataset.dshTextFileInput = ""; input.addEventListener("change", () => { void readBrowserFiles(input.files); input.value = ""; });
    card.appendChild(input);
  };
  const onDrop = (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    const textFiles = files.filter(file => !file.type.startsWith("image/"));
    if (!textFiles.length) return;
    event.preventDefault(); event.stopPropagation(); void readBrowserFiles(textFiles);
  };
  document.addEventListener("drop", onDrop, true);
  const observe = () => {
    if (!document.documentElement) { setTimeout(observe, 50); return; }
    new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
    install();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe, { once: true });
  else observe();
})();`;
webFrame.executeJavaScript(TEXT_FILES_WORLD).catch(() => {});

const FORUM_PLUGINS_WORLD = String.raw`(() => {
  if (window.__DSH_DESKTOP_FORUM_PLUGINS_UI__) return;
  window.__DSH_DESKTOP_FORUM_PLUGINS_UI__ = true;
  const api = window.__DSH_DESKTOP_FORUM_PLUGINS__;
  const css = "[data-dsh-forum-panel]{color:var(--dsw-alias-label-primary);padding:4px 0}[data-dsh-forum-grid]{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}[data-dsh-forum-card]{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px;min-height:120px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-fill-white)}[data-dsh-forum-card] strong{font-size:15px;line-height:22px}[data-dsh-forum-card] p{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;margin:0;flex:1;word-break:break-word}[data-dsh-forum-card] a{color:var(--dsw-alias-label-primary);font-size:12px;text-decoration:none}[data-dsh-forum-state]{color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:22px}[data-dsh-forum-error]{color:var(--dsw-alias-state-error-primary);font-size:14px;line-height:22px}[data-dsh-forum-refresh]{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 12px;cursor:pointer;margin-bottom:12px}";
  const isPluginTabList = (list) => Array.from(list.querySelectorAll("[role=tab]")).some(tab => /插件配置|plugin configuration/i.test(tab.textContent || ""));
  const validUrl = (value) => { try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "github.com" && /^\\/[^/]+\\/[^/]+\\/?$/.test(url.pathname); } catch { return false; } };
  const create = (tag, attrs = {}, text = "") => { const node = document.createElement(tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text) node.textContent = text; return node; };
  const panelFor = (tablist) => tablist.parentElement?.querySelector("[role=tabpanel]") || tablist.parentElement?.lastElementChild;
  const render = async (panel) => {
    panel.replaceChildren();
    const state = create("div", { "data-dsh-forum-state": "" }, "正在读取 GitHub 插件列表…"); panel.appendChild(state);
    try {
      if (!api?.list) throw new Error("当前版本不支持论坛插件");
      const repos = (await api.list()).filter(repo => validUrl(repo.url));
      panel.replaceChildren();
      const refresh = create("button", { type: "button", "data-dsh-forum-refresh": "" }, "刷新"); refresh.addEventListener("click", () => { void render(panel); }); panel.appendChild(refresh);
      if (!repos.length) { panel.appendChild(create("div", { "data-dsh-forum-state": "" }, "暂时没有找到插件。")); return; }
      const grid = create("div", { "data-dsh-forum-grid": "" });
      for (const repo of repos) { const card = create("div", { "data-dsh-forum-card": "" }); card.append(create("strong", {}, repo.name), create("p", {}, repo.description)); const link = create("a", { href: repo.url, target: "_blank", rel: "noreferrer" }, "打开 GitHub"); card.appendChild(link); grid.appendChild(card); }
      panel.appendChild(grid);
    } catch (error) { panel.replaceChildren(create("div", { "data-dsh-forum-error": "" }, "读取插件列表失败：" + (error?.message || String(error)))); }
  };
  const install = () => {
    const tablist = Array.from(document.querySelectorAll("[role=tablist]")).find(isPluginTabList);
    if (!tablist || tablist.querySelector("[data-dsh-forum-tab]")) return;
    const existingTabs = Array.from(tablist.querySelectorAll("[role=tab]"));
    const forumTab = create("button", { type: "button", role: "tab", "data-dsh-forum-tab": "", "aria-selected": "false" }, "论坛插件");
    const panel = create("div", { "data-dsh-forum-panel": "", role: "tabpanel", hidden: "" });
    const host = tablist.parentElement;
    if (!host) return;
    tablist.appendChild(forumTab); host.appendChild(panel);
    forumTab.addEventListener("click", () => { existingTabs.forEach(tab => tab.setAttribute("aria-selected", "false")); forumTab.setAttribute("aria-selected", "true"); const oldPanel = panelFor(tablist); if (oldPanel && oldPanel !== panel) oldPanel.hidden = true; panel.hidden = false; void render(panel); });
    existingTabs.forEach(tab => tab.addEventListener("click", () => { if (forumTab.getAttribute("aria-selected") === "true") forumTab.setAttribute("aria-selected", "false"); panel.hidden = true; }));
  };
  const start = () => {
    if (!document.documentElement) { setTimeout(start, 50); return; }
    const style = document.createElement("style"); style.textContent = css; document.head?.appendChild(style);
    new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
    install();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();`;
webFrame.executeJavaScript(FORUM_PLUGINS_WORLD).catch(() => {});
