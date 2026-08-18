// main.js — DeepSeek Harness Desktop (Electron shell).
// Runs the installed dsh CLI and provides an in-app updater.

import { app, BrowserWindow, Menu, dialog, shell, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { accessSync, appendFileSync, constants, createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { candidateBinDirs, findInDirs, findNode, resolveDsh } from "./resolve-dsh.js";
import { compareVersions, parseVersion, pickDesktopAsset } from "./update-utils.js";
import { detectNodeVersion, ensureNodeRuntime, isSupportedNodeVersion, runtimePathEnv } from "./runtime.js";
import { ensureDefaultImageInputSettings, watchDefaultImageInputSettings } from "./image-input-defaults.js";
import { DSH_PLUGIN_TOPIC_API, normalizeForumPlugins } from "./forum-plugin-utils.js";
import { bundledPluginVersion, installUsageStatsPlugin, usageStatsPluginStatus } from "./usage-stats-plugin.js";
import { downloadFilename, installedTarget, updateCommand } from "./desktop-update-helper.js";
import { fallbackAsset, isGitHubRateLimit, latestTagFromLocation } from "./github-release-fallback.js";

const SMOKE_TEST = process.argv.includes("--smoke-test");
const SMOKE_TIMEOUT_MS = 120000;
const UPDATE_PACKAGE = "@deepseek-ai/dsh";
const DESKTOP_REPOSITORY = "hx876298682-tech/deepseek-harness-desktop";
const DESKTOP_RELEASES_API = "https://api.github.com/repos/" + DESKTOP_REPOSITORY + "/releases/latest";
const DESKTOP_RELEASES_LIST_API = "https://api.github.com/repos/" + DESKTOP_REPOSITORY + "/releases?per_page=5";
const DESKTOP_RELEASE_CACHE_TTL_MS = 10 * 60 * 1000;
const DSH_WEB_DEFAULT_PORT = 3080; // dsh web 默认监听端口（@deepseek-ai/dsh-web-app）
const DSH_WEB_PROBE_TIMEOUT_MS = 2000;

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
let stopImageSettingsWatch = null;

function log(msg) {
  const line = "[" + new Date().toISOString() + "] " + msg;
  console.log(line);
  if (logPath) {
    try { appendFileSync(logPath, line + String.fromCharCode(10)); } catch { /* ignore */ }
  }
}

ipcMain.handle("dsh-forum-plugins:list", async () => {
  const response = await fetch(DSH_PLUGIN_TOPIC_API, { headers: { Accept: "application/vnd.github+json", "User-Agent": "deepseek-harness-desktop" } });
  if (!response.ok) throw new Error(`GitHub 返回了错误：${response.status}`);
  return normalizeForumPlugins(await response.json());
});

ipcMain.handle("dsh-usage-stats:status", async () => usageStatsPluginStatus());

ipcMain.handle("dsh-usage-stats:install", async () => {
  const result = await installUsageStatsPlugin({ log });
  log("usage-stats plugin updated to v" + result.version);
  return result;
});

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
  logPath = join(app.getPath("userData"), "dsh-desktop.log");
  try { appendFileSync(logPath, "--- launch ---" + String.fromCharCode(10)); } catch { /* ignore */ }
  const timer = SMOKE_TEST ? setTimeout(() => { log("SMOKE_TIMEOUT"); shutdown(1); }, SMOKE_TIMEOUT_MS) : null;
  createWindow();

  // 安装/同步随应用打包的 dsh-usage-stats 插件（幂等，失败不阻塞启动）
  try {
    const status = await usageStatsPluginStatus();
    const bundled = await bundledPluginVersion();
    if (status.installed && status.enabled && status.version === bundled) {
      log("dsh-usage-stats v" + status.version + " 已安装并启用");
    } else {
      const result = await installUsageStatsPlugin({ log });
      log("dsh-usage-stats v" + result.version + " 已安装到 " + result.target);
    }
  } catch (error) {
    log("usage-stats plugin setup failed: " + error.message);
  }

  // 若 dsh web 已在运行（默认端口 3080），直接进入，不再拉起新进程
  const runningUrl = await probeExistingDshWeb();
  if (runningUrl) {
    log("dsh web 已在运行，直接进入: " + runningUrl);
    enterUrl(runningUrl, timer);
    return;
  }

  try {
    ensureDefaultImageInputSettings({ log });
    stopImageSettingsWatch = watchDefaultImageInputSettings({ log });
    const managedRoot = join(app.getPath("userData"), "dsh");
    const runtime = await ensureRuntime();
    process.env.DSH_DESKTOP_NODE = runtime.nodePath;
    process.env.DSH_DESKTOP_NPM = runtime.npmPath;
    process.env.PATH = runtimePathEnv(runtime);
    const managedBin = join(managedRoot, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    if (existsSync(managedBin)) process.env.DSH_BIN = managedBin;
    else {
      const existing = resolveDsh();
      if (!existing.ok || existing.npxFallback) await installManagedDsh(managedRoot, runtime.npmPath);
    }
  } catch (error) {
    log("runtime setup failed: " + error.message);
    failAndQuit("首次启动准备失败：" + error.message);
    return;
  }

  dshInfo = resolveDsh();
  if (!dshInfo.ok) {
    log("resolve failed: " + dshInfo.error);
    failAndQuit(dshInfo.error || "Could not locate the dsh CLI.");
    return;
  }
  log("dsh resolved via " + dshInfo.via + " at " + (dshInfo.binJs || "npx") + " (v" + (dshInfo.version || "?") + ")");

  const url = await bootServer(dshInfo);
  if (!url) return;
  enterUrl(url, timer);
}

/** 探测默认端口上是否已有 dsh web 在运行（首页 HTML 含 “DeepSeek Harness” 标记）。 */
async function probeExistingDshWeb() {
  try {
    const response = await fetch("http://127.0.0.1:" + DSH_WEB_DEFAULT_PORT + "/", {
      signal: AbortSignal.timeout(DSH_WEB_PROBE_TIMEOUT_MS),
      headers: { Accept: "text/html" }
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (!html.includes("DeepSeek Harness")) return null;
    return "http://127.0.0.1:" + DSH_WEB_DEFAULT_PORT;
  } catch {
    return null;
  }
}

/** 把窗口指向已就绪的 dsh web 地址（复用的已有实例或刚拉起的实例）。 */
function enterUrl(url, timer) {
  currentUrl = url;
  log("server up: " + url);
  if (win && !win.isDestroyed()) {
    win.setTitle("DeepSeek Harness — " + (dshInfo?.version ? "dsh v" + dshInfo.version : "dsh web 已在运行"));
    win.loadURL(url).catch((e) => { log("loadURL error: " + e.message); });
    if (SMOKE_TEST) {
      win.webContents.once("did-finish-load", () => {
        log("SMOKE_OK " + url + " v" + (dshInfo?.version || "?"));
        if (timer) clearTimeout(timer);
        setTimeout(() => shutdown(0), 800);
      });
    }
  } else if (SMOKE_TEST) {
    log("SMOKE_OK " + url + " v" + (dshInfo?.version || "?"));
    if (timer) clearTimeout(timer);
    setTimeout(() => shutdown(0), 500);
  }
}

async function ensureRuntime() {
  const configuredNode = process.env.DSH_DESKTOP_NODE;
  const systemNode = configuredNode || findNode();
  const systemVersion = detectNodeVersion(systemNode);
  if (systemNode && isSupportedNodeVersion(systemVersion)) {
    const npmPath = process.env.DSH_DESKTOP_NPM || findInDirs(candidateBinDirs(), "npm") || findInDirs([dirname(systemNode)], "npm");
    if (npmPath && existsSync(npmPath)) return { nodePath: systemNode, npmPath, managed: false, version: systemVersion };
  }
  return ensureNodeRuntime(app.getPath("userData"), log);
}

async function installManagedDsh(installRoot, npmPath) {
  if (!npmPath || !existsSync(npmPath)) throw new Error("托管 Node.js 的 npm 不可用");
  log("未找到官方 dsh，正在自动安装 @deepseek-ai/dsh");
  await runCommand(npmPath, ["install", "--prefix", installRoot, "--no-fund", "--no-audit", UPDATE_PACKAGE + "@latest"], 300000);
  const managedBin = join(installRoot, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  if (!existsSync(managedBin)) throw new Error("dsh 安装完成但找不到 CLI 入口");
  process.env.DSH_BIN = managedBin;
  log("@deepseek-ai/dsh 已自动安装");
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
  const loading = "<!doctype html><html><body style=\"margin:0;background:#0d0d0f;color:#9aa0ab;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh\"><div style=\"text-align:center\"><div style=\"font-size:15px\">Starting DeepSeek Harness…</div><div style=\"margin-top:10px;font-size:12px;opacity:.6\">checking dsh web server and preparing runtime</div></div></body></html>";
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(loading)).catch(() => {});
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  // The Harness composer owns the DOM paste event and calls preventDefault()
  // to normalize pasted text. Forward system edit shortcuts directly to
  // Chromium so Cmd/Ctrl+C/V still reach the focused textarea/contenteditable.
  win.webContents.on("before-input-event", (event, input) => {
    if ((!input.meta && !input.control) || input.alt) return;
    const command = input.key?.toLowerCase();
    const commands = { c: "copy", x: "cut", v: "paste", a: "selectAll" };
    const method = commands[command];
    if (!method || !win || win.isDestroyed()) return;
    event.preventDefault();
    win.webContents[method]();
  });
  win.on("closed", () => { win = null; });
  Menu.setApplicationMenu(buildMenu());
}

function bootServer(info) {
  return spawnDshWeb(info, DSH_WEB_DEFAULT_PORT);
}

/** 拉起一个 dsh web 进程；固定端口被占用时回退到随机端口（--port 0）再试一次。 */
function spawnDshWeb(info, port, allowRandomFallback = true) {
  return new Promise((resolvePromise) => {
    const cmd = info.npxFallback ? (info.npmPath || "npx") : info.nodePath;
    const args = info.npxFallback ? ["--yes", UPDATE_PACKAGE, "web", "--port", String(port)] : [info.binJs, "web", "--port", String(port)];
    log("spawning: " + cmd + " " + args.join(" "));
    let settled = false;
    let fallbackStarted = false;
    let watchdog = null;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      resolvePromise(value);
    };
    watchdog = setTimeout(() => {
      if (!currentUrl && !quitting) {
        failAndQuit("The dsh web server did not report a URL within 90s. Check the log.");
        settle(null);
      }
    }, 90000);
    try {
      child = spawn(cmd, args, { detached: true, cwd: process.env.DSH_DESKTOP_SERVER_CWD || homedir(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      log("spawn error: " + e.message);
      failAndQuit("Failed to start the dsh web server: " + e.message);
      settle(null);
      return;
    }
    childGroupPid = child.pid;
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 65536) buffer = buffer.slice(-16384);
      const match = buffer.match(/(https?:\/\/[^\s"'<>]+)/);
      if (match && !currentUrl) { currentUrl = match[1]; settle(currentUrl); }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (e) => { log("child error: " + e.message); failAndQuit("Failed to start the dsh web server: " + e.message); settle(null); });
    child.on("exit", (code, signal) => {
      log("dsh exited code=" + code + " signal=" + signal + " quitting=" + quitting);
      if (quitting || currentUrl) { settle(null); return; }
      if (allowRandomFallback && port !== 0 && !fallbackStarted) {
        fallbackStarted = true;
        log("端口 " + port + " 启动失败，回退到随机端口重新拉起");
        settle(spawnDshWeb(info, 0, false));
        return;
      }
      if (!SMOKE_TEST) failAndQuit("The dsh web server exited unexpectedly.");
      settle(null);
    });
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
      shell: process.platform === "win32",
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

async function fetchLatestReleaseFallback() {
  const response = await fetch("https://github.com/" + DESKTOP_REPOSITORY + "/releases/latest", {
    redirect: "manual",
    headers: { "User-Agent": "deepseek-harness-desktop" }
  });
  const location = response.headers.get("location");
  const latestVersion = latestTagFromLocation(location);
  if (!latestVersion) throw new Error("无法从 GitHub Releases 页面获取最新版本");
  const asset = fallbackAsset({ version: latestVersion, platform: process.platform, arch: process.arch, repository: DESKTOP_REPOSITORY });
  return {
    tag_name: "v" + latestVersion,
    html_url: "https://github.com/" + DESKTOP_REPOSITORY + "/releases/tag/v" + latestVersion,
    assets: asset ? [asset] : []
  };
}

function canWriteInstalledApp() {
  try {
    const target = installedTarget({ platform: process.platform, execPath: process.execPath });
    accessSync(dirname(target), constants.W_OK);
    return true;
  } catch { return false; }
}

async function checkDesktopUpdate() {
  const currentVersion = parseVersion(app.getVersion()) || app.getVersion();
  const releasesUrl = "https://github.com/" + DESKTOP_REPOSITORY + "/releases";
  if (desktopReleaseCache && desktopReleaseCache.expiresAt > Date.now()) return desktopReleaseCache.result;
  let release;
  try {
    release = await fetchGitHubJson(DESKTOP_RELEASES_API);
  } catch (error) {
    if (isGitHubRateLimit(error)) {
      release = await fetchLatestReleaseFallback();
    } else if (error.status === 404) {
      const releases = await fetchGitHubJson(DESKTOP_RELEASES_LIST_API);
      release = Array.isArray(releases) ? releases.find((item) => !item?.draft && !item?.prerelease) : null;
    } else throw error;
  }
  if (!release) {
    const result = { currentVersion, latestVersion: null, hasUpdate: false, available: false, releaseUrl: releasesUrl, message: "还没有发布桌面应用版本" };
    desktopReleaseCache = { expiresAt: Date.now() + DESKTOP_RELEASE_CACHE_TTL_MS, release: null, result };
    return result;
  }
  const latestVersion = parseVersion(release.tag_name || release.name);
  if (!latestVersion) throw new Error("GitHub Release 没有有效的版本号");
  const asset = pickDesktopAsset(release.assets, { platform: process.platform, arch: process.arch });
  const canAutoUpdate = !process.execPath.includes("/Volumes/") && canWriteInstalledApp() && (process.platform === "darwin" || process.platform === "win32" || process.platform === "linux");
  const result = {
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    available: Boolean(asset),
    canAutoUpdate,
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
    if (!update.canAutoUpdate) throw new Error("当前安装位置不支持自动更新，请打开发布页手动安装");
    const release = desktopReleaseCache?.release;
    const asset = pickDesktopAsset(release?.assets, { platform: process.platform, arch: process.arch });
    if (!asset?.browser_download_url) throw new Error("桌面应用安装包下载地址不可用");
    const response = await fetch(asset.browser_download_url, {
      headers: { Accept: "application/octet-stream", "User-Agent": "deepseek-harness-desktop" }
    });
    if (!response.ok || !response.body) throw new Error("下载安装包失败 (" + response.status + ")");
    const updateDir = join(app.getPath("temp"), "deepseek-harness-desktop-updates");
    await mkdir(updateDir, { recursive: true });
    const filename = downloadFilename(update.latestVersion, asset.name);
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
    const targetPath = installedTarget({ platform: process.platform, execPath: process.execPath });
    const restartPath = process.platform === "darwin" ? join(targetPath, "Contents", "MacOS", basename(targetPath, ".app")) : process.execPath;
    const helper = updateCommand({ platform: process.platform, sourcePath: assetPath, targetPath, restartPath });
    const helperChild = spawn(helper.command, helper.args, { detached: true, stdio: "ignore", windowsHide: true });
    helperChild.unref();
    setTimeout(() => shutdown(0), 250);
    return {
      version: update.latestVersion,
      assetName: asset.name,
      assetPath,
      releaseUrl: update.releaseUrl,
      requiresManualInstall: false,
      restarting: true,
      message: "下载完成，应用将自动退出、替换并重新启动。"
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
  // A custom application menu replaces Electron's default menu. Keep the
  // native Edit roles so Cmd/Ctrl+C/V (and the text-field context actions)
  // continue to work in the renderer on every platform.
  const editMenu = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { type: "separator" },
      { role: "selectAll" }
    ]
  };
  return Menu.buildFromTemplate([{ label: "DeepSeek Harness", submenu: [{ label: "About DeepSeek Harness Desktop", click: () => dialog.showMessageBox(win, { type: "info", title: "About", message: "DeepSeek Harness Desktop", detail: "dsh v" + (dshInfo?.version || "?") + "\nDesktop shell v" + app.getVersion(), buttons: ["OK"] }) }, { type: "separator" }, { label: "Check dsh version", click: async () => { try { const r = await checkDshUpdate(); await dialog.showMessageBox(win, { type: "info", title: "dsh version", message: "当前版本 v" + r.currentVersion, detail: "最新版本 v" + r.latestVersion, buttons: ["OK"] }); } catch (e) { dialog.showErrorBox("dsh version", e.message); } } }, { type: "separator" }, { role: "quit" }] }, editMenu, { label: "View", submenu: [{ label: "Reload", accelerator: "CmdOrCtrl+R", click: () => win?.webContents.reload() }, { label: "Force Reload", accelerator: "CmdOrCtrl+Shift+R", click: () => win?.webContents.reloadIgnoringCache() }, { label: "Toggle Developer Tools", accelerator: "Alt+CmdOrCtrl+I", click: () => win?.webContents.toggleDevTools() }, { type: "separator" }, { label: "Open in Browser", click: () => { if (currentUrl) shell.openExternal(currentUrl); } }] }, { label: "Help", submenu: [{ label: "How to update dsh", click: () => dialog.showMessageBox(win, { type: "info", title: "Updating dsh", message: "请在设置页面点击更新按钮。", buttons: ["OK"] }) }, { label: "Open log file", click: () => { if (logPath) shell.openPath(logPath); } }] }]);
}

/**
 * 关闭自己拉起的 dsh web 并等待它真正退出。
 * dsh web 收到 SIGTERM 后会先停止监听、再花 1–3 秒优雅退出；若关闭流程
 * 卡住（例如还有活动连接），5 秒后补发 SIGKILL。应用退出前必须 await 本函数，
 * 否则 dsh web 会变成孤儿进程继续留在后台。
 */
function killServer() {
  return new Promise((resolvePromise) => {
    const pid = childGroupPid || child?.pid;
    const alreadyGone = !pid || (child && (child.exitCode !== null || child.signalCode !== null));
    if (alreadyGone) {
      child = null;
      childGroupPid = null;
      resolvePromise();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      child = null;
      childGroupPid = null;
      resolvePromise();
    };
    if (child) child.once("exit", finish);

    if (process.platform === "win32") {
      // Windows 没有进程组信号，用 taskkill /T 杀掉整棵进程树
      const taskkill = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      taskkill.once("exit", finish);
      taskkill.once("error", finish);
      return;
    }

    try {
      process.kill(-pid, "SIGTERM");
    } catch { /* 进程组已经不存在 */ }
    setTimeout(() => {
      try { process.kill(-pid, "SIGKILL"); } catch { /* 进程组已经不存在 */ }
    }, 5000);
    // 兜底：即使退出事件丢失，也不让应用退出被无限阻塞
    setTimeout(finish, 6000);
  });
}

function shutdown(exitCode) {
  if (quitting) return;
  quitting = true;
  stopImageSettingsWatch?.();
  stopImageSettingsWatch = null;
  void finishShutdown(exitCode);
}

async function finishShutdown(exitCode) {
  try { await killServer(); } catch { /* ignore */ }
  app.exit(exitCode);
}

app.on("window-all-closed", () => { if (!SMOKE_TEST) shutdown(0); });
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  stopImageSettingsWatch?.();
  stopImageSettingsWatch = null;
  event.preventDefault();
  void finishShutdown(0);
});