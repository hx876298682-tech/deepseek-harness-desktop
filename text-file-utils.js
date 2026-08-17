import { extname } from "node:path";

export const MAX_TEXT_FILES = 5;
export const MAX_TEXT_FILE_BYTES = 1024 * 1024;
export const MAX_TEXT_FILES_BYTES = 4 * 1024 * 1024;

export const TEXT_FILE_EXTENSIONS = new Set([
  ".txt", ".md", ".mdx", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm", ".css",
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".h", ".cpp", ".cc", ".cs",
  ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".kts", ".sh", ".bash", ".zsh", ".sql", ".vue", ".svelte",
  ".toml", ".ini", ".conf", ".env", ".log", ".rst", ".tex", ".dockerfile",
]);

export function isSupportedTextFile(name) {
  const basename = String(name || "").split(/[\\/]/).pop() || "";
  return basename.toLowerCase() === "dockerfile" || TEXT_FILE_EXTENSIONS.has(extname(basename).toLowerCase());
}

export function validateTextFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return "请选择至少一个文本文件。";
  if (files.length > MAX_TEXT_FILES) return `一次最多选择 ${MAX_TEXT_FILES} 个文件。`;
  let total = 0;
  for (const file of files) {
    const name = String(file?.name || "");
    const size = Number(file?.size);
    if (!isSupportedTextFile(name)) return `不支持“${name || "未命名文件"}”。请选择文本、Markdown、JSON、CSV 或常见代码文件。`;
    if (!Number.isFinite(size) || size < 0) return `无法读取“${name}”的大小。`;
    if (size > MAX_TEXT_FILE_BYTES) return `“${name}”超过 1 MB，暂不支持发送。`;
    total += size;
  }
  if (total > MAX_TEXT_FILES_BYTES) return `所选文件总大小超过 4 MB，暂不支持发送。`;
  return null;
}

export function isProbablyText(buffer) {
  return !Buffer.from(buffer).subarray(0, 8192).includes(0);
}

export function formatTextFiles(files) {
  return files.map(({ name, content }) => `\n\n--- 文件：${name} ---\n${content}\n--- 文件结束：${name} ---`).join("");
}
