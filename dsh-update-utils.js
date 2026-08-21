export const DSH_INSTALL_TIMEOUT_MS = 15 * 60 * 1000;

export function dshInstallArgs({ installRoot, packageName }) {
  return [
    "install",
    "--prefix", installRoot,
    "--no-fund",
    "--no-audit",
    "--no-package-lock",
    "--prefer-offline",
    "--fetch-timeout=30000",
    "--fetch-retries=2",
    "--fetch-retry-mintimeout=1000",
    "--fetch-retry-maxtimeout=10000",
    packageName + "@latest",
  ];
}

export function formatDshInstallTimeout(timeoutMs = DSH_INSTALL_TIMEOUT_MS) {
  return `下载并安装 DeepSeek Harness CLI 超过 ${Math.round(timeoutMs / 60000)} 分钟。请检查网络或 npm 代理设置后重试。`;
}
