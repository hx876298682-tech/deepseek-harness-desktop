import { parseVersion } from "./update-utils.js";

export function isGitHubRateLimit(error) {
  return Number(error?.status) === 403 && /rate limit/i.test(String(error?.message || ""));
}

export function latestTagFromLocation(value) {
  try {
    const url = new URL(String(value));
    const match = url.pathname.match(/^\/[^/]+\/[^/]+\/releases\/tag\/(v?[^/]+)$/);
    const version = match?.[1] ? parseVersion(match[1]) : null;
    return version || null;
  } catch {
    return null;
  }
}

export function fallbackAsset({ version, platform, arch, repository }) {
  const suffix = platform === "darwin"
    ? `${arch === "arm64" ? "arm64" : "x64"}.dmg`
    : platform === "win32"
      ? "x64.exe"
      : platform === "linux"
        ? "x64.AppImage"
        : null;
  if (!suffix) return null;
  const name = `DeepSeekHarnessDesktop-${version}-${suffix}`;
  return {
    name,
    browser_download_url: `https://github.com/${repository}/releases/download/v${version}/${name}`,
    size: 0,
  };
}
