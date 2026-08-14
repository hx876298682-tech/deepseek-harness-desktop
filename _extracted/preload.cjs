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

const MAIN_WORLD = "(() => {\n  if (window.__DSH_DESKTOP_UPDATER_SECTION__) return;\n  window.__DSH_DESKTOP_UPDATER_SECTION__ = true;\n  const PLUGIN_ID = \"dsh-desktop-updater\";\n\n  function ensureEntry(graph) {\n    if (!graph || !Array.isArray(graph.entries)) return graph;\n    const entry = graph.entries.find((row) => row && row.id === PLUGIN_ID);\n    if (entry) { entry.rev = \"desktop-2\"; return graph; }\n    graph.entries.push({ id: PLUGIN_ID, url: \"about:blank\", rev: \"desktop-2\", immediately: true, inject: [\"@deepseek-ai/dsh-client-ui-settings-general\"] });\n    return graph;\n  }\n\n  function hookBoot() {\n    const current = window.__DSH_BOOT__;\n    if (current) ensureEntry(current);\n    try {\n      let value = current;\n      Object.defineProperty(window, \"__DSH_BOOT__\", { configurable: true, enumerable: true, get() { return value; }, set(next) { value = ensureEntry(next); } });\n    } catch { if (current) ensureEntry(current); }\n  }\n\n  function factory(require) {\n    const React = require(\"react\");\n    const jsxRuntime = require(\"react/jsx-runtime\");\n    const primitives = require(\"@deepseek-ai/dsh-client-ui-primitives\");\n    const jsx = jsxRuntime.jsx;\n    const jsxs = jsxRuntime.jsxs;\n    const Button = primitives.Button;\n    const css = [\n      \".dshDeskUpd_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}\",\n      \".dshDeskUpd_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}\",\n      \".dshDeskUpd_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}\",\n      \".dshDeskUpd_card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:12px;padding:12px 14px;display:flex}\",\n      \".dshDeskUpd_row{align-items:center;gap:10px;display:flex}\",\n      \".dshDeskUpd_copy{min-width:0;flex:1}\",\n      \".dshDeskUpd_name{color:var(--dsw-alias-label-pr... (line truncated to 2000 chars)
webFrame.executeJavaScript(MAIN_WORLD).catch(() => {});
