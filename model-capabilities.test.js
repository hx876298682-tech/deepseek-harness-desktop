import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyModelCapabilityRules, ensureModelCapabilitySettings } from "./model-capabilities.js";

const INVALID_SETTINGS = `llm-pi-ai:
  providers:
    gongsi-claude:
      api: anthropic-messages
      models:
        - id: Claude Sonnet 4.6
        - id: Claude Haiku 4.5
    gongsi:
      api: openai-completions
      baseURL: https://gateway.example/v1
      compat:
        thinkingFormat: openai
        supportsReasoningEffort: true
      models:
        - id: DeepSeek-V4-Flash
          reasoningEfforts: { minimal: null, low: null, medium: null, high: high, max: max }
        - id: gpt-5.6-terra
        - id: GLM-5-Turbo
        - id: Grok-4.6
    unrelated:
      api: openai-completions
      models:
        - id: custom-model
`;

test("applies official model-specific reasoning maps and repairs unsafe nulls", () => {
  const result = applyModelCapabilityRules(INVALID_SETTINGS);

  assert.equal(result.changed, true);
  assert.deepEqual(result.providers, ["gongsi-claude", "gongsi"]);
  assert.deepEqual(result.models, ["Claude Sonnet 4.6", "Claude Haiku 4.5", "DeepSeek-V4-Flash", "gpt-5.6-terra", "GLM-5-Turbo", "Grok-4.6"]);
  assert.match(result.source, /dsh-desktop-model-capabilities: 1/);
  assert.match(result.source, /DeepSeek-V4-Flash[\s\S]*reasoningEfforts:\n\s+high: high\n\s+max: max/);
  assert.match(result.source, /Claude Sonnet 4\.6[\s\S]*reasoningEfforts:\n\s+max: max/);
  assert.doesNotMatch(result.source, /DeepSeek-V4-Flash[\s\S]*minimal:/);
  assert.match(result.source, /gpt-5\.6-terra[\s\S]*off: none[\s\S]*low: low[\s\S]*max: max/);
  assert.match(result.source, /GLM-5-Turbo[\s\S]*reasoningEfforts: false/);
  assert.match(result.source, /Grok-4\.6[\s\S]*reasoningEfforts: false/);
  const gongsiPrefix = result.source.slice(result.source.indexOf("    gongsi:"), result.source.indexOf("      models:"));
  assert.doesNotMatch(gongsiPrefix, /compat:/);
  assert.match(result.source, /unrelated:[\s\S]*custom-model/);
  assert.doesNotMatch(result.source, /reasoningEfforts\.[a-z]+.*null/);
});

test("is idempotent after the migration marker is present", () => {
  const first = applyModelCapabilityRules(INVALID_SETTINGS);
  const second = applyModelCapabilityRules(first.source);

  assert.equal(second.changed, false);
  assert.equal(second.source, first.source);
  assert.deepEqual(second.models, []);
});

test("backs up and writes settings once", async () => {
  const home = await mkdtemp(join(tmpdir(), "dsh-model-capabilities-"));
  await writeFile(join(home, "settings.yaml"), INVALID_SETTINGS, "utf8");
  const logs = [];

  const result = ensureModelCapabilitySettings({ home, log: (message) => logs.push(message) });
  const files = await readdir(home);
  const backup = files.find((file) => file.startsWith("settings.yaml.bak-model-capabilities-"));
  const migrated = await readFile(join(home, "settings.yaml"), "utf8");

  assert.equal(result.changed, true);
  assert.ok(backup);
  assert.equal(migrated, applyModelCapabilityRules(INVALID_SETTINGS).source);
  assert.ok(logs.some((message) => message.includes("DeepSeek-V4-Flash")));
});
