import test from "node:test";
import assert from "node:assert/strict";
import { DSH_INSTALL_TIMEOUT_MS, dshInstallArgs, formatDshInstallTimeout } from "./dsh-update-utils.js";

test("builds npm arguments suitable for a large CLI update", () => {
  const args = dshInstallArgs({ installRoot: "/tmp/dsh", packageName: "@deepseek-ai/dsh" });
  assert.deepEqual(args.slice(0, 3), ["install", "--prefix", "/tmp/dsh"]);
  assert.ok(args.includes("--prefer-offline"));
  assert.ok(args.includes("--no-package-lock"));
  assert.ok(args.includes("--fetch-timeout=30000"));
  assert.equal(args.at(-1), "@deepseek-ai/dsh@latest");
});

test("describes long install timeouts clearly", () => {
  assert.equal(DSH_INSTALL_TIMEOUT_MS, 900000);
  assert.match(formatDshInstallTimeout(), /15 分钟/);
});
