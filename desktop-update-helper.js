import { basename, dirname, win32 } from "node:path";

function quotePosix(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function updateCommand({ platform, sourcePath, targetPath, restartPath }) {
  if (platform === "darwin") {
    const backupPath = `${targetPath}.previous`;
    const mountPath = `${sourcePath}.mount`;
    return {
      command: "/bin/sh",
      args: ["-c", [
        "sleep 2",
        `rm -rf ${quotePosix(mountPath)} && mkdir -p ${quotePosix(mountPath)}`,
        `if ! hdiutil attach -nobrowse -readonly -mountpoint ${quotePosix(mountPath)} ${quotePosix(sourcePath)} >/dev/null; then rm -rf ${quotePosix(mountPath)}; exit 1; fi`,
        `app=$(find ${quotePosix(mountPath)} -maxdepth 1 -name '*.app' -print -quit)`,
        `if [ -z "$app" ]; then hdiutil detach ${quotePosix(mountPath)} >/dev/null || true; rm -rf ${quotePosix(mountPath)}; exit 1; fi`,
        `rm -rf ${quotePosix(backupPath)}`,
        `if [ -d ${quotePosix(targetPath)} ]; then mv ${quotePosix(targetPath)} ${quotePosix(backupPath)}; fi`,
        `if ! cp -R "$app" ${quotePosix(targetPath)}; then rm -rf ${quotePosix(targetPath)}; [ -d ${quotePosix(backupPath)} ] && mv ${quotePosix(backupPath)} ${quotePosix(targetPath)}; hdiutil detach ${quotePosix(mountPath)} >/dev/null || true; rm -rf ${quotePosix(mountPath)}; exit 1; fi`,
        `hdiutil detach ${quotePosix(mountPath)} >/dev/null || true`,
        `rm -rf ${quotePosix(mountPath)} ${quotePosix(backupPath)} ${quotePosix(sourcePath)}`,
        `open ${quotePosix(targetPath)}`,
      ].join("; ")],
    };
  }
  if (platform === "win32") {
    const backupPath = `${targetPath}.previous`;
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", [
        "Start-Sleep -Seconds 2",
        `Remove-Item -LiteralPath ${quotePowerShell(backupPath)} -Recurse -Force -ErrorAction SilentlyContinue`,
        `if (Test-Path -LiteralPath ${quotePowerShell(targetPath)}) { Move-Item -LiteralPath ${quotePowerShell(targetPath)} -Destination ${quotePowerShell(backupPath)} -Force }`,
        `try { Start-Process -FilePath ${quotePowerShell(sourcePath)} -ArgumentList '/S' -Wait; Remove-Item -LiteralPath ${quotePowerShell(backupPath)} -Recurse -Force -ErrorAction SilentlyContinue; Start-Process -FilePath ${quotePowerShell(restartPath)} } catch { if (Test-Path -LiteralPath ${quotePowerShell(backupPath)}) { Move-Item -LiteralPath ${quotePowerShell(backupPath)} -Destination ${quotePowerShell(targetPath)} -Force }; throw }`,
      ].join("; ")],
    };
  }
  if (platform === "linux") {
    const backupPath = `${targetPath}.previous`;
    return {
      command: "/bin/sh",
      args: ["-c", [
        "sleep 2",
        `mv ${quotePosix(targetPath)} ${quotePosix(backupPath)}`,
        `if ! cp ${quotePosix(sourcePath)} ${quotePosix(targetPath)}; then mv ${quotePosix(backupPath)} ${quotePosix(targetPath)}; exit 1; fi`,
        `chmod +x ${quotePosix(targetPath)}`,
        `rm -f ${quotePosix(backupPath)}`,
        `${quotePosix(targetPath)} >/dev/null 2>&1 &`,
      ].join("; ")],
    };
  }
  throw new Error(`不支持自动更新的平台：${platform}`);
}

export function installedTarget({ platform, execPath }) {
  if (platform === "darwin") {
    const marker = "/Contents/MacOS/";
    const index = String(execPath).indexOf(marker);
    if (index < 0) throw new Error("无法确定 macOS 应用安装位置");
    return String(execPath).slice(0, index);
  }
  if (platform === "linux") return String(execPath);
  if (platform === "win32") return win32.dirname(String(execPath));
  throw new Error(`不支持自动更新的平台：${platform}`);
}

export function downloadFilename(version, assetName) {
  return `${version}-${basename(String(assetName)).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
