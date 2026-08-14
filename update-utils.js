const VERSION_PATTERN = /v?(\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?)/;

export function parseVersion(value) {
  const match = String(value || "").trim().match(VERSION_PATTERN);
  return match ? match[1] : null;
}

export function compareVersions(a, b) {
  const parse = (value) => {
    const [base, pre = ""] = String(value || "0.0.0").replace(/^v/, "").split("-", 2);
    return { base: base.split(".").map((part) => Number.parseInt(part, 10) || 0), pre: pre ? pre.split(".") : [] };
  };
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    if ((left.base[index] || 0) !== (right.base[index] || 0)) return (left.base[index] || 0) > (right.base[index] || 0) ? 1 : -1;
  }
  if (!left.pre.length && !right.pre.length) return 0;
  if (!left.pre.length) return 1;
  if (!right.pre.length) return -1;
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    const leftPart = left.pre[index];
    const rightPart = right.pre[index];
    if (leftPart === rightPart) continue;
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null) return leftNumber > rightNumber ? 1 : -1;
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

export function pickDesktopAsset(assets, { platform = process.platform, arch = process.arch } = {}) {
  const rows = (Array.isArray(assets) ? assets : []).filter((asset) => asset && asset.name && asset.browser_download_url);
  const ignore = /\.(blockmap|yml|yaml|json|txt|sha256|asc)$/i;
  const usable = rows.filter((asset) => !ignore.test(asset.name));
  const extensions = platform === "darwin" ? [".dmg", ".zip"] : platform === "win32" ? [".exe", ".msi"] : [".appimage", ".deb", ".rpm"];
  const archTokens = arch === "arm64" ? ["arm64", "aarch64"] : ["x64", "amd64", "x86_64", "intel"];
  const byExtension = usable.filter((asset) => extensions.some((extension) => asset.name.toLowerCase().endsWith(extension)));
  const scored = byExtension.map((asset) => {
    const name = asset.name.toLowerCase();
    let score = 0;
    if (archTokens.some((token) => name.includes(token))) score += 10;
    if (name.includes("universal")) score += 6;
    if (platform === "darwin" && name.endsWith(".dmg")) score += 2;
    if (platform === "darwin" && name.endsWith(".zip")) score += 1;
    if (arch === "arm64" && /x64|amd64|x86_64|intel/.test(name) && !/arm64|aarch64/.test(name)) score -= 20;
    if (arch !== "arm64" && /arm64|aarch64/.test(name)) score -= 20;
    return { asset, score };
  }).sort((left, right) => right.score - left.score);
  if (scored[0] && scored[0].score > 0) return scored[0].asset;
  return byExtension.length === 1 ? byExtension[0] : null;
}
