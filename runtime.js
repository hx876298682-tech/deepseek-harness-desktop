import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MANAGED_NODE_MAJOR = 22;
const SUPPORTED_NODE_MAJORS = [22, 24];
const MIN_NODE_VERSION = [22, 19, 0];

function compareNodeVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const a = Number(left[index] || 0);
    const b = Number(right[index] || 0);
    if (a !== b) return a > b ? 1 : -1;
  }
  return 0;
}

function parseNodeVersion(value) {
  const match = String(value || "").match(/v?(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function platformAsset() {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (process.platform === "darwin") return { target: `darwin-${arch}`, extension: "tar.gz" };
  if (process.platform === "linux") return { target: `linux-${arch}`, extension: "tar.gz" };
  if (process.platform === "win32") return { target: `win-${arch}`, extension: "zip" };
  throw new Error(`暂不支持自动安装 Node.js 的平台：${process.platform}/${process.arch}`);
}

function executableName() {
  return process.platform === "win32" ? "node.exe" : "node";
}

function npmName() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runtimeNodePath(runtimeRoot) {
  return process.platform === "win32" ? join(runtimeRoot, executableName()) : join(runtimeRoot, "bin", executableName());
}

function runtimeNpmPath(runtimeRoot) {
  return process.platform === "win32" ? join(runtimeRoot, npmName()) : join(runtimeRoot, "bin", npmName());
}

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} 超时`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code ?? signal}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

export function parseInstalledNodeVersion(value) {
  return parseNodeVersion(value);
}

export function isSupportedNodeVersion(value) {
  const version = parseNodeVersion(value);
  return Boolean(version && SUPPORTED_NODE_MAJORS.includes(version[0]) && (version[0] !== 22 || compareNodeVersions(version, MIN_NODE_VERSION) >= 0));
}

export function detectNodeVersion(nodePath) {
  if (!nodePath) return null;
  const result = spawnSync(nodePath, ["--version"], { encoding: "utf8", timeout: 15000 });
  if (result.status !== 0) return null;
  return String(result.stdout || "").trim().split(/\s+/)[0] || null;
}

async function latestNodeRelease() {
  const response = await fetch(`https://nodejs.org/dist/index.json`, {
    headers: { Accept: "application/json", "User-Agent": "deepseek-harness-desktop" }
  });
  if (!response.ok) throw new Error(`Node.js 版本列表请求失败 (${response.status})`);
  const releases = await response.json();
  const release = releases.find((item) => {
    const version = parseNodeVersion(item?.version);
    return version && version[0] === MANAGED_NODE_MAJOR && compareNodeVersions(version, MIN_NODE_VERSION) >= 0 && item.lts;
  }) || releases.find((item) => {
    const version = parseNodeVersion(item?.version);
    return version && version[0] === MANAGED_NODE_MAJOR && compareNodeVersions(version, MIN_NODE_VERSION) >= 0;
  });
  if (!release?.version) throw new Error("Node.js 22 的可用版本未找到");
  return release.version;
}

async function download(url, destination, log) {
  const response = await fetch(url, {
    headers: { Accept: "application/octet-stream", "User-Agent": "deepseek-harness-desktop" }
  });
  if (!response.ok || !response.body) throw new Error(`Node.js 下载失败 (${response.status})`);
  const total = Number(response.headers.get("content-length") || 0);
  let received = 0;
  const stream = Readable.fromWeb(response.body);
  stream.on("data", (chunk) => {
    received += chunk.length;
    if (total && (received === chunk.length || Math.floor(received / total * 10) !== Math.floor((received - chunk.length) / total * 10))) {
      log(`Node.js 下载进度 ${Math.round(received / total * 100)}%`);
    }
  });
  await pipeline(stream, createWriteStream(destination));
  if (total && received !== total) throw new Error("Node.js 下载不完整");
}

async function fetchSha256(url, filename) {
  const response = await fetch(url, { headers: { Accept: "text/plain", "User-Agent": "deepseek-harness-desktop" } });
  if (!response.ok) throw new Error(`Node.js 校验和下载失败 (${response.status})`);
  const line = String(await response.text()).split(/\r?\n/).find((row) => row.trim().endsWith(`  ${filename}`) || row.trim().endsWith(` *${filename}`));
  const hash = line?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash || "")) throw new Error("Node.js 校验和格式无效");
  return hash;
}

async function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

async function extract(archive, destination) {
  await mkdir(destination, { recursive: true });
  if (process.platform === "win32") {
    try {
      await run("tar", ["-xf", archive, "-C", destination], 120000);
      return;
    } catch {
      await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`], 120000);
      return;
    }
  }
  await run("tar", ["-xzf", archive, "-C", destination], 120000);
}

function findExtractedRoot(directory) {
  const entries = readdirSync(directory);
  const roots = entries.map((entry) => join(directory, entry)).filter((entry) => {
    try { return statSync(entry).isDirectory() && existsSync(runtimeNodePath(entry)); } catch { return false; }
  });
  return roots[0] || null;
}

export async function ensureNodeRuntime(userDataPath, log = () => {}) {
  const asset = platformAsset();
  const runtimeBase = join(userDataPath, "runtime");
  await mkdir(runtimeBase, { recursive: true });
  const marker = join(runtimeBase, `node-${MANAGED_NODE_MAJOR}`);
  const existingNode = runtimeNodePath(marker);
  if (existsSync(existingNode)) return { nodePath: existingNode, npmPath: runtimeNpmPath(marker), managed: true };

  log("未找到可用的 Node.js，准备自动安装 Node.js 22");
  const version = await latestNodeRelease();
  const filename = `node-${version}-${asset.target}.${asset.extension}`;
  const work = await mkdtemp(join(tmpdir(), "dsh-node-"));
  const archive = join(work, filename);
  const extracted = join(work, "extracted");
  try {
    const baseUrl = `https://nodejs.org/dist/${version}/`;
    await download(baseUrl + filename, archive, log);
    const expectedHash = await fetchSha256(baseUrl + "SHASUMS256.txt", filename);
    const actualHash = await sha256File(archive);
    if (expectedHash !== actualHash) throw new Error("Node.js 下载校验和不匹配");
    await extract(archive, extracted);
    const root = findExtractedRoot(extracted);
    if (!root) throw new Error("Node.js 压缩包结构无效");
    await rm(marker, { recursive: true, force: true });
    await rename(root, marker);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  if (!existsSync(existingNode)) throw new Error("Node.js 安装完成但找不到 node 可执行文件");
  log(`Node.js ${version} 已安装到应用目录`);
  return { nodePath: existingNode, npmPath: runtimeNpmPath(marker), managed: true, version };
}

export function runtimePathEnv(runtime) {
  if (!runtime?.nodePath) return process.env.PATH || "";
  return [dirname(runtime.nodePath), process.env.PATH || ""].filter(Boolean).join(delimiter);
}
