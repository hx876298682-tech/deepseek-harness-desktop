// usage-stats-plugin.js — install the bundled dsh-usage-stats plugin into the
// active dsh profile (DSH_HOME or ~/.dsh).
//
// The plugin lives at plugins/dsh-usage-stats and ships inside the packaged
// app. This module mirrors the plugin's own verified installer
// (plugins/dsh-usage-stats/scripts/install.mjs): it copies the package into
// <dshHome>/profiles/node_modules/dsh-usage-stats and idempotently merges one
// Cordis entry into <dshHome>/profiles/web/cordis.patch.yml. Running it on
// every app launch keeps the installed copy in sync with the bundled version.

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_NAME = "dsh-usage-stats";
const PLUGIN_ENTRY_ID = "usage-stats";
const PLUGIN_LINE = /^\s+name:\s*dsh-usage-stats\s*$/gm;
const EMPTY_SEQUENCE_ROOT = /^\[\](?:[ \t]+#.*)?$/;
const COPY_ENTRIES = ["lib", "cordis.patch.yml", "package.json", "README.md", "LICENSE", "SECURITY.md"];

/** DSH home: DSH_HOME env override, otherwise ~/.dsh (same as the plugin installer). */
export function defaultDshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** Absolute path to the vendored plugin package inside this app. */
export function bundledPluginRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "plugins", PLUGIN_NAME);
}

/** Version of the plugin bundled with this app, or null when unreadable. */
export async function bundledPluginVersion() {
  try {
    const pkg = JSON.parse(await readFile(join(bundledPluginRoot(), "package.json"), "utf8"));
    return pkg.name === PLUGIN_NAME ? String(pkg.version || "") : null;
  } catch {
    return null;
  }
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function meaningfulPatchLines(text) {
  return String(text).split(/\r?\n/).map((line, index) => ({
    index,
    indent: line.match(/^[ \t]*/)?.[0].length ?? 0,
    content: line.trim()
  })).filter(({ content }) => content !== "" && !content.startsWith("#") && content !== "---" && content !== "...");
}

/** Remove a YAML document whose only value is the empty root sequence `[]`. */
function withoutEmptySequenceRoot(text) {
  const meaningful = meaningfulPatchLines(text);
  if (meaningful.length === 0) return text;
  const rootIndent = Math.min(...meaningful.map(({ indent }) => indent));
  const emptyRoot = meaningful.find(({ indent, content }) => indent === rootIndent && EMPTY_SEQUENCE_ROOT.test(content));
  if (emptyRoot === void 0) return text;
  const lines = String(text).split(/\r?\n/);
  const inlineComment = lines[emptyRoot.index].match(/^([ \t]*)\[\][ \t]+(#.*)$/);
  if (inlineComment === null) lines.splice(emptyRoot.index, 1);
  else lines[emptyRoot.index] = `${inlineComment[1]}${inlineComment[2]}`;
  return lines.filter((line) => line.trim() !== "...").join("\n").trimEnd();
}

/** Detect the exact invalid shape produced by older installers: `[]` plus list entries. */
function assertNoEmptyRootConflict(text) {
  const meaningful = meaningfulPatchLines(text);
  if (meaningful.length < 2) return;
  const rootIndent = Math.min(...meaningful.map(({ indent }) => indent));
  const roots = meaningful.filter(({ indent }) => indent === rootIndent);
  if (roots.some(({ content }) => EMPTY_SEQUENCE_ROOT.test(content)) && roots.length > 1) {
    throw new Error(`invalid YAML: empty root sequence [] cannot be combined with patch entries`);
  }
}

/** Preserve existing YAML/comments while adding exactly one plugin patch entry. */
export function enablePluginInPatch(text) {
  const base = withoutEmptySequenceRoot(text);
  if ([...base.matchAll(PLUGIN_LINE)].length > 0) return base;
  const patchBlock = `# dsh-usage-stats: token usage heatmap + DeepSeek balance
- insert:
    - id: ${PLUGIN_ENTRY_ID}
      name: ${PLUGIN_NAME}
`;
  return base.trim() === "" ? patchBlock : `${base.trimEnd()}\n\n${patchBlock}`;
}

/** Current install state of the plugin in the given dsh home. */
export async function usageStatsPluginStatus({ dshHome = defaultDshHome() } = {}) {
  const target = join(dshHome, "profiles", "node_modules", PLUGIN_NAME);
  const patchPath = join(dshHome, "profiles", "web", "cordis.patch.yml");
  let name = null;
  let version = null;
  try {
    const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    name = String(pkg.name || "");
    version = String(pkg.version || "");
  } catch { /* not installed */ }
  let enabled = false;
  try {
    const patch = await readFile(patchPath, "utf8");
    assertNoEmptyRootConflict(patch);
    enabled = [...patch.matchAll(PLUGIN_LINE)].length === 1;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { installed: name === PLUGIN_NAME && Boolean(version), name, version, enabled, target, patchPath };
}

/**
 * Copy the bundled plugin into the dsh profile and enable it in
 * cordis.patch.yml. Idempotent: re-running never duplicates the entry.
 */
export async function installUsageStatsPlugin({ sourceRoot = bundledPluginRoot(), dshHome = defaultDshHome(), log = () => {} } = {}) {
  const sourcePackage = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));
  if (sourcePackage.name !== PLUGIN_NAME) throw new Error(`bundled package at ${sourceRoot} is not ${PLUGIN_NAME}`);
  const target = join(dshHome, "profiles", "node_modules", PLUGIN_NAME);
  const patchPath = join(dshHome, "profiles", "web", "cordis.patch.yml");

  await mkdir(target, { recursive: true });
  for (const entry of COPY_ENTRIES) {
    await cp(join(sourceRoot, entry), join(target, entry), { recursive: true, force: true });
  }
  await mkdir(join(target, "scripts"), { recursive: true });
  await cp(join(sourceRoot, "scripts", "install.mjs"), join(target, "scripts", "install.mjs"), { force: true });

  await mkdir(dirname(patchPath), { recursive: true });
  const current = await readOptional(patchPath) ?? "";
  const enabledPatch = enablePluginInPatch(current);
  let patchChanged = false;
  if (enabledPatch !== current) {
    await writeFile(patchPath, enabledPatch, "utf8");
    patchChanged = true;
  }

  const status = await usageStatsPluginStatus({ dshHome });
  if (!status.installed || !status.enabled) {
    throw new Error(`install verification failed: ${PLUGIN_NAME} not fully installed at ${dshHome}`);
  }
  log(`${PLUGIN_NAME} v${status.version} installed (patch ${patchChanged ? "updated" : "already enabled"})`);
  return { ...status, patchChanged };
}
