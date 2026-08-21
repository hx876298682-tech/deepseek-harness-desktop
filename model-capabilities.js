import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MODEL_CAPABILITY_MARKER = "# dsh-desktop-model-capabilities: 1";

const OPENAI_COMPAT = { thinkingFormat: "openai", supportsReasoningEffort: true };
const DEEPSEEK_COMPAT = { thinkingFormat: "deepseek", supportsReasoningEffort: false };
const ZAI_COMPAT = { thinkingFormat: "zai", supportsReasoningEffort: true };

// Derived from the dsh/pi-ai catalog shipped with the current Harness runtime.
const MODEL_CAPABILITY_RULES = {
  "gongsi-claude": {
    "Claude Sonnet 4.6": { reasoningEfforts: { max: "max" } },
    "Claude Sonnet 5": { reasoningEfforts: { xhigh: "xhigh", max: "max" } },
    "Claude Opus 4.6": { reasoningEfforts: { max: "max" } },
    "Claude Opus 4.7": { reasoningEfforts: { xhigh: "xhigh", max: "max" } },
    "Opus 4.8": { reasoningEfforts: { xhigh: "xhigh", max: "max" } },
    "Opus 5": { reasoningEfforts: { xhigh: "xhigh", max: "max" } },
    "Fable 5": { reasoningEfforts: { xhigh: "xhigh", max: "max" } },
    "Claude Haiku 4.5": { reasoningEfforts: false }
  },
  gongsi: {
    "Fable 5": { reasoningEfforts: { xhigh: "xhigh", max: "max" }, compat: OPENAI_COMPAT },
    "DeepSeek-V4-Flash": { reasoningEfforts: { high: "high", max: "max" }, compat: DEEPSEEK_COMPAT },
    "GLM-5.2": { reasoningEfforts: { low: "high", medium: "high", high: "high", max: "max" }, compat: ZAI_COMPAT },
    "Grok-4.5": { reasoningEfforts: { off: null, low: "low", medium: "medium", high: "high" }, compat: OPENAI_COMPAT },
    "gpt-5.6-terra": { reasoningEfforts: { off: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" }, compat: OPENAI_COMPAT },
    "gpt-5.6-sol": { reasoningEfforts: { off: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" }, compat: OPENAI_COMPAT },
    "Claude Sonnet 4.6": { reasoningEfforts: { max: "max" }, compat: OPENAI_COMPAT },
    "Claude Sonnet 5": { reasoningEfforts: { xhigh: "xhigh", max: "max" }, compat: OPENAI_COMPAT },
    "Opus 5": { reasoningEfforts: { xhigh: "xhigh", max: "max" }, compat: OPENAI_COMPAT },
    "Kimi-K2.7-Code": { reasoningEfforts: false },
    "gpt-5.5": { reasoningEfforts: { off: "none", low: "low", medium: "medium", high: "high" }, compat: OPENAI_COMPAT },
    "Claude Haiku 4.5": { reasoningEfforts: false },
    "Kimi K2.6": { reasoningEfforts: false },
    "Kimi K3": { reasoningEfforts: { off: null, low: "low", high: "high", max: "max" }, compat: OPENAI_COMPAT },
    "MiniMax-M3": { reasoningEfforts: false },
    "DeepSeek-V4-Pro": { reasoningEfforts: { high: "high", max: "max" }, compat: DEEPSEEK_COMPAT },
    "GLM-5-Turbo": { reasoningEfforts: false },
    "Grok-4.6": { reasoningEfforts: false },
    "gpt-5.6-luna": { reasoningEfforts: { off: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" }, compat: OPENAI_COMPAT }
  }
};

function indentation(line) {
  return line.match(/^\s*/)?.[0].length || 0;
}

function isIgnorable(line) {
  return !line.trim() || line.trim().startsWith("#");
}

function blockEnd(lines, start, parentIndent) {
  let index = start + 1;
  while (index < lines.length) {
    if (!isIgnorable(lines[index]) && indentation(lines[index]) <= parentIndent) break;
    index += 1;
  }
  return index;
}

function providerName(line) {
  const match = line.match(/^\s{4}([^\s:#]+):\s*$/);
  return match?.[1] || null;
}

function modelName(line) {
  const match = line.match(/^\s{8}-\s+id:\s*(.+?)\s*$/);
  if (!match) return null;
  return match[1].replace(/^['"]|['"]$/g, "");
}

function fieldName(line, indent) {
  const match = line.match(new RegExp(`^\\s{${indent}}([^\\s:#]+):(?:\\s|$)`));
  return match?.[1] || null;
}

function formatReasoningEfforts(efforts) {
  if (efforts === false) return ["          reasoningEfforts: false"];
  return [
    "          reasoningEfforts:",
    ...Object.entries(efforts).map(([level, wire]) => `            ${level}:${wire === null ? "" : ` ${wire}`}`)
  ];
}

function formatCompat(compat) {
  if (!compat) return [];
  return [
    "          compat:",
    `            thinkingFormat: ${compat.thinkingFormat}`,
    `            supportsReasoningEffort: ${compat.supportsReasoningEffort}`
  ];
}

function replaceModelFields(block, rule) {
  const kept = [block[0]];
  for (let index = 1; index < block.length;) {
    const line = block[index];
    const key = fieldName(line, 10);
    if (key === "reasoningEfforts" || key === "compat") {
      index = blockEnd(block, index, 10);
      continue;
    }
    kept.push(line);
    index += 1;
  }
  return [kept[0], ...formatReasoningEfforts(rule.reasoningEfforts), ...formatCompat(rule.compat), ...kept.slice(1)];
}

function routeCompatRemoval(lines, providerStart, providerEnd) {
  const removals = [];
  for (let index = providerStart + 1; index < providerEnd;) {
    if (fieldName(lines[index], 6) === "compat") {
      removals.push({ start: index, end: blockEnd(lines, index, 6), replacement: [] });
      index = blockEnd(lines, index, 6);
    } else index += 1;
  }
  return removals;
}

function applyReplacements(lines, replacements) {
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    lines.splice(replacement.start, replacement.end - replacement.start, ...replacement.replacement);
  }
}

export function applyModelCapabilityRules(source) {
  const original = String(source || "");
  if (original.includes(MODEL_CAPABILITY_MARKER)) return { source: original, changed: false, providers: [], models: [] };
  const lines = original.split(/\r?\n/);
  const replacements = [];
  const providers = [];
  const models = [];

  for (let providerStart = 0; providerStart < lines.length; providerStart += 1) {
    const provider = providerName(lines[providerStart]);
    const rules = provider ? MODEL_CAPABILITY_RULES[provider] : null;
    if (!rules) continue;
    const providerEnd = blockEnd(lines, providerStart, 4);
    const modelsIndex = lines.findIndex((line, index) => index > providerStart && index < providerEnd && fieldName(line, 6) === "models");
    if (modelsIndex < 0) continue;
    for (let modelStart = modelsIndex + 1; modelStart < providerEnd;) {
      const model = modelName(lines[modelStart]);
      if (!model) {
        modelStart += 1;
        continue;
      }
      const modelEnd = blockEnd(lines, modelStart, 8);
      const rule = rules[model];
      if (rule) {
        replacements.push({ start: modelStart, end: modelEnd, replacement: replaceModelFields(lines.slice(modelStart, modelEnd), rule) });
        models.push(model);
        if (!providers.includes(provider)) providers.push(provider);
      }
      modelStart = modelEnd;
    }
    if (provider === "gongsi" && providers.includes(provider)) replacements.push(...routeCompatRemoval(lines, providerStart, providerEnd));
    providerStart = providerEnd - 1;
  }

  if (!models.length) return { source: original, changed: false, providers: [], models: [] };
  applyReplacements(lines, replacements);
  lines.unshift(MODEL_CAPABILITY_MARKER);
  return { source: lines.join("\n"), changed: true, providers, models };
}

export function ensureModelCapabilitySettings({ home = process.env.DSH_HOME || join(homedir(), ".dsh"), log = () => {} } = {}) {
  const path = join(home, "settings.yaml");
  if (!existsSync(path)) return { path, changed: false, providers: [], models: [], backup: null };
  const source = readFileSync(path, "utf8");
  const result = applyModelCapabilityRules(source);
  if (!result.changed) return { path, ...result, backup: null };
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const backup = `${path}.bak-model-capabilities-${stamp}`;
  copyFileSync(path, backup);
  writeFileSync(path, result.source, "utf8");
  log(`已按官方模型目录配置思考强度：${result.models.join(", ")}（备份：${backup}）`);
  return { path, ...result, backup };
}
