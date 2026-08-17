import test from "node:test";
import assert from "node:assert/strict";
import { addDefaultImageInputToSettings } from "./image-input-defaults.js";

test("enables image input by default for non-DeepSeek providers", () => {
  const source = `llm-pi-ai:\n  providers:\n    openai:\n      api: openai-completions\n      models:\n        - id: gpt-4o\n    deepseek-official:\n      api: deepseek\n      models:\n        - id: deepseek-v4-flash\n`;
  const result = addDefaultImageInputToSettings(source);
  assert.equal(result.changed, true);
  assert.match(result.source, /openai:[\s\S]*defaultInput: \[text, image\]/);
  assert.doesNotMatch(result.source, /deepseek-official:[\s\S]*defaultInput/);
  assert.deepEqual(result.providers, ["openai"]);
});

test("preserves explicit provider defaults", () => {
  const source = `llm-pi-ai:\n  providers:\n    gateway:\n      defaultInput: [text]\n      models:\n        - id: text-only\n`;
  const result = addDefaultImageInputToSettings(source);
  assert.equal(result.changed, false);
  assert.equal(result.source, source);
});

test("does not modify settings without pi-ai providers", () => {
  const source = `llm-deepseek:\n  providers:\n    deepseek-official:\n      apiKeyEnv: DEEPSEEK_API_KEY\n`;
  const result = addDefaultImageInputToSettings(source);
  assert.equal(result.changed, false);
  assert.equal(result.source, source);
});
