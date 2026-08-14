const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__DSH_DESKTOP_UPDATER__", {
  check: () => ipcRenderer.invoke("dsh-update:check"),
  install: () => ipcRenderer.invoke("dsh-update:install")
});

(() => {
  const updater = {
    check: () => ipcRenderer.invoke("dsh-update:check"),
    install: () => ipcRenderer.invoke("dsh-update:install")
  };
  const NAV_MARK = "data-dsh-update-nav";
  const PAGE_MARK = "data-dsh-update-page";
  let activePanel = null;

  const style = document.createElement("style");
  style.textContent = [
    "[data-dsh-update-page]{box-sizing:border-box;padding:8px 4px 24px;color:var(--dsw-alias-label-primary);font-family:inherit}",
    "[data-dsh-update-page] *{box-sizing:border-box}",
    "[data-dsh-update-page] h2{margin:0 0 8px;font-size:20px;font-weight:500;line-height:28px}",
    "[data-dsh-update-page] p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}",
    "[data-dsh-update-page] .dsh-update-card{margin-top:24px;padding:18px 20px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-primary);border-radius:16px}",
    "[data-dsh-update-page] .dsh-update-row{display:flex;align-items:center;justify-content:space-between;gap:16px}",
    "[data-dsh-update-page] .dsh-update-title{font-size:14px;font-weight:500}",
    "[data-dsh-update-page] .dsh-update-version{margin-top:4px;font-size:12px;color:var(--dsw-alias-label-secondary)}",
    "[data-dsh-update-page] button{border:0;border-radius:10px;padding:8px 14px;background:var(--dsw-alias-interactive-bg-brand);color:var(--dsw-alias-label-on-brand);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}",
    "[data-dsh-update-page] button:disabled{opacity:.5;cursor:default}",
    "[data-dsh-update-page] .dsh-update-status{margin-top:14px;min-height:20px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}",
    "[data-dsh-update-page] .dsh-update-status[data-error=true]{color:var(--dsw-alias-state-error-primary)}",
    "[data-dsh-update-page] .dsh-update-status[data-success=true]{color:var(--dsw-alias-state-success-primary)}",
    "[data-dsh-update-nav]{box-sizing:border-box;cursor:pointer;height:40px;color:var(--dsw-alias-label-primary);text-align:left;background:transparent;border:0;border-radius:12px;align-items:center;gap:8px;padding:9px 16px 9px 12px;font-family:inherit;font-size:14px;font-weight:400;line-height:22px;display:flex;width:100%}",
    "[data-dsh-update-nav]:hover,[data-dsh-update-nav].active{background:var(--dsw-specific-sidebar-nav-item-active)}",
  ].join("");
  document.documentElement.appendChild(style);

  function getDialog() { return document.querySelector("[role=dialog]"); }
  function getOptions(dialog) { return dialog && dialog.querySelector("[class*=options]"); }
  function getNavList(dialog) { return dialog && dialog.querySelector("nav [class*=navList]"); }
  function setStatus(page, message, kind) {
    const status = page.querySelector(".dsh-update-status");
    status.textContent = message;
    status.dataset.error = kind === "error" ? "true" : "false";
    status.dataset.success = kind === "success" ? "true" : "false";
  }
  function showNormalSection(dialog) {
    const page = dialog && dialog.querySelector("[data-dsh-update-page]");
    const options = getOptions(dialog);
    if (page) page.remove();
    if (options) options.style.display = "";
    activePanel = null;
  }
  function makeText(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }
  function showUpdateSection(dialog) {
    if (!dialog) return;
    const options = getOptions(dialog);
    if (!options || (activePanel && activePanel.isConnected)) return;
    options.style.display = "none";
    const page = document.createElement("section");
    page.setAttribute(PAGE_MARK, "true");
    page.append(makeText("h2", "", "更新"));
    page.append(makeText("p", "", "检查并安装最新的 DeepSeek Harness CLI。更新完成后应用会自动重启。"));
    const card = document.createElement("div");
    card.className = "dsh-update-card";
    const row = document.createElement("div");
    row.className = "dsh-update-row";
    const info = document.createElement("div");
    info.append(makeText("div", "dsh-update-title", "DeepSeek Harness CLI"));
    info.append(makeText("div", "dsh-update-version", "点击按钮检查 npm 上的最新版本"));
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "检查更新";
    const status = makeText("div", "dsh-update-status", "");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    row.append(info, button);
    card.append(row, status);
    page.append(card);
    options.parentElement.append(page);
    activePanel = page;
    button.addEventListener("click", async () => {
      button.disabled = true;
      setStatus(page, "正在检查最新版本…");
      try {
        const result = await updater.check();
        page.querySelector(".dsh-update-version").textContent = "当前版本 v" + result.currentVersion + " · 最新版本 v" + result.latestVersion;
        if (!result.hasUpdate) {
          setStatus(page, "当前已是最新版本。", "success");
          button.textContent = "已是最新";
          return;
        }
        setStatus(page, "发现新版本 v" + result.latestVersion + "，正在下载安装…");
        button.textContent = "正在更新…";
        const installed = await updater.install();
        setStatus(page, "已安装 v" + installed.version + "，应用即将重启…", "success");
      } catch (error) {
        setStatus(page, "更新失败：" + (error && error.message ? error.message : String(error)), "error");
        button.disabled = false;
        button.textContent = "重试";
      }
    });
  }
  function addUpdateNav() {
    const dialog = getDialog();
    const navList = getNavList(dialog);
    if (!dialog || !navList || navList.querySelector("[" + NAV_MARK + "]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(NAV_MARK, "true");
    const original = navList.querySelector("button");
    if (original) button.className = original.className;
    button.append(makeText("span", "", "↻"), makeText("span", "", "更新"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      navList.querySelectorAll("button").forEach((item) => {
        for (const name of [...item.classList]) if (name === "active" || name.toLowerCase().includes("active")) item.classList.remove(name);
      });
      button.classList.add("active");
      showUpdateSection(dialog);
    });
    navList.append(button);
  }
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const other = target.closest("[role=dialog] nav button:not([data-dsh-update-nav])");
    if (other) showNormalSection(other.closest("[role=dialog]"));
  }, true);
  const observer = new MutationObserver(() => {
    const dialog = getDialog();
    if (dialog) addUpdateNav();
    else activePanel = null;
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addUpdateNav);
  else addUpdateNav();
})();
