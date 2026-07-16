# Windows Codex target

Use app id `codex` and the default loopback CDP port reported by
`codedrobe apps --json` (currently `9335`). Pass an explicit port consistently
when the user supplies one.

## Current support boundary

CodeDrobe Core implements Windows Appx/candidate-path discovery, process
detection, restart, and detached Electron launch. Its upstream status currently
marks Windows discovery and launch as implemented but still awaiting Windows
hardware verification. Treat this Skill's Windows path as beta and state the
actual verification performed.

## Discovery

Run:

```powershell
codedrobe apps --json
codedrobe detect --app codex --json
```

Core first resolves the configured Appx package and then explicit executable
candidates. When automatic discovery fails and the user supplied a custom
installation, pass the same absolute `--app-path` to detect and every later
command. Never edit, replace, re-sign, or take ownership of WindowsApps files.

## One-shot apply

When the user authorized installation/restart, run from PowerShell:

```powershell
node scripts/windows_apply_theme.mjs `
  --theme C:\absolute\theme.codedrobe-theme `
  --restart-existing
```

The helper:

1. inspects the package and detects Codex through Core;
2. creates a theme-owned worker under `%LOCALAPPDATA%\CodeDrobe\OneShot`;
3. starts a hidden detached PowerShell process running Core
   `apply --watch --restart-existing`;
4. records a PID only for that owned worker;
5. writes stdout/stderr logs for post-restart readback.

It does not create a scheduled task, require administrator rights, change the
system execution policy, or patch the application bundle. `-ExecutionPolicy
Bypass` applies only to the hidden worker process that runs the generated local
script.

If restart is not authorized, omit `--restart-existing`; the helper then
requires an already reachable CDP renderer and verifies installation before
returning.

## State and recovery

Core stores the transactional Codex appearance backup at:

```text
%LOCALAPPDATA%\CodeDrobe\config.before-codedrobe.toml
```

The helper stores only its watcher script, PID metadata, and logs under:

```text
%LOCALAPPDATA%\CodeDrobe\OneShot\
```

Restore through Core:

```powershell
codedrobe restore --app codex --port 9335
```

Do not manually edit the Codex config or delete application data as a restore
mechanism.
