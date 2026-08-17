// resolve-dsh.js — locate a runnable @deepseek-ai/dsh CLI entry.
//
// The desktop app never bundles the harness: it resolves the *installed* dsh
// CLI at launch time (PATH -> npx cache -> global npm root -> npx fallback)
// and boots it with the system Node. Installing or updating
// @deepseek-ai/dsh (or running a fresh npx command) is picked up on the next
// launch without rebuilding the app.
//
// Resolution order:
//   1. DSH_BIN env var (a path to dsh's lib/bin.js, or a bin name on PATH)
//   2. 'dsh' found on PATH (realpath'ed; npx/global shims resolve to bin.js)
//   3. newest npx cache entry: ~/.npm/_npx/*/node_modules/@deepseek-ai/dsh/lib/bin.js
//   4. global npm root: $(npm root -g)/@deepseek-ai/dsh/lib/bin.js
//   5. npx fallback (resolver returns { npxFallback: true })
//
// Run directly to test:  node resolve-dsh.js

import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";

const COMMON_BIN_DIRS = process.platform === "win32" ? [
  process.env.ProgramFiles ? join(process.env.ProgramFiles, "nodejs") : "C:\\Program Files\\nodejs",
  process.env.APPDATA ? join(process.env.APPDATA, "npm") : null,
].filter(Boolean) : [
  "/usr/local/bin", // official macOS Node installer
  "/opt/homebrew/bin", // Apple Silicon Homebrew
  "/usr/bin",
];

/** Directories that may hold node/npm/dsh, PATH first, then well-known spots. */
export function candidateBinDirs() {
  const dirs = new Set();
  for (const p of (process.env.PATH || "").split(delimiter)) if (p) dirs.add(p);
  for (const d of COMMON_BIN_DIRS) dirs.add(d);
  const nvmRoot = process.env.NVM_DIR || join(homedir(), ".nvm");
  try {
    for (const v of readdirSync(join(nvmRoot, "versions", "node"))) dirs.add(join(nvmRoot, "versions", "node", v, "bin"));
  } catch { /* no nvm */ }
  dirs.add(join(homedir(), ".volta", "bin"));
  try {
    for (const v of readdirSync("/usr/local/n/versions/node")) dirs.add(join("/usr/local/n/versions/node", v, "bin"));
  } catch { /* no n */ }
  return [...dirs];
}

export function findInDirs(dirs, name) {
  const names = [name];
  if (process.platform === "win32" && !/\.(?:cmd|exe|bat)$/i.test(name)) names.push(name + ".cmd", name + ".exe", name + ".bat");
  for (const d of dirs) {
    for (const candidateName of names) {
      const p = join(d, candidateName);
      try { const st = statSync(p); if (st.isFile() || st.isSymbolicLink()) return p; } catch { /* next */ }
    }
  }
  return null;
}

export function findNode() {
  if (process.env.DSH_DESKTOP_NODE) return process.env.DSH_DESKTOP_NODE;
  return findInDirs(candidateBinDirs(), "node");
}

/** Newest npx cache dsh bin.js, or null. */
export function npxCacheDshEntry() {
  const root = join(homedir(), ".npm", "_npx");
  let best = null, bestMtime = 0;
  try {
    for (const dir of readdirSync(root)) {
      const p = join(root, dir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
      try {
        const st = statSync(p);
        if (st.isFile() && st.mtimeMs > bestMtime) { best = p; bestMtime = st.mtimeMs; }
      } catch { /* not this one */ }
    }
  } catch { /* no npx cache */ }
  return best;
}

/** Global npm root dsh bin.js, or null. */
export function globalDshEntry() {
  const node = findNode();
  if (!node) return null;
  const npm = findInDirs(candidateBinDirs(), "npm") || join(dirname(node), "npm");
  if (!existsSync(npm)) return null;
  const r = spawnSync(npm, ["root", "-g"], { encoding: "utf8", timeout: 15000 });
  if (r.status !== 0) return null;
  const p = join(String(r.stdout || "").trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
  return existsSync(p) ? p : null;
}

function realDshBinFromCommand(name) {
  const p = findInDirs(candidateBinDirs(), name);
  if (!p) return null;
  try {
    const real = realpathSync(p);
    // Accept either the npx/global shim target (lib/bin.js) or a real bin file.
    return existsSync(real) ? real : p;
  } catch {
    return existsSync(p) ? p : null;
  }
}

/** Quick validity + version check: node <bin.js> --version */
export function probe(binJs, nodePath) {
  if (!existsSync(binJs)) return null;
  const r = spawnSync(nodePath, [binJs, "--version"], { encoding: "utf8", timeout: 15000 });
  if (r.status !== 0) return null;
  const version = String(r.stdout || "").trim().split(/\s+/)[0];
  return version || null;
}

export function resolveDsh() {
  const nodePath = findNode();
  const result = { ok: false, nodePath, via: null, binJs: null, version: null, npxFallback: false, error: null };

  if (!nodePath) {
    result.error = "System Node.js was not found. Install Node.js LTS from https://nodejs.org and relaunch.";
    return result;
  }

  const tryCandidate = (binJs, via) => {
    if (!binJs || result.ok) return;
    const version = probe(binJs, nodePath);
    if (version) {
      result.ok = true; result.binJs = binJs; result.via = via; result.version = version;
    }
  };

  // 1. env override
  if (process.env.DSH_BIN) {
    const raw = process.env.DSH_BIN;
    const candidate = isAbsolute(raw) || raw.includes("/") || raw.includes("\\") ? raw : realDshBinFromCommand(raw);
    tryCandidate(candidate, "env");
  }
  // 2. PATH shim
  if (!result.ok) tryCandidate(realDshBinFromCommand("dsh"), "PATH");
  // 3. newest npx cache
  if (!result.ok) tryCandidate(npxCacheDshEntry(), "npx-cache");
  // 4. global npm root
  if (!result.ok) tryCandidate(globalDshEntry(), "global");
  // 5. npx fallback (resolved at spawn time)
  if (!result.ok) {
    const npm = findInDirs(candidateBinDirs(), "npm") || (nodePath ? findInDirs([dirname(nodePath)], "npm") : null);
    if (npm && existsSync(npm)) {
      result.npxFallback = true;
      result.ok = true;
      result.via = "npx";
      result.npmPath = npm;
      result.error = null;
    } else {
      result.error = "dsh was not found and npx is unavailable. Install it with: npm install -g @deepseek-ai/dsh";
    }
  }
  return result;
}

// Standalone test: node resolve-dsh.js
if (process.argv[1] && process.argv[1].endsWith("resolve-dsh.js")) {
  const r = resolveDsh();
  console.log(JSON.stringify(r, null, 2));
}
