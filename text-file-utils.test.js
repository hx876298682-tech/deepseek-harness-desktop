import test from "node:test";
import assert from "node:assert/strict";
import { formatTextFiles, isSupportedTextFile, validateTextFiles } from "./text-file-utils.js";

test("accepts common text and code files", () => {
  assert.equal(isSupportedTextFile("README.md"), true);
  assert.equal(isSupportedTextFile("src/app.ts"), true);
  assert.equal(isSupportedTextFile("Dockerfile"), true);
  assert.equal(isSupportedTextFile("photo.png"), false);
  assert.equal(isSupportedTextFile("report.pdf"), false);
});

test("rejects oversized and unsupported files", () => {
  assert.match(validateTextFiles([{ name: "report.pdf", size: 10 }]), /不支持/);
  assert.match(validateTextFiles([{ name: "large.txt", size: 1024 * 1024 + 1 }]), /超过 1 MB/);
  assert.match(validateTextFiles(Array.from({ length: 6 }, (_, index) => ({ name: `${index}.txt`, size: 1 }))), /最多选择 5/);
});

test("formats selected file contents with names", () => {
  assert.equal(formatTextFiles([{ name: "notes.md", content: "hello" }]), "\n\n--- 文件：notes.md ---\nhello\n--- 文件结束：notes.md ---");
});
