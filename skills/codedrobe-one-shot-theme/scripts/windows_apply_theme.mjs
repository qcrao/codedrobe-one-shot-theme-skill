#!/usr/bin/env node

/**
 * Apply a CodeDrobe theme through one detached Windows watcher.
 *
 * This script only orchestrates the published @codedrobe/core CLI. It does not
 * inject CSS, modify WindowsApps, or implement CodeDrobe runtime behavior.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseArgs(argv) {
  const options = {
    app: "codex",
    port: 9335,
    appPath: null,
    restartExisting: false,
    dryRun: false,
    platform: process.platform,
    theme: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--restart-existing") options.restartExisting = true;
    else if (value === "--dry-run") options.dryRun = true;
    else if (value === "--theme") options.theme = argv[++index];
    else if (value === "--app") options.app = argv[++index];
    else if (value === "--port") options.port = Number(argv[++index]);
    else if (value === "--app-path") options.appPath = argv[++index];
    else if (value === "--platform") options.platform = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.theme) throw new Error("--theme is required");
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("--port must be an integer from 1 to 65535");
  }
  if (options.platform !== "win32" && !options.dryRun) {
    throw new Error("windows_apply_theme.mjs supports Windows only");
  }
  return options;
}

function psLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function runPowerShell(script, { check = true } = {}) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShell(script)],
    { encoding: "utf8", windowsHide: true },
  );
  if (check && result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `PowerShell exited with ${result.status}`);
  }
  return result;
}

function findRunner({ dryRun }) {
  if (dryRun && process.platform !== "win32") {
    return { executable: "C:\\Program Files\\nodejs\\npx.cmd", prefix: ["--yes", "@codedrobe/core@latest"] };
  }
  for (const name of ["codedrobe.cmd", "codedrobe.exe", "codedrobe"]) {
    const result = spawnSync("where.exe", [name], { encoding: "utf8", windowsHide: true });
    const executable = result.stdout?.split(/\r?\n/).find(Boolean);
    if (result.status === 0 && executable) return { executable, prefix: [] };
  }
  for (const name of ["npx.cmd", "npx.exe", "npx"]) {
    const result = spawnSync("where.exe", [name], { encoding: "utf8", windowsHide: true });
    const executable = result.stdout?.split(/\r?\n/).find(Boolean);
    if (result.status === 0 && executable) {
      return { executable, prefix: ["--yes", "@codedrobe/core@latest"] };
    }
  }
  throw new Error("Neither codedrobe nor npx is available on PATH");
}

function invokeRunner(runner, args, { check = true } = {}) {
  const allArgs = [...runner.prefix, ...args];
  const script = `& ${psLiteral(runner.executable)} @(${allArgs.map(psLiteral).join(",")}); exit $LASTEXITCODE`;
  return runPowerShell(script, { check });
}

function parseJsonOutput(output) {
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Core did not return JSON output");
  return JSON.parse(output.slice(start));
}

function safeId(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "theme";
}

function stopOwnedWorker(pidFile, workerFile) {
  if (!fs.existsSync(pidFile)) return;
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(pidFile, "utf8"));
  } catch {
    return;
  }
  if (!Number.isInteger(metadata.pid)) return;
  const query = [
    `$process = Get-CimInstance Win32_Process -Filter ${psLiteral(`ProcessId = ${metadata.pid}`)}`,
    "if ($process) { $process.CommandLine }",
  ].join("; ");
  const result = runPowerShell(query, { check: false });
  if (result.status !== 0 || !result.stdout.toLowerCase().includes(workerFile.toLowerCase())) return;
  spawnSync("taskkill.exe", ["/PID", String(metadata.pid), "/T", "/F"], {
    encoding: "utf8",
    windowsHide: true,
  });
}

function createWorkerScript(runner, applyArgs) {
  const allArgs = [...runner.prefix, ...applyArgs];
  return [
    "$ErrorActionPreference = 'Stop'",
    `& ${psLiteral(runner.executable)} @(${allArgs.map(psLiteral).join(",")})`,
    "exit $LASTEXITCODE",
    "",
  ].join("\r\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pathApi = options.platform === "win32" ? path.win32 : path;
  const theme = pathApi.resolve(options.theme);
  if (!options.dryRun && !fs.existsSync(theme)) throw new Error(`Theme package does not exist: ${theme}`);

  const runner = findRunner(options);
  let inspectData = { theme: { id: pathApi.basename(theme, ".codedrobe-theme") } };
  let detectData = { installed: true, running: true };

  const detectArgs = ["detect", "--app", options.app, "--json"];
  if (options.appPath) detectArgs.push("--app-path", options.appPath);

  if (!options.dryRun) {
    inspectData = parseJsonOutput(invokeRunner(runner, ["theme", "inspect", theme]).stdout);
    detectData = parseJsonOutput(invokeRunner(runner, detectArgs).stdout);
    if (!detectData.installed) throw new Error(`Target app is not installed: ${options.app}`);
    if (!options.restartExisting) {
      const probeArgs = [
        "probe", "--app", options.app, "--port", String(options.port),
        "--timeout-ms", "5000", "--theme", theme,
      ];
      if (options.appPath) probeArgs.push("--app-path", options.appPath);
      const probe = invokeRunner(runner, probeArgs, { check: false });
      if (probe.status !== 0) {
        throw new Error("Codex is not reachable on the selected CDP port. Rerun with --restart-existing after restart is authorized.");
      }
    }
  }

  const themeId = safeId(inspectData.theme?.id || pathApi.basename(theme, ".codedrobe-theme"));
  const localAppData = process.env.LOCALAPPDATA || path.win32.join("C:\\Users", os.userInfo().username, "AppData", "Local");
  const stateDir = path.win32.join(localAppData, "CodeDrobe", "OneShot");
  const workerFile = path.win32.join(stateDir, `${themeId}-watch.ps1`);
  const pidFile = path.win32.join(stateDir, `${themeId}-watch.json`);
  const stdoutLog = path.win32.join(stateDir, `${themeId}-watch.log`);
  const stderrLog = path.win32.join(stateDir, `${themeId}-watch.err.log`);

  const applyArgs = [
    "apply", "--app", options.app, "--port", String(options.port),
    "--theme", theme, "--watch",
  ];
  if (options.appPath) applyArgs.push("--app-path", options.appPath);
  applyArgs.push(options.restartExisting ? "--restart-existing" : "--no-launch");
  const workerScript = createWorkerScript(runner, applyArgs);

  const plan = {
    theme,
    themeId,
    app: options.app,
    port: options.port,
    appPath: options.appPath,
    restartExisting: options.restartExisting,
    workerFile,
    pidFile,
    stdoutLog,
    stderrLog,
    detected: detectData,
    workerScript,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({ action: "dry-run", ...plan }, null, 2));
    return;
  }

  fs.mkdirSync(stateDir, { recursive: true });
  stopOwnedWorker(pidFile, workerFile);
  fs.writeFileSync(workerFile, workerScript, "utf8");

  const stdoutFd = fs.openSync(stdoutLog, "a");
  const stderrFd = fs.openSync(stderrLog, "a");
  let child;
  try {
    child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", workerFile],
      { detached: true, windowsHide: true, stdio: ["ignore", stdoutFd, stderrFd] },
    );
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
  child.unref();
  fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, workerFile, theme }, null, 2), "utf8");

  let verified = false;
  if (!options.restartExisting) {
    const verifyArgs = ["verify", "--app", options.app, "--port", String(options.port), "--theme", theme];
    if (options.appPath) verifyArgs.push("--app-path", options.appPath);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await delay(1000);
      const result = invokeRunner(runner, verifyArgs, { check: false });
      if (result.status === 0) {
        verified = true;
        break;
      }
    }
  }

  console.log(JSON.stringify({
    action: "submitted",
    verifiedBeforeReturn: verified,
    verificationPendingAfterRestart: options.restartExisting,
    watcherPid: child.pid,
    ...plan,
  }, null, 2));
  if (!options.restartExisting && !verified) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
