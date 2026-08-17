import test from "node:test";
import assert from "node:assert/strict";
import { isGitHubRepositoryUrl, normalizeForumPlugins } from "./forum-plugin-utils.js";

test("normalizes dsh-plugin repositories", () => {
  assert.deepEqual(normalizeForumPlugins({ items: [{ name: "demo-plugin", description: "A demo", html_url: "https://github.com/example/demo-plugin" }] }), [{ name: "demo-plugin", description: "A demo", url: "https://github.com/example/demo-plugin" }]);
});

test("filters unsafe or invalid repository links", () => {
  assert.equal(isGitHubRepositoryUrl("https://github.com/example/demo"), true);
  assert.equal(isGitHubRepositoryUrl("http://github.com/example/demo"), false);
  assert.equal(isGitHubRepositoryUrl("https://evil.example/example/demo"), false);
  assert.deepEqual(normalizeForumPlugins({ items: [{ name: "bad", html_url: "javascript:alert(1)" }] }), []);
});
