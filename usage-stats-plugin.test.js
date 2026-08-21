import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundledPluginRootForModulePath, enablePluginInPatch, installUsageStatsPlugin, usageStatsPluginStatus, PLUGIN_NAME } from "./usage-stats-plugin.js";

const FAKE_PACKAGE = {
  name: PLUGIN_NAME,
  version: "9.9.9-test",
  main: "lib/index.js",
  type: "module"
};

/** Build a minimal stand-in for the vendored plugin package. */
async function fakeSource() {
  const root = await mkdtemp(join(tmpdir(), "dsh-us-source-"));
  await mkdir(join(root, "lib"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify(FAKE_PACKAGE));
  await writeFile(join(root, "lib", "index.js"), "export default 1;\n");
  await writeFile(join(root, "scripts", "install.mjs"), "// installer\n");
  await writeFile(join(root, "cordis.patch.yml"), "- insert:\n    - id: usage-stats\n      name: dsh-usage-stats\n");
  await writeFile(join(root, "README.md"), "readme\n");
  await writeFile(join(root, "LICENSE"), "MIT\n");
  await writeFile(join(root, "SECURITY.md"), "security\n");
  return root;
}

async function fakeDshHome() {
  return mkdtemp(join(tmpdir(), "dsh-us-home-"));
}

test("installs package files and enables the Cordis entry", async () => {
  const source = await fakeSource();
  const home = await fakeDshHome();
  try {
    const result = await installUsageStatsPlugin({ sourceRoot: source, dshHome: home });
    assert.equal(result.version, "9.9.9-test");
    assert.equal(result.enabled, true);
    assert.equal(result.patchChanged, true);

    const installed = JSON.parse(await readFile(join(home, "profiles", "node_modules", "dsh-usage-stats", "package.json"), "utf8"));
    assert.equal(installed.name, PLUGIN_NAME);
    assert.equal(installed.version, "9.9.9-test");
    const patch = await readFile(join(home, "profiles", "web", "cordis.patch.yml"), "utf8");
    assert.match(patch, /name:\s*dsh-usage-stats/);
    assert.equal((patch.match(/name:\s*dsh-usage-stats/g) || []).length, 1);

    const status = await usageStatsPluginStatus({ dshHome: home });
    assert.equal(status.installed, true);
    assert.equal(status.enabled, true);
    assert.equal(status.version, "9.9.9-test");
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("re-running the installer is idempotent and never duplicates the entry", async () => {
  const source = await fakeSource();
  const home = await fakeDshHome();
  try {
    await installUsageStatsPlugin({ sourceRoot: source, dshHome: home });
    const first = await readFile(join(home, "profiles", "web", "cordis.patch.yml"), "utf8");
    const result = await installUsageStatsPlugin({ sourceRoot: source, dshHome: home });
    const second = await readFile(join(home, "profiles", "web", "cordis.patch.yml"), "utf8");
    assert.equal(result.patchChanged, false);
    assert.equal(second, first);
    assert.equal((second.match(/name:\s*dsh-usage-stats/g) || []).length, 1);
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("enablePluginInPatch replaces an empty [] root and preserves comments", async () => {
  const empty = "# existing comment\n[]\n";
  const patched = enablePluginInPatch(empty);
  assert.match(patched, /^# existing comment/m);
  assert.match(patched, /name:\s*dsh-usage-stats/);
  assert.equal((patched.match(/name:\s*dsh-usage-stats/g) || []).length, 1);
  assert.doesNotMatch(patched, /^\[\]$/m);
});

test("enablePluginInPatch appends to existing patches without touching them", async () => {
  const existing = "- insert:\n    - id: other\n      name: other-plugin\n";
  const patched = enablePluginInPatch(existing);
  assert.match(patched, /id:\s*other/);
  assert.match(patched, /name:\s*dsh-usage-stats/);
  assert.equal((patched.match(/name:\s*dsh-usage-stats/g) || []).length, 1);
});

test("status reports not installed when package is missing", async () => {
  const home = await fakeDshHome();
  try {
    const status = await usageStatsPluginStatus({ dshHome: home });
    assert.equal(status.installed, false);
    assert.equal(status.enabled, false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("bundled plugin root uses the unpacked tree for packaged asar modules", () => {
  const modulePath = "/Applications/DeepSeek Harness Desktop.app/Contents/Resources/app.asar/usage-stats-plugin.js";
  assert.equal(
    bundledPluginRootForModulePath(modulePath),
    "/Applications/DeepSeek Harness Desktop.app/Contents/Resources/app.asar.unpacked/plugins/dsh-usage-stats"
  );
});
