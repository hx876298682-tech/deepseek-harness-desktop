(() => {
  if (window.__DSH_DESKTOP_UPDATER_SECTION__) return;
  window.__DSH_DESKTOP_UPDATER_SECTION__ = true;
  const PLUGIN_ID = "dsh-desktop-updater";

  function ensureEntry(graph) {
    if (!graph || !Array.isArray(graph.entries)) return graph;
    const entry = graph.entries.find((row) => row && row.id === PLUGIN_ID);
    if (entry) { entry.rev = "desktop-2"; return graph; }
    graph.entries.push({ id: PLUGIN_ID, url: "about:blank", rev: "desktop-2", immediately: true, inject: ["@deepseek-ai/dsh-client-ui-settings-general"] });
    return graph;
  }

  function hookBoot() {
    const current = window.__DSH_BOOT__;
    if (current) ensureEntry(current);
    try {
      let value = current;
      Object.defineProperty(window, "__DSH_BOOT__", { configurable: true, enumerable: true, get() { return value; }, set(next) { value = ensureEntry(next); } });
    } catch { if (current) ensureEntry(current); }
  }

  function factory(require) {
    const React = require("react");
    const jsxRuntime = require("react/jsx-runtime");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const jsx = jsxRuntime.jsx;
    const jsxs = jsxRuntime.jsxs;
    const Button = primitives.Button;
    const css = [
      ".dshDeskUpd_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}",
      ".dshDeskUpd_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}",
      ".dshDeskUpd_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}",
      ".dshDeskUpd_card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:12px;padding:12px 14px;display:flex}",
      ".dshDeskUpd_row{align-items:center;gap:10px;display:flex}",
      ".dshDeskUpd_copy{min-width:0;flex:1}",
      ".dshDeskUpd_name{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}",
      ".dshDeskUpd_meta{color:var(--dsw-alias-label-tertiary);margin:4px 0 0;font-size:12px;line-height:18px}",
      ".dshDeskUpd_actions{align-items:center;gap:4px;margin-left:auto;display:inline-flex}",
      ".dshDeskUpd_ok{color:var(--dsw-alias-state-success-primary);margin:0;font-size:12px;line-height:18px}",
      ".dshDeskUpd_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}"
    ].join("");

    function injectCss() {
      if (typeof document === "undefined" || document.querySelector("style[data-plugin-css=dsh-desktop-updater]")) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = PLUGIN_ID; tag.dataset.pluginCss = "dsh-desktop-updater"; tag.textContent = css; document.head.appendChild(tag);
    }

    function UpdateCard({ updater, desktop, title, idleMessage }) {
      const [phase, setPhase] = React.useState("idle");
      const [current, setCurrent] = React.useState("");
      const [latest, setLatest] = React.useState("");
      const [status, setStatus] = React.useState("");
      const [kind, setKind] = React.useState("");
      const [releaseUrl, setReleaseUrl] = React.useState("");
      const [progress, setProgress] = React.useState(null);
      React.useEffect(() => {
        if (!desktop || !updater || typeof updater.onDesktopProgress !== "function") return undefined;
        return updater.onDesktopProgress((payload) => setProgress(payload));
      }, [desktop, updater]);
      const show = (message, nextKind = "") => { setStatus(message); setKind(nextKind); };
      const check = async () => {
        if (!updater || phase === "checking" || phase === "downloading") return;
        setPhase("checking"); setProgress(null); show("正在检查最新版本…");
        try {
          const result = await (desktop ? updater.checkDesktop() : updater.check());
          setCurrent(result.currentVersion || ""); setLatest(result.latestVersion || ""); setReleaseUrl(result.releaseUrl || "");
          if (!result.latestVersion) { setPhase("idle"); show(result.message || "还没有发布桌面应用版本", desktop ? "" : "ok"); return; }
          if (!result.hasUpdate) { setPhase("current"); show("当前已是最新版本。", "ok"); return; }
          if (desktop && result.runningFromMountedImage) { setPhase("blocked"); show("当前应用从 DMG 挂载盘运行，请先拖入 Applications 文件夹。", "err"); return; }
          if (desktop && !result.available) { setPhase("no-asset"); show(result.message || "有新版本，但没有当前平台安装包。", "err"); return; }
          if (desktop && result.canAutoUpdate === false) { setPhase("blocked"); show("当前安装位置不支持自动更新，请打开发布页手动安装。", "err"); return; }
           if (desktop) { setPhase("ready"); show("发现 v" + result.latestVersion + "，点击“自动更新并重启”继续。", "ok"); return; }
          setPhase("downloading"); show("发现新版本，正在下载安装…");
          const installed = await updater.install(); setPhase("installed"); show("已安装 v" + installed.version + "，应用即将重启…", "ok");
        } catch (error) { setPhase("error"); show("更新失败：" + (error?.message || String(error)), "err"); }
      };
      const install = async () => {
        if (!desktop || phase !== "ready") return;
        setPhase("downloading"); setProgress(null); show("正在下载安装包…");
        try { const installed = await updater.installDesktop(); setPhase("installed"); show(installed.message || "下载完成，应用即将自动更新并重启。", "ok"); }
        catch (error) { setPhase("error"); show("更新失败：" + (error?.message || String(error)), "err"); }
      };
      const label = phase === "checking" ? "检查中…" : phase === "downloading" ? "下载中…" : phase === "ready" ? "自动更新" : phase === "current" ? "重新检查" : phase === "installed" ? "重新检查" : phase === "error" ? "重试" : "检查更新";
      const busy = phase === "checking" || phase === "downloading";
      const progressText = progress?.total && progress.percent !== null ? " " + Math.round(progress.percent * 100) + "%" : "";
      const statusClass = kind === "err" ? "dshDeskUpd_error" : kind === "ok" ? "dshDeskUpd_ok" : "dshDeskUpd_meta";
      const openRelease = () => { if (releaseUrl && updater.openExternal) updater.openExternal(releaseUrl).catch(() => {}); };
      return jsxs("div", { className: "dshDeskUpd_card", children: [
        jsxs("div", { className: "dshDeskUpd_row", children: [
          jsxs("div", { className: "dshDeskUpd_copy", children: [jsx("div", { className: "dshDeskUpd_name", children: title }), jsx("p", { className: "dshDeskUpd_meta", children: current ? (latest ? "当前版本 v" + current + " · 最新版本 v" + latest : "当前版本 v" + current) : idleMessage })] }),
          jsxs("div", { className: "dshDeskUpd_actions", children: [jsx(Button, { variant: "primary", size: "sm", disabled: busy || !updater, onClick: phase === "ready" ? install : check, children: label + (phase === "downloading" ? progressText : "") }), desktop && releaseUrl && (phase === "no-asset" || phase === "blocked" || !latest) ? jsx(Button, { variant: "secondary", size: "sm", onClick: openRelease, children: "打开发布页" }) : null] })
        ] }),
        status ? jsx("p", { className: statusClass, children: status }) : null
      ] });
    }

    function UpdateSection() {
      const updater = window.__DSH_DESKTOP_UPDATER__;
      return jsxs("div", { className: "dshDeskUpd_section", children: [
        jsx("h2", { className: "dshDeskUpd_title", children: "更新" }),
        jsx("p", { className: "dshDeskUpd_intro", children: "分别检查 CLI 与桌面应用。桌面应用会自动下载、替换并重启；从 DMG 直接运行时需要先复制到 Applications。" }),
        jsx(UpdateCard, { updater, desktop: false, title: "DeepSeek Harness CLI", idleMessage: "从 npm 检查 CLI 最新版本" }),
        jsx(UpdateCard, { updater, desktop: true, title: "DeepSeek Harness Desktop", idleMessage: "从 GitHub Releases 检查当前平台安装包" })
      ] });
    }

    const dictionaries = { zh: { nav: "更新" }, en: { nav: "Updates" } };
    function apply(ctx) {
      injectCss();
      if (ctx.locale && typeof ctx.locale.register === "function") ctx.effect(() => ctx.locale.register("settings.desktopUpdate", dictionaries), "dsh-desktop-updater: locale");
      const t = ctx.locale && typeof ctx.locale.bind === "function" ? ctx.locale.bind("settings.desktopUpdate") : () => "更新";
      ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "update", order: 30, label: () => { try { return t("nav"); } catch { return "更新"; } } }, UpdateSection));
    }
    return { apply, inject: ["slots", "locale"] };
  }

  function registerFactory(loader) { if (loader && typeof loader.load === "function") { try { loader.load({ id: PLUGIN_ID, factory }); } catch {} } }
  function hookLoader() {
    const current = window.__ModuleLoader__; if (current) registerFactory(current);
    try { let value = current; Object.defineProperty(window, "__ModuleLoader__", { configurable: true, enumerable: true, get() { return value; }, set(next) { value = next; registerFactory(next); } }); } catch { if (current) registerFactory(current); }
  }
  hookBoot(); hookLoader();
})();
