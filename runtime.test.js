import test from "node:test";
import assert from "node:assert/strict";
import { detectNodeVersion, isSupportedNodeVersion, parseInstalledNodeVersion } from "./runtime.js";

test("parseInstalledNodeVersion parses Node versions", () => {
  assert.deepEqual(parseInstalledNodeVersion("v22.19.0"), [22, 19, 0]);
  assert.equal(parseInstalledNodeVersion("not-a-version"), null);
});

test("isSupportedNodeVersion accepts official supported majors", () => {
  assert.equal(isSupportedNodeVersion("v22.19.0"), true);
  assert.equal(isSupportedNodeVersion("v24.0.0"), true);
  assert.equal(isSupportedNodeVersion("v22.18.0"), false);
  assert.equal(isSupportedNodeVersion("v20.19.0"), false);
});

test("detectNodeVersion reads the current Node executable", () => {
  const version = detectNodeVersion(process.execPath);
  assert.match(version || "", /^v\d+\.\d+\.\d+$/);
});
