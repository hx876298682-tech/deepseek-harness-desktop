import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, parseVersion, pickDesktopAsset } from "./update-utils.js";

test("parseVersion extracts semantic versions", () => {
  assert.equal(parseVersion("v0.1.0"), "0.1.0");
  assert.equal(parseVersion("DeepSeek Harness Desktop 0.1.0"), "0.1.0");
  assert.equal(parseVersion("none"), null);
});

test("compareVersions handles prereleases", () => {
  assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
  assert.equal(compareVersions("0.1.1", "0.1.0"), 1);
  assert.equal(compareVersions("0.1.0", "0.2.0"), -1);
  assert.equal(compareVersions("1.0.0-beta", "1.0.0"), -1);
});

test("pickDesktopAsset prefers matching mac arm64 DMG", () => {
  const asset = pickDesktopAsset([
    { name: "DeepSeekHarnessDesktop-0.1.1-mac-x64.dmg", browser_download_url: "x64" },
    { name: "latest-mac.yml", browser_download_url: "metadata" },
    { name: "DeepSeekHarnessDesktop-0.1.1-mac-arm64.dmg", browser_download_url: "arm64" }
  ], { platform: "darwin", arch: "arm64" });
  assert.equal(asset.browser_download_url, "arm64");
});

test("pickDesktopAsset accepts a universal DMG", () => {
  const asset = pickDesktopAsset([{ name: "DeepSeekHarnessDesktop-0.1.1-universal.dmg", browser_download_url: "universal" }], { platform: "darwin", arch: "arm64" });
  assert.equal(asset.browser_download_url, "universal");
});

test("pickDesktopAsset rejects wrong platform assets", () => {
  const asset = pickDesktopAsset([{ name: "DeepSeekHarnessDesktop-0.1.1-linux-x64.AppImage", browser_download_url: "linux" }], { platform: "darwin", arch: "arm64" });
  assert.equal(asset, null);
});
