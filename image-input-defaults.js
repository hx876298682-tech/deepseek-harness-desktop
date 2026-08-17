import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEEPSEEK_NAME = /deepseek/i;

function indentation(line) {
  return line.match(/^\s*/)?.[0].length || 0;
}

function isKey(line, key) {
  return new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}:\\s*$`).test(line);
}

/**
 * Add the image-capable fallback to hand-declared non-DeepSeek pi-ai routes.
 * Existing explicit `defaultInput` values are intentionally preserved.
 */
export function addDefaultImageInputToSettings(source) {
  const lines = String(source || "").split(/\r?\n/);
  const llmIndex = lines.findIndex((line) => indentation(line) === 0 && isKey(line, "llm-pi-ai"));
  if (llmIndex < 0) return { source: String(source || ""), changed: false, providers: [] };

  let providersIndex = -1;
  for (let index = llmIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const level = indentation(line);
    if (level === 0) break;
    if (level === 2 && isKey(line, "providers")) { providersIndex = index; break; }
  }
  if (providersIndex < 0) return { source: String(source || ""), changed: false, providers: [] };

  const additions = [];
  const providers = [];
  for (let index = providersIndex + 1; index < lines.length;) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) { index += 1; continue; }
    const level = indentation(line);
    if (level <= 2) break;
    if (level !== 4 || !line.trim().endsWith(":")) { index += 1; continue; }

    const provider = line.trim().slice(0, -1).replace(/^['"]|['"]$/g, "");
    const start = index;
    let end = index + 1;
    while (end < lines.length) {
      const next = lines[end];
      if (next.trim() && !next.trim().startsWith("#") && indentation(next) <= 4) break;
      end += 1;
    }
    const block = lines.slice(start, end);
    const hasExplicitDefault = block.some((entry) => indentation(entry) === 6 && /^defaultInput\s*:/.test(entry.trim()));
    if (!DEEPSEEK_NAME.test(provider) && !hasExplicitDefault) {
      additions.push({ index: end, line: "      defaultInput: [text, image]" });
      providers.push(provider);
    }
    index = end;
  }

  for (let index = additions.length - 1; index >= 0; index -= 1) {
    const addition = additions[index];
    lines.splice(addition.index, 0, addition.line);
  }
  return { source: lines.join("\n"), changed: additions.length > 0, providers };
}

export function ensureDefaultImageInputSettings({ home = process.env.DSH_HOME || join(homedir(), ".dsh"), log = () => {} } = {}) {
  const path = join(home, "settings.yaml");
  if (!existsSync(path)) return { path, changed: false, providers: [] };
  const source = readFileSync(path, "utf8");
  const result = addDefaultImageInputToSettings(source);
  if (result.changed) {
    writeFileSync(path, result.source, "utf8");
    for (const provider of result.providers) log(`已为 Provider ${provider} 默认启用图片输入`);
  }
  return { path, changed: result.changed, providers: result.providers };
}

export function watchDefaultImageInputSettings({ home = process.env.DSH_HOME || join(homedir(), ".dsh"), log = () => {} } = {}) {
  const path = join(home, "settings.yaml");
  let timer = null;
  let watcher = null;
  try {
    mkdirSync(home, { recursive: true });
    watcher = watch(home, (_event, filename) => {
      if (filename && String(filename) !== "settings.yaml") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { ensureDefaultImageInputSettings({ home, log }); } catch (error) { log(`图片输入默认配置更新失败：${error.message}`); }
      }, 120);
    });
  } catch (error) {
    log(`无法监听 Harness 配置目录：${error.message}`);
  }
  return () => {
    clearTimeout(timer);
    watcher?.close();
  };
}
