import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("electron package includes every desktop runtime module imported by main.js", async () => {
  const manifest = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
  const files = new Set(manifest.build.files);
  for (const module of ["dsh-update-utils.js", "usage-stats-plugin.js", "runtime.js", "model-capabilities.js"]) {
    assert.equal(files.has(module), true, `build.files must include ${module}`);
  }
});
