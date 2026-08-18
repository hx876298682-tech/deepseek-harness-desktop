import test from "node:test";
import assert from "node:assert/strict";
import { downloadFilename, installedTarget, updateCommand } from "./desktop-update-helper.js";

test("derives installed application targets", () => {
  assert.equal(installedTarget({ platform: "darwin", execPath: "/Applications/DeepSeek Harness Desktop.app/Contents/MacOS/DeepSeek Harness Desktop" }), "/Applications/DeepSeek Harness Desktop.app");
  assert.equal(installedTarget({ platform: "linux", execPath: "/opt/DeepSeekHarnessDesktop.AppImage" }), "/opt/DeepSeekHarnessDesktop.AppImage");
  assert.equal(installedTarget({ platform: "win32", execPath: "C:\\Program Files\\DeepSeek Harness Desktop\\DeepSeek Harness Desktop.exe" }), "C:\\Program Files\\DeepSeek Harness Desktop");
});

test("builds a macOS helper with rollback and restart", () => {
  const helper = updateCommand({ platform: "darwin", sourcePath: "/tmp/update.dmg", targetPath: "/Applications/DeepSeek Harness Desktop.app" });
  assert.equal(helper.command, "/bin/sh");
  assert.match(helper.args[1], /hdiutil attach/);
  assert.match(helper.args[1], /\.previous/);
  assert.match(helper.args[1], /open '\/Applications\/DeepSeek Harness Desktop\.app'/);
});

test("sanitizes download filenames", () => {
  assert.equal(downloadFilename("1.2.3", "My App (arm64).dmg"), "1.2.3-My_App__arm64_.dmg");
});
