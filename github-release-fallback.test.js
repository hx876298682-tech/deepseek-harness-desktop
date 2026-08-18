import test from "node:test";
import assert from "node:assert/strict";
import { fallbackAsset, isGitHubRateLimit, latestTagFromLocation } from "./github-release-fallback.js";

test("detects GitHub API rate-limit errors", () => {
  assert.equal(isGitHubRateLimit({ status: 403, message: "GitHub 请求失败 (403): rate limit exceeded" }), true);
  assert.equal(isGitHubRateLimit({ status: 403, message: "forbidden" }), false);
});

test("extracts latest release version from redirect", () => {
  assert.equal(latestTagFromLocation("https://github.com/hx876298682-tech/deepseek-harness-desktop/releases/tag/v0.1.7"), "0.1.7");
  assert.equal(latestTagFromLocation("https://github.com/hx876298682-tech/deepseek-harness-desktop/releases"), null);
});

test("constructs public release asset URLs", () => {
  const asset = fallbackAsset({ version: "0.1.7", platform: "darwin", arch: "arm64", repository: "hx876298682-tech/deepseek-harness-desktop" });
  assert.equal(asset.name, "DeepSeekHarnessDesktop-0.1.7-arm64.dmg");
  assert.match(asset.browser_download_url, /releases\/download\/v0\.1\.7/);
});
