#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const macLabel = 'org.codexskins.codedrobe.active';

function parseArgs(argv) {
  const options = {
    theme: null,
    app: 'codex',
    appPath: null,
    port: 9335,
    restartExisting: false,
    readyTimeoutMs: 45000,
    dryRun: false,
    platform: process.platform,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--theme') options.theme = argv[++index];
    else if (value === '--app') options.app = argv[++index];
    else if (value === '--app-path') options.appPath = argv[++index];
    else if (value === '--port') options.port = Number(argv[++index]);
    else if (value === '--restart-existing') options.restartExisting = true;
    else if (value === '--ready-timeout-ms') options.readyTimeoutMs = Number(argv[++index]);
    else if (value === '--dry-run') options.dryRun = true;
    else if (value === '--platform') options.platform = argv[++index];
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!options.theme) throw new Error('--theme is required');
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('--port is invalid');
  if (!Number.isInteger(options.readyTimeoutMs) || options.readyTimeoutMs < 0 || options.readyTimeoutMs > 120000) {
    throw new Error('--ready-timeout-ms must be between 0 and 120000');
  }
  if (!['darwin', 'win32'].includes(options.platform)) throw new Error('Only macOS and Windows are supported');
  return options;
}

function managedRoot(platform = process.platform) {
  if (process.env.CODEXSKINS_HOME) return path.resolve(process.env.CODEXSKINS_HOME);
  if (platform === 'win32') {
    return path.win32.join(process.env.LOCALAPPDATA || path.win32.join('C:\\Users', os.userInfo().username, 'AppData', 'Local'), 'CodexSkins');
  }
  return path.join(os.homedir(), '.codexskins');
}

function findRunner(options) {
  if (options.dryRun && options.platform !== process.platform) {
    return options.platform === 'win32'
      ? { executable: 'C:\\Program Files\\nodejs\\npx.cmd', prefix: ['--yes', '@codedrobe/core@latest'] }
      : { executable: '/usr/local/bin/npx', prefix: ['--yes', '@codedrobe/core@latest'] };
  }
  const lookup = spawnSync(options.platform === 'win32' ? 'where.exe' : 'which', ['codedrobe'], { encoding: 'utf8', windowsHide: true });
  const global = lookup.status === 0 ? lookup.stdout.split(/\r?\n/).find(Boolean) : null;
  if (global) return { executable: global, prefix: [] };
  return { executable: options.platform === 'win32' ? 'npx.cmd' : 'npx', prefix: ['--yes', '@codedrobe/core@latest'] };
}

function run(runner, args, { check = true } = {}) {
  const result = spawnSync(runner.executable, [...runner.prefix, ...args], { encoding: 'utf8', windowsHide: true });
  if (check && result.status !== 0) throw new Error(result.stderr || result.stdout || `Command exited with ${result.status}`);
  return result;
}

function parseJson(output) {
  const start = output.indexOf('{');
  if (start < 0) throw new Error('CodeDrobe did not return JSON');
  return JSON.parse(output.slice(start));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForThemeReady(runner, options, theme) {
  if (options.readyTimeoutMs === 0) return { ready: false, elapsedMs: 0, reason: 'readiness wait disabled' };
  const startedAt = Date.now();
  const deadline = startedAt + options.readyTimeoutMs;
  let attempts = 0;
  let lastMessage = null;

  // A restarted Electron renderer needs a moment to expose CDP before Core can
  // distinguish "not ready yet" from a genuine compatibility failure.
  await delay(Math.min(1000, options.readyTimeoutMs));
  while (Date.now() < deadline) {
    attempts += 1;
    const verify = run(runner, [
      'verify', '--app', options.app, '--port', String(options.port), '--theme', theme,
    ], { check: false });
    if (verify.status === 0) {
      const payload = parseJson(verify.stdout);
      return {
        ready: true,
        attempts,
        elapsedMs: Date.now() - startedAt,
        targets: (payload.targets || []).map(({ targetId, result }) => ({
          targetId,
          pass: result?.pass === true,
          installed: result?.installed === true,
          themeId: result?.themeId ?? null,
          version: result?.version ?? null,
        })),
      };
    }
    lastMessage = String(verify.stderr || verify.stdout || `verify exited with ${verify.status}`).trim().slice(-1200);
    if (Date.now() < deadline) await delay(Math.min(1000, Math.max(0, deadline - Date.now())));
  }
  return { ready: false, attempts, elapsedMs: Date.now() - startedAt, reason: lastMessage || 'readiness timeout' };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

// launchd re-runs submitted jobs whenever their process exits. The watcher is
// meant to stay alive, but if it crashes after being submitted with
// --restart-existing, every re-run would kill and relaunch Codex again. A
// marker file gates the restart to the first run only; re-runs re-attach with
// --no-launch.
export function macWatcherShellCommand({ watchCommand, restartCommand, markerFile }) {
  if (!restartCommand) return watchCommand;
  const marker = shellQuote(markerFile);
  return `if [ -e ${marker} ]; then ${watchCommand}; else /usr/bin/touch ${marker}; ${restartCommand}; fi`;
}

function powershellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function encodePowerShell(source) {
  return Buffer.from(source, 'utf16le').toString('base64');
}

function runPowerShell(source, { check = true } = {}) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(source)], {
    encoding: 'utf8', windowsHide: true,
  });
  if (check && result.status !== 0) throw new Error(result.stderr || result.stdout || `PowerShell exited with ${result.status}`);
  return result;
}

function stopWindowsWorker(pidFile, workerFile) {
  if (!fs.existsSync(pidFile)) return false;
  let metadata;
  try { metadata = JSON.parse(fs.readFileSync(pidFile, 'utf8')); } catch { return false; }
  if (!Number.isInteger(metadata.pid)) return false;
  const query = `$p = Get-CimInstance Win32_Process -Filter ${powershellQuote(`ProcessId = ${metadata.pid}`)}; if ($p) { $p.CommandLine }`;
  const result = runPowerShell(query, { check: false });
  if (result.status !== 0 || !result.stdout.toLowerCase().includes(workerFile.toLowerCase())) return false;
  spawnSync('taskkill.exe', ['/PID', String(metadata.pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true });
  return true;
}

function stopLegacyWindowsWorkers() {
  const legacyDir = path.win32.join(
    process.env.LOCALAPPDATA || path.win32.join('C:\\Users', os.userInfo().username, 'AppData', 'Local'),
    'CodeDrobe', 'OneShot',
  );
  if (!fs.existsSync(legacyDir)) return [];
  const stopped = [];
  for (const name of fs.readdirSync(legacyDir).filter((item) => item.endsWith('-watch.json'))) {
    const pidFile = path.win32.join(legacyDir, name);
    const workerFile = path.win32.join(legacyDir, name.replace(/\.json$/, '.ps1'));
    if (stopWindowsWorker(pidFile, workerFile)) stopped.push(name);
  }
  return stopped;
}

function stopLegacyMacWatchers() {
  const listed = spawnSync('launchctl', ['list'], { encoding: 'utf8' });
  if (listed.status !== 0) return [];
  const labels = listed.stdout.split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).at(-1))
    .filter((label) => label?.startsWith('com.codedrobe.one-shot.'));
  for (const label of labels) spawnSync('launchctl', ['remove', label], { encoding: 'utf8' });
  return labels;
}

function writeActiveState(root, state, platform) {
  const pathApi = platform === 'win32' ? path.win32 : path;
  const stateDir = pathApi.join(root, 'state');
  const stateFile = pathApi.join(stateDir, 'active.json');
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({
    ...state,
    previousThemeId: previous?.themeId ?? null,
    previousTheme: previous?.theme ?? null,
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  return stateFile;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pathApi = options.platform === 'win32' ? path.win32 : path;
  const theme = pathApi.resolve(options.theme);
  if (!options.dryRun && !fs.existsSync(theme)) throw new Error(`Theme package does not exist: ${theme}`);
  const runner = findRunner(options);
  let inspection = { theme: { id: pathApi.basename(theme, '.codedrobe-theme') } };
  let detected = { installed: true, running: true };

  if (!options.dryRun) {
    inspection = parseJson(run(runner, ['theme', 'inspect', theme]).stdout);
    const detectArgs = ['detect', '--app', options.app, '--json'];
    if (options.appPath) detectArgs.push('--app-path', options.appPath);
    detected = parseJson(run(runner, detectArgs).stdout);
    if (!detected.installed) throw new Error(`Target app is not installed: ${options.app}`);
    if (!options.restartExisting) {
      const probe = run(runner, ['probe', '--app', options.app, '--port', String(options.port), '--timeout-ms', '5000', '--theme', theme], { check: false });
      if (probe.status !== 0) {
        throw new Error('Codex is not reachable on the selected CDP port. Ask for restart permission, then rerun with --restart-existing.');
      }
    }
  }

  const themeId = String(inspection.theme?.id || pathApi.basename(theme, '.codedrobe-theme'));
  const launchFlag = options.restartExisting ? '--restart-existing' : '--no-launch';
  const applyArgs = ['apply', '--app', options.app, '--port', String(options.port), '--theme', theme, '--watch'];
  if (options.appPath) applyArgs.push('--app-path', options.appPath);
  const root = managedRoot(options.platform);

  if (options.platform === 'darwin') {
    const logDir = path.join(os.homedir(), 'Library', 'Logs', 'CodexSkins');
    const stdoutLog = path.join(logDir, 'active-watch.log');
    const stderrLog = path.join(logDir, 'active-watch.err.log');
    const stateDir = path.join(root, 'state');
    const restartMarker = path.join(stateDir, 'active-watch.restarted');
    const quoteCommand = (args) => [runner.executable, ...runner.prefix, ...args].map(shellQuote).join(' ');
    const command = macWatcherShellCommand({
      watchCommand: quoteCommand([...applyArgs, '--no-launch']),
      restartCommand: options.restartExisting ? quoteCommand([...applyArgs, '--restart-existing']) : null,
      markerFile: restartMarker,
    });
    const plan = { platform: 'macos', theme, themeId, watcher: macLabel, stdoutLog, stderrLog, command, restartExisting: options.restartExisting };
    if (options.dryRun) return console.log(JSON.stringify({ action: 'dry-run', ...plan }, null, 2));
    fs.mkdirSync(logDir, { recursive: true });
    fs.mkdirSync(stateDir, { recursive: true });
    fs.rmSync(restartMarker, { force: true });
    spawnSync('launchctl', ['remove', macLabel], { encoding: 'utf8' });
    const legacyWatchersStopped = stopLegacyMacWatchers();
    run({ executable: 'launchctl', prefix: [] }, ['submit', '-l', macLabel, '-o', stdoutLog, '-e', stderrLog, '--', '/bin/zsh', '-lc', command]);
    const stateFile = writeActiveState(root, { themeId, theme, platform: 'macos', watcher: macLabel, stdoutLog, stderrLog }, options.platform);
    const readiness = await waitForThemeReady(runner, options, theme);
    return console.log(JSON.stringify({
      action: readiness.ready ? 'applied' : 'submitted',
      verificationPending: !readiness.ready,
      readiness,
      legacyWatchersStopped,
      stateFile,
      ...plan,
    }, null, 2));
  }

  const stateDir = path.win32.join(root, 'state');
  const workerFile = path.win32.join(stateDir, 'active-watch.ps1');
  const pidFile = path.win32.join(stateDir, 'active-watch.json');
  const stdoutLog = path.win32.join(stateDir, 'active-watch.log');
  const stderrLog = path.win32.join(stateDir, 'active-watch.err.log');
  const allArgs = [...runner.prefix, ...applyArgs, launchFlag];
  const worker = `$ErrorActionPreference = 'Stop'\r\n& ${powershellQuote(runner.executable)} @(${allArgs.map(powershellQuote).join(',')})\r\nexit $LASTEXITCODE\r\n`;
  const plan = { platform: 'windows', theme, themeId, workerFile, pidFile, stdoutLog, stderrLog, restartExisting: options.restartExisting, worker };
  if (options.dryRun) return console.log(JSON.stringify({ action: 'dry-run', ...plan }, null, 2));
  fs.mkdirSync(stateDir, { recursive: true });
  stopWindowsWorker(pidFile, workerFile);
  const legacyWatchersStopped = stopLegacyWindowsWorkers();
  fs.writeFileSync(workerFile, worker, 'utf8');
  const stdoutFd = fs.openSync(stdoutLog, 'a');
  const stderrFd = fs.openSync(stderrLog, 'a');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', workerFile], {
    detached: true, windowsHide: true, stdio: ['ignore', stdoutFd, stderrFd],
  });
  child.unref();
  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);
  fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, workerFile, theme }, null, 2), 'utf8');
  const stateFile = writeActiveState(root, { themeId, theme, platform: 'windows', workerFile, pidFile, stdoutLog, stderrLog }, options.platform);
  const readiness = await waitForThemeReady(runner, options, theme);
  console.log(JSON.stringify({
    action: readiness.ready ? 'applied' : 'submitted',
    verificationPending: !readiness.ready,
    readiness,
    watcherPid: child.pid,
    legacyWatchersStopped,
    stateFile,
    ...plan,
  }, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
