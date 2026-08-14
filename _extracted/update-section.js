(() => {
  if (window.__DSH_DESKTOP_UPDATER_SECTION__) return;
  window.__DSH_DESKTOP_UPDATER_SECTION__ = true;
  const PLUGIN_ID = "dsh-desktop-updater";

  function ensureEntry(graph) {
    if (!graph || !Array.isArray(graph.entries)) return graph;
    if (graph.entries.some((row) => row && row.id === PLUGIN_ID)) return graph;
    graph.entries.push({
      id: PLUGIN_ID,
      url: "about:blank",
      rev: "desktop-1",
      immediately: true,
      inject: ["@deepseek-ai/dsh-client-ui-settings-general"]
    });
    return graph;
  }

  function hookBoot() {
    const current = window.__DSH_BOOT__;
    if (current) ensureEntry(current);
    try {
      let value = current;
      Object.defineProperty(window, "__DSH_BOOT__", {
        configurable: true,
        enumerable: true,
        get() { return value; },
        set(next) { value = ensureEntry(next); }
      });
    } catch {
      if (current) ensureEntry(current);
    }
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
      if (typeof document === "undefined") return;
      if (document.querySelector("style[data-plugin-css=dsh-desktop-updater]")) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = "dsh-desktop-updater";
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    function UpdateSection() {
      const updater = window.__DSH_DESKTOP_UPDATER__;
      const [busy, setBusy] = React.useState(false);
      const [status, setStatus] = React.useState("");
      const [kind, setKind] = React.useState("");
      const [current, setCurrent] = React.useState("");
      const [latest, setLatest] = React.useState("");
      const [actionLabel, setActionLabel] = React.useState("检查更新");
      async function onCheck() {
        if (!updater || busy) return;
        setBusy(true);
        setKind("");
        setStatus("正在检查最新版本…");
        try {
          const result = await updater.check();
          setCurrent(result.currentVersion);
          setLatest(result.latestVersion);
          if (!result.hasUpdate) {
            setStatus("当前已是最新版本。");
            setKind("ok");
            setActionLabel("已是最新");
            return;
          }
          setStatus("发现新版本 v" + result.latestVersion + "，正在下载安装…");
          setActionLabel("正在更新…");
          const installed = await updater.install();
          setStatus("已安装 v" + installed.version + "，应用即将重启…");
          setKind("ok");
        } catch (error) {
          setStatus("更新失败：" + (error && error.message ? error.message : String(error)));
          setKind("err");
          setActionLabel("重试");
        } finally {
          setBusy(false);
        }
      }
      return jsxs("div", {
        className: "dshDeskUpd_section",
        children: [
          jsx("h2", { className: "dshDeskUpd_title", children: "更新" }),
          jsx("p", { className: "dshDeskUpd_intro", children: "检查并安装最新的 DeepSeek Harness CLI。更新完成后应用会自动重启。" }),
          jsxs("div", {
            className: "dshDeskUpd_card",
            children: [
              jsxs("div", {
                className: "dshDeskUpd_row",
                children: [
                  jsxs("div", {
                    className: "dshDeskUpd_copy",
                    children: [
                      jsx("div", { className: "dshDeskUpd_name", children: "DeepSeek Harness CLI" }),
                      jsx("p", { className: "dshDeskUpd_meta", children: current && latest ? "当前版本 v" + current + " · 最新版本 v" + latest : "点击按钮检查 npm 上的最新版本" })
                    ]
                  }),
                  jsx("div", { className: "dshDeskUpd_actions", children: jsx(Button, { variant: "primary", size: "sm", disabled: busy || !updater, onClick: onCheck, children: actionLabel }) })
                ]
              }),
              status ? jsx("p", { className: kind === "err" ? "dshDeskUpd_error" : kind === "ok" ? "dshDeskUpd_ok" : "dshDeskUpd_meta", children: status }) : null
            ]
          })
        ]
      });
    }

    const dictionaries = { zh: { nav: "更新" }, en: { nav: "Updates" } };
    function apply(ctx) {
      injectCss();
      if (ctx.locale && typeof ctx.locale.register === "function") {
        ctx.effect(function () { return ctx.locale.register("settings.desktopUpdate", dictionaries); }, "dsh-desktop-updater: locale");
      }
      const t = ctx.locale && typeof ctx.locale.bind === "function" ? ctx.locale.bind("settings.desktopUpdate") : function () { return "更新"; };
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "update",
          order: 30,
          label: function () {
            try { return t("nav"); } catch { return "更新"; }
          }
        }, UpdateSection);
      });
    }
    return { apply, inject: ["slots", "locale"] };
  }

  function registerFactory(loader) {
    if (!loader || typeof loader.load !== "function") return;
    try { loader.load({ id: PLUGIN_ID, factory }); } catch {}
  }

  function hookLoader() {
    const current = window.__ModuleLoader__;
    if (current) registerFactory(current);
    try {
      let value = current;
      Object.defineProperty(window, "__ModuleLoader__", {
        configurable: true,
        enumerable: true,
        get() { return value; },
        set(next) { value = next; registerFactory(next); }
      });
    } catch {
      if (current) registerFactory(current);
    }
  }

  hookBoot();
  hookLoader();
})();
