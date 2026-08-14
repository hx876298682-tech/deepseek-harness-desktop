// main.js — DeepSeek Harness Desktop (Electron shell).
// Runs the installed dsh CLI and provides an in-app updater.

import { app, BrowserWindow, Menu, dialog, shell, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { appendFileSync, createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { resolveDsh } from "./resolve-dsh.js";
import { compareVersions, parseVersion, pickDesktopAsset } from "./update-utils.js";

const SMOKE_TEST = process.argv.includes("--smoke-test");
const SMOKE_TIMEOUT_MS = 120000;
const UPDATE_PACKAGE = "@deepseek-ai/dsh";
const DESKTOP_REPOSITORY = "hx876298682-tech/deepseek-harness-desktop";
const DESKTOP_RELEASES_API = "https://api.github.com/repos/" + DESKTOP_REPOSITORY + "/releases/latest";
const DESKTOP_RELEASES_LIST_API = "https://api.github.com/repos/" + DESKTOP_REPOSITORY + "/releases?per_page=5";
const DESKTOP_RELEASE_CACHE_TTL_MS = 10 * 60 * 1000;

let win = null;
let child = null;
let childGroupPid = null;
let currentUrl = null;
let dshInfo = null;
let quitting = false;
let logPath = null;
let updateInFlight = false;
let desktopUpdateInFlight = false;
let desktopReleaseCache = null;

function log(msg) {
  const line = "[" + new Date().toISOString() + "] " + msg;
  console.log(line);
  if (logPath) {
    try { appendFileSync(logPath, line + String.fromCharCode(10)); } catch { /* ignore */ }
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(run);
}

async function run() {
  if (process.env.DSH_DESKTOP_USER_DATA) app.setPath("userData", process.env.DSH_DESKTOP_USER_DATA);
  const managedBin = join(app.getPath("userData"), "dsh", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  if (existsSync(managedBin)) process.env.DSH_BIN = managedBin;
  logPath = join(app.getPath("userData"), "dsh-desktop.log");
  try { appendFileSync(logPath, "--- launch ---" + String.fromCharCode(10)); } catch { /* ignore */ }
  const timer = SMOKE_TEST ? setTimeout(() => { log("SMOKE_TIMEOUT"); shutdown(1); }, SMOKE_TIMEOUT_MS) : null;
  createWindow();

  dshInfo = resolveDsh();
  if (!dshInfo.ok) {
    log("resolve failed: " + dshInfo.error);
    failAndQuit(dshInfo.error || "Could not locate the dsh CLI.");
    return;
  }
  log("dsh resolved via " + dshInfo.via + " at " + (dshInfo.binJs || "npx") + " (v" + (dshInfo.version || "?") + ")");

  const url = await bootServer(dshInfo);
  if (!url) return;
  currentUrl = url;
  log("server up: " + url);
  if (win && !win.isDestroyed()) {
    win.setTitle("DeepSeek Harness — dsh v" + (dshInfo.version || "?"));
    win.loadURL(url).catch((e) => { log("loadURL error: " + e.message); });
    if (SMOKE_TEST) {
      win.webContents.once("did-finish-load", () => {
        log("SMOKE_OK " + url + " v" + (dshInfo.version || "?"));
        if (timer) clearTimeout(timer);
        setTimeout(() => shutdown(0), 800);
      });
    }
  } else if (SMOKE_TEST) {
    log("SMOKE_OK " + url + " v" + (dshInfo.version || "?"));
    if (timer) clearTimeout(timer);
    setTimeout(() => shutdown(0), 500);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: "DeepSeek Harness",
    backgroundColor: "#0d0d0f",
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(dirname(fileURLToPath(import.meta.url)), "preload.cjs")
    }
  });
  const loading = "<!doctype html><html><body style=\"margin:0;background:#0d0d0f;color:#9aa0ab;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh\"><div style=\"text-align:center\"><div style=\"font-size:15px\">Starting DeepSeek Harness…</div><div style=\"margin-top:10px;font-size:12px;opacity:.6\">booting dsh web server</div></div></body></html>";
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(loading)).catch(() => {});
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("closed", () => { win = null; });
  Menu.setApplicationMenu(buildMenu());
}

function bootServer(info) {
  return new Promise((resolvePromise) => {
    const cmd = info.npxFallback ? (info.npmPath || "npx") : info.nodePath;
    const args = info.npxFallback ? ["--yes", UPDATE_PACKAGE, "web", "--port", "0"] : [info.binJs, "web", "--port", "0"];
    log("spawning: " + cmd + " " + args.join(" "));
    try {
      child = spawn(cmd, args, { detached: true, cwd: process.env.DSH_DESKTOP_SERVER_CWD || homedir(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      log("spawn error: " + e.message);
      failAndQuit("Failed to start the dsh web server: " + e.message);
      resolvePromise(null);
      return;
    }
    childGroupPid = child.pid;
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 65536) buffer = buffer.slice(-16384);
      const match = buffer.match(/(https?:\/\/[^\s"'<>]+)/);
      if (match && !currentUrl) { currentUrl = match[1]; resolvePromise(currentUrl); }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (e) => { log("child error: " + e.message); failAndQuit("Failed to start the dsh web server: " + e.message); resolvePromise(null); });
    child.on("exit", (code, signal) => {
      log("dsh exited code=" + code + " signal=" + signal + " quitting=" + quitting);
      if (!quitting && !SMOKE_TEST) failAndQuit("The dsh web server exited unexpectedly.");
      resolvePromise(null);
    });
    setTimeout(() => {
      if (!currentUrl && !quitting) { failAndQuit("The dsh web server did not report a URL within 90s. Check the log."); resolvePromise(null); }
    }, 90000);
  });
}

function findNpm(info = dshInfo) {
  if (process.env.DSH_DESKTOP_NPM && existsSync(process.env.DSH_DESKTOP_NPM)) return process.env.DSH_DESKTOP_NPM;
  if (info && info.npmPath && existsSync(info.npmPath)) return info.npmPath;
  if (info && info.nodePath) {
    const sibling = join(dirname(info.nodePath), process.platform === "win32" ? "npm.cmd" : "npm");
    if (existsSync(sibling)) return sibling;
  }
  for (const dir of (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":")) {
    const candidate = join(dir, process.platform === "win32" ? "npm.cmd" : "npm");
    if (existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command, args, timeoutMs = 120000) {
  return new Promise((resolvePromise, reject) => {
    const commandChild = spawn(command, args, {
      cwd: process.env.DSH_DESKTOP_SERVER_CWD || homedir(),
      env: { ...process.env, PATH: [dirname(command), "/usr/local/bin", "/opt/homebrew/bin", process.env.PATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":"), NO_UPDATE_NOTIFIER: "1", NPM_CONFIG_UPDATE_NOTIFIER: "false" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { commandChild.kill("SIGTERM"); reject(new Error(command + " timed out after " + timeoutMs + "ms")); }, timeoutMs);
    commandChild.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    commandChild.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    commandChild.once("error", (error) => { clearTimeout(timer); reject(error); });
    commandChild.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(command + " exited with " + (code ?? signal) + ": " + (stderr.trim() || stdout.trim())));
    });
  });
}

async function checkDshUpdate() {
  const current = resolveDsh();
  if (!current.ok || !current.version) throw new Error(current.error || "无法找到本机 dsh CLI");
  const result = await runCommand(findNpm(current), ["view", UPDATE_PACKAGE, "version", "--json"], 30000);
  let latest = null;
  try { latest = parseVersion(JSON.parse(result.stdout)); } catch { latest = parseVersion(result.stdout); }
  if (!latest) throw new Error("npm 返回的 dsh 版本号无效");
  return { currentVersion: parseVersion(current.version) || current.version, latestVersion: latest, hasUpdate: compareVersions(latest, current.version) > 0, via: current.via };
}

async function fetchGitHubJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "deepseek-harness-desktop"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error("GitHub 请求失败 (" + response.status + "): " + text.slice(0, 240));
    error.status = response.status;
    throw error;
  }
  try { return JSON.parse(text); } catch { throw new Error("GitHub 返回了无效的 JSON"); }
}

async function checkDesktopUpdate() {
  const currentVersion = parseVersion(app.getVersion()) || app.getVersion();
  const releasesUrl = "https://github.com/" + DESKTOP_REPOSITORY + "/releases";
  if (desktopReleaseCache && desktopReleaseCache.expiresAt > Date.now()) return desktopReleaseCache.result;
  let release;
  try {
    release = await fetchGitHubJson(DESKTOP_RELEASES_API);
  } catch (error) {
    if (error.status !== 404) throw error;
    const releases = await fetchGitHubJson(DESKTOP_RELEASES_LIST_API);
    release = Array.isArray(releases) ? releases.find((item) => !item?.draft && !item?.prerelease) : null;
  }
  if (!release) {
    const result = { currentVersion, latestVersion: null, hasUpdate: false, available: false, releaseUrl: releasesUrl, message: "还没有发布桌面应用版本" };
    desktopReleaseCache = { expiresAt: Date.now() + DESKTOP_RELEASE_CACHE_TTL_MS, release: null, result };
    return result;
  }
  const latestVersion = parseVersion(release.tag_name || release.name);
  if (!latestVersion) throw new Error("GitHub Release 没有有效的版本号");
  const asset = pickDesktopAsset(release.assets, { platform: process.platform, arch: process.arch });
  const result = {
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    available: Boolean(asset),
    assetName: asset?.name || null,
    releaseUrl: release.html_url || releasesUrl,
    runningFromMountedImage: process.execPath.includes("/Volumes/"),
    message: asset ? "发现适用于当前平台的安装包" : "有新版本，但没有适用于当前平台的安装包"
  };
  desktopReleaseCache = { expiresAt: Date.now() + DESKTOP_RELEASE_CACHE_TTL_MS, release, result };
  return result;
}

async function installDesktopUpdate() {
  if (desktopUpdateInFlight) throw new Error("桌面应用更新正在进行中");
  desktopUpdateInFlight = true;
  try {
    const update = await checkDesktopUpdate();
    if (!update.hasUpdate) throw new Error(update.latestVersion ? "当前桌面应用已经是最新版本" : "没有可用的桌面应用更新");
    if (!update.available) throw new Error(update.message || "没有适用于当前平台的安装包");
    if (update.runningFromMountedImage) throw new Error("当前应用正在从 DMG 挂载盘运行，请先将它拖入 Applications 文件夹");
    const release = desktopReleaseCache?.release;
    const asset = pickDesktopAsset(release?.assets, { platform: process.platform, arch: process.arch });
    if (!asset?.browser_download_url) throw new Error("桌面应用安装包下载地址不可用");
    const response = await fetch(asset.browser_download_url, {
      headers: { Accept: "application/octet-stream", "User-Agent": "deepseek-harness-desktop" }
    });
    if (!response.ok || !response.body) throw new Error("下载安装包失败 (" + response.status + ")");
    const updateDir = join(app.getPath("temp"), "deepseek-harness-desktop-updates");
    await mkdir(updateDir, { recursive: true });
    const filename = update.latestVersion + "-" + String(asset.name).replace(/[^a-zA-Z0-9._-]/g, "_");
    const assetPath = join(updateDir, filename);
    const total = Number(asset.size || response.headers.get("content-length") || 0);
    let received = 0;
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.on("data", (chunk) => {
      received += chunk.length;
      win?.webContents.send("dsh-desktop-update:progress", { received, total, percent: total ? received / total : null });
    });
    await pipeline(nodeStream, createWriteStream(assetPath));
    if (asset.size && received !== asset.size) throw new Error("下载安装包不完整");
    const openError = await shell.openPath(assetPath);
    if (openError) throw new Error("安装包已下载，但无法打开：" + openError);
    return {
      version: update.latestVersion,
      assetName: asset.name,
      assetPath,
      releaseUrl: update.releaseUrl,
      requiresManualInstall: true,
      message: process.platform === "darwin" ? "安装包已打开，请将应用拖入 Applications 文件夹后完全退出并重新启动；未签名应用可能需要右键打开" : "安装包已打开，请完成安装后完全退出并重新启动应用"
    };
  } finally {
    desktopUpdateInFlight = false;
  }
}

async function installDshUpdate() {
  const installRoot = join(app.getPath("userData"), "dsh");
  const result = await runCommand(findNpm(), ["install", "--prefix", installRoot, "--no-fund", "--no-audit", UPDATE_PACKAGE + "@latest"], 300000);
  const managedBin = join(installRoot, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  if (!existsSync(managedBin)) throw new Error("安装完成后找不到新的 dsh CLI");
  process.env.DSH_BIN = managedBin;
  const installed = resolveDsh();
  if (!installed.ok || !installed.version) throw new Error("安装完成后无法解析新的 dsh 版本");
  log("dsh updated to " + installed.version);
  return { version: installed.version, output: result.stdout.slice(-2000) };
}

ipcMain.handle("dsh-update:check", async () => checkDshUpdate());
ipcMain.handle("dsh-desktop-update:check", async () => checkDesktopUpdate());
ipcMain.handle("dsh-desktop-update:install", async () => installDesktopUpdate());
ipcMain.handle("dsh-desktop-update:open", async (_event, value) => {
  const url = new URL(String(value || ""));
  const allowedPath = "/" + DESKTOP_REPOSITORY;
  if (url.protocol !== "https:" || url.hostname !== "github.com" || (url.pathname !== allowedPath && !url.pathname.startsWith(allowedPath + "/"))) throw new Error("只允许打开本项目的 GitHub Releases 页面");
  return shell.openExternal(url.toString());
});
ipcMain.handle("dsh-update:install", async () => {
  if (updateInFlight) throw new Error("更新正在进行中");
  updateInFlight = true;
  try {
    const result = await installDshUpdate();
    setTimeout(() => { if (!quitting) { app.relaunch(); shutdown(0); } }, 1200);
    return { ...result, restarting: true };
  } finally { updateInFlight = false; }
});

function failAndQuit(message) {
  log("fatal: " + message);
  if (!SMOKE_TEST && win && !win.isDestroyed()) dialog.showErrorBox("DeepSeek Harness Desktop", message);
  shutdown(1);
}

function buildMenu() {
  return Menu.buildFromTemplate([{ label: "DeepSeek Harness", submenu: [{ label: "About DeepSeek Harness Desktop", click: () => dialog.showMessageBox(win, { type: "info", title: "About", message: "DeepSeek Harness Desktop", detail: "dsh v" + (dshInfo?.version || "?") + "\nDesktop shell v" + app.getVersion(), buttons: ["OK"] }) }, { type: "separator" }, { label: "Check dsh version", click: async () => { try { const r = await checkDshUpdate(); await dialog.showMessageBox(win, { type: "info", title: "dsh version", message: "当前版本 v" + r.currentVersion, detail: "最新版本 v" + r.latestVersion, buttons: ["OK"] }); } catch (e) { dialog.showErrorBox("dsh version", e.message); } } }, { type: "separator" }, { role: "quit" }] }, { label: "View", submenu: [{ label: "Reload", accelerator: "CmdOrCtrl+R", click: () => win?.webContents.reload() }, { label: "Force Reload", accelerator: "CmdOrCtrl+Shift+R", click: () => win?.webContents.reloadIgnoringCache() }, { label: "Toggle Developer Tools", accelerator: "Alt+CmdOrCtrl+I", click: () => win?.webContents.toggleDevTools() }, { type: "separator" }, { label: "Open in Browser", click: () => { if (currentUrl) shell.openExternal(currentUrl); } }] }, { label: "Help", submenu: [{ label: "How to update dsh", click: () => dialog.showMessageBox(win, { type: "info", title: "Updating dsh", message: "请在设置页面点击更新按钮。", buttons: ["OK"] }) }, { label: "Open log file", click: () => { if (logPath) shell.openPath(logPath); } }] }]);
}

function killServer() {
  if (childGroupPid) {
    try { process.kill(-childGroupPid, "SIGTERM"); } catch { /* gone */ }
    const timer = setTimeout(() => { try { process.kill(-childGroupPid, "SIGKILL"); } catch { /* gone */ } }, 3000);
    timer.unref();
    childGroupPid = null;
  } else if (child) { try { child.kill("SIGTERM"); } catch { /* gone */ } }
  child = null;
}

function shutdown(exitCode) {
  if (quitting) return;
  quitting = true;
  killServer();
  setTimeout(() => app.exit(exitCode), 150);
}

app.on("window-all-closed", () => { if (!SMOKE_TEST) shutdown(0); });
app.on("before-quit", () => { if (!quitting) { quitting = true; killServer(); } });
