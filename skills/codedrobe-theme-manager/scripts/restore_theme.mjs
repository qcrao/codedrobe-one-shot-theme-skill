#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const macWatcherLabel = 'org.codexskins.codedrobe.active';
const macRestartLabel = 'org.codexskins.codedrobe.native-restart';

function parseArgs(argv) {
  const options = {
    app: 'codex',
    port: 9335,
    restartExisting: false,
    dryRun: false,
    platform: process.platform,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--app') options.app = argv[++index];
    else if (value === '--port') options.port = Number(argv[++index]);
    else if (value === '--restart-existing') options.restartExisting = true;
    else if (value === '--dry-run') options.dryRun = true;
    else if (value === '--platform') options.platform = argv[++index];
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('--port is invalid');
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

function runner(options) {
  if (options.dryRun && options.platform !== process.platform) {
    return options.platform === 'win32'
      ? { executable: 'C:\\Program Files\\nodejs\\npx.cmd', prefix: ['--yes', '@codedrobe/core@latest'] }
      : { executable: '/usr/local/bin/npx', prefix: ['--yes', '@codedrobe/core@latest'] };
  }
  const lookup = spawnSync(options.platform === 'win32' ? 'where.exe' : 'which', ['codedrobe'], { encoding: 'utf8', windowsHide: true });
  const global = lookup.status === 0 ? lookup.stdout.split(/\r?\n/).find(Boolean) : null;
  return global
    ? { executable: global, prefix: [] }
    : { executable: options.platform === 'win32' ? 'npx.cmd' : 'npx', prefix: ['--yes', '@codedrobe/core@latest'] };
}

function parseJson(output) {
  const start = output.indexOf('{');
  if (start < 0) throw new Error('CodeDrobe did not return JSON');
  return JSON.parse(output.slice(start));
}

export function classifyRestore(payload, app = 'codex') {
  const hostChanged = payload.host?.changed === true;
  return {
    rendererRestored: payload.renderer?.restored === true,
    hostRestored: payload.host?.restored === true,
    hostChanged,
    restartRequired: app === 'codex' && hostChanged,
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

// launchd re-runs submitted jobs whenever their process exits, so a one-shot
// restart must remove its own label as its final step or Codex gets killed and
// relaunched in an endless loop.
export function macRestartShellCommand(command, label) {
  return `/bin/sleep 1; ${command}; /bin/launchctl remove ${shellQuote(label)}`;
}

function powershellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function encodePowerShell(source) {
  return Buffer.from(source, 'utf16le').toString('base64');
}

function listMacLabels() {
  const listed = spawnSync('launchctl', ['list'], { encoding: 'utf8' });
  if (listed.status !== 0) return [];
  return listed.stdout.split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).at(-1))
    .filter(Boolean);
}

function stopMacLabel(label) {
  const existed = listMacLabels().includes(label);
  spawnSync('launchctl', ['remove', label], { encoding: 'utf8' });
  if (listMacLabels().includes(label)) {
    const uid = spawnSync('id', ['-u'], { encoding: 'utf8' }).stdout.trim();
    if (uid) spawnSync('launchctl', ['bootout', `gui/${uid}/${label}`], { encoding: 'utf8' });
    spawnSync('launchctl', ['remove', label], { encoding: 'utf8' });
  }
  return { existed, stopped: !listMacLabels().includes(label) };
}

function stopWindowsWorker(pidFile, workerFile) {
  if (!fs.existsSync(pidFile)) return false;
  let metadata;
  try { metadata = JSON.parse(fs.readFileSync(pidFile, 'utf8')); } catch { return false; }
  if (!Number.isInteger(metadata.pid)) return false;
  const query = `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${metadata.pid}\").CommandLine`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', query], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || !result.stdout.toLowerCase().includes(workerFile.toLowerCase())) return false;
  spawnSync('taskkill.exe', ['/PID', String(metadata.pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true });
  return true;
}

function stopWatchers(base, options) {
  if (options.platform === 'darwin') {
    const owned = stopMacLabel(macWatcherLabel);
    const staleRestart = stopMacLabel(macRestartLabel);
    const legacy = listMacLabels().filter((label) => label.startsWith('com.codedrobe.one-shot.'));
    const legacyResults = legacy.map((label) => ({ label, ...stopMacLabel(label) }));
    return {
      stopped: owned.existed || staleRestart.existed || legacyResults.some((item) => item.existed),
      remaining: [macWatcherLabel, macRestartLabel, ...legacy].filter((label) => listMacLabels().includes(label)),
    };
  }

  const candidates = [[
    path.win32.join(base, 'state', 'active-watch.json'),
    path.win32.join(base, 'state', 'active-watch.ps1'),
  ]];
  const legacyDir = path.win32.join(
    process.env.LOCALAPPDATA || path.win32.join('C:\\Users', os.userInfo().username, 'AppData', 'Local'),
    'CodeDrobe', 'OneShot',
  );
  if (fs.existsSync(legacyDir)) {
    for (const name of fs.readdirSync(legacyDir).filter((item) => item.endsWith('-watch.json'))) {
      candidates.push([path.win32.join(legacyDir, name), path.win32.join(legacyDir, name.replace(/\.json$/, '.ps1'))]);
    }
  }
  let stopped = false;
  for (const [pidFile, workerFile] of candidates) {
    if (stopWindowsWorker(pidFile, workerFile)) stopped = true;
  }
  return { stopped, remaining: [] };
}

function restartPlan(core, options) {
  const args = [...core.prefix, 'launch', '--app', options.app, '--port', String(options.port), '--restart-existing'];
  if (options.platform === 'darwin') {
    const logDir = path.join(os.homedir(), 'Library', 'Logs', 'CodexSkins');
    return {
      platform: 'macos',
      label: macRestartLabel,
      stdoutLog: path.join(logDir, 'native-restart.log'),
      stderrLog: path.join(logDir, 'native-restart.err.log'),
      command: [core.executable, ...args].map(shellQuote).join(' '),
    };
  }
  const stateDir = path.win32.join(managedRoot(options.platform), 'state');
  return {
    platform: 'windows',
    stdoutLog: path.win32.join(stateDir, 'native-restart.log'),
    stderrLog: path.win32.join(stateDir, 'native-restart.err.log'),
    executable: core.executable,
    args,
  };
}

function submitRestart(core, options) {
  const plan = restartPlan(core, options);
  if (options.platform === 'darwin') {
    fs.mkdirSync(path.dirname(plan.stdoutLog), { recursive: true });
    stopMacLabel(plan.label);
    const delayedCommand = macRestartShellCommand(plan.command, plan.label);
    const submitted = spawnSync('launchctl', [
      'submit', '-l', plan.label, '-o', plan.stdoutLog, '-e', plan.stderrLog,
      '--', '/bin/zsh', '-lc', delayedCommand,
    ], { encoding: 'utf8' });
    if (submitted.status !== 0) throw new Error(submitted.stderr || submitted.stdout || 'Could not submit Codex restart');
    return { ...plan, submitted: true };
  }

  fs.mkdirSync(path.dirname(plan.stdoutLog), { recursive: true });
  const source = `$ErrorActionPreference = 'Stop'\r\nStart-Sleep -Milliseconds 1000\r\n& ${powershellQuote(plan.executable)} @(${plan.args.map(powershellQuote).join(',')})\r\nexit $LASTEXITCODE\r\n`;
  const stdoutFd = fs.openSync(plan.stdoutLog, 'a');
  const stderrFd = fs.openSync(plan.stderrLog, 'a');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(source)], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', stdoutFd, stderrFd],
  });
  child.unref();
  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);
  return { ...plan, submitted: true, pid: child.pid };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const base = managedRoot(options.platform);
  const core = runner(options);

  if (options.dryRun) {
    console.log(JSON.stringify({
      action: 'dry-run',
      app: options.app,
      port: options.port,
      restartExisting: options.restartExisting,
      restart: options.restartExisting ? restartPlan(core, options) : null,
    }, null, 2));
    return;
  }

  const watchers = stopWatchers(base, options);
  const restored = spawnSync(core.executable, [...core.prefix, 'restore', '--app', options.app, '--port', String(options.port)], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const activeFile = path.join(base, 'state', 'active.json');
  fs.rmSync(activeFile, { force: true });
  fs.rmSync(path.join(base, 'state', 'active-watch.restarted'), { force: true });

  if (restored.status !== 0) {
    console.log(JSON.stringify({
      status: 'watcher-stopped',
      watcherStopped: watchers.stopped,
      watcherRemaining: watchers.remaining,
      restartRequired: true,
      note: 'Core could not reach a live renderer. Fully quit and reopen Codex to return to the native appearance.',
      coreError: (restored.stderr || restored.stdout).trim(),
    }, null, 2));
    return;
  }

  const payload = parseJson(restored.stdout);
  const outcome = classifyRestore(payload, options.app);
  const { restartRequired } = outcome;
  if (restartRequired && !options.restartExisting) {
    console.log(JSON.stringify({
      status: 'restart-required',
      watcherStopped: watchers.stopped,
      watcherRemaining: watchers.remaining,
      rendererRestored: outcome.rendererRestored,
      hostRestored: outcome.hostRestored,
      restartRequired: true,
      note: 'Theme injection is gone and the native Codex appearance is restored on disk. Fully quit and reopen Codex to clear the cached theme colors, or rerun with --restart-existing after the user authorizes restart.',
    }, null, 2));
    return;
  }

  const restart = restartRequired ? submitRestart(core, options) : null;
  console.log(JSON.stringify({
    status: restart ? 'restart-submitted' : 'native',
    watcherStopped: watchers.stopped,
    watcherRemaining: watchers.remaining,
    rendererRestored: outcome.rendererRestored,
    hostRestored: outcome.hostRestored,
    restartRequired,
    restartSubmitted: Boolean(restart),
    restart,
  }, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
