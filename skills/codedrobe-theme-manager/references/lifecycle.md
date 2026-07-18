# Theme lifecycle and owned state

## Managed paths

- packages: `~/.codexskins/themes/<id>/<id>.codedrobe-theme`
- active state: `~/.codexskins/state/active.json`
- macOS watcher: `org.codexskins.codedrobe.active`
- macOS logs: `~/Library/Logs/CodexSkins/`
- Windows watcher state: `%LOCALAPPDATA%\CodexSkins\state\`

`CODEXSKINS_HOME` overrides the managed root for tests only.

## Evidence levels

Keep these claims separate:

1. downloaded: bytes landed locally
2. inspected: CodeDrobe accepted the data-only package structure
3. submitted: one owned watcher started and the bounded readiness wait begins
4. applied: Core found the expected theme id/version and required checks passed
5. visually verified: screenshot and route/state inspection passed
6. restore-submitted: watcher stopped and Core restored renderer/host state
7. native: Codex restarted when host appearance changed, then a fresh snapshot
   confirmed no theme markers or cached theme colors

## Switching

The apply helper uses one fixed watcher owner. Replacing the watcher prevents
old themes from reinjecting after a route or renderer change. The active-state
file records the current and previous package paths for diagnosis; restoration
always stops the watcher before calling Core.

For migration, apply and restore also stop watcher labels/workers created by
older versions of `codedrobe-one-shot-theme`, but only after verifying that the
process metadata points to that workflow's owned helper.

## Failure handling

- No CDP endpoint without restart permission: stop and ask; do not add
  `--restart-existing` silently.
- Verification fails after restart: inspect the owned watcher logs, then check
  `codedrobe detect` and `codedrobe probe` before retrying.
- Store-packaged Windows build rejects debugging flags: report the limitation;
  never modify WindowsApps.
- Restore cannot reach a renderer: stop the watcher and tell the user a full
  Codex quit/reopen returns to native state.
- Core restore reports `host.changed: true`: the on-disk backup is restored,
  but the live Codex process can retain the old base palette. Return
  `restart-required`; after permission, rerun the helper with
  `--restart-existing` and verify the restarted renderer.
- A watcher label remains after `launchctl remove`: use the helper's owned-label
  cleanup and verify `launchctl list`; never terminate unrelated processes.
- Codex keeps quitting and reopening after a restore: an old
  `org.codexskins.codedrobe.native-restart` job is looping because launchd
  re-runs submitted jobs when they exit. Run
  `launchctl bootout gui/$(id -u)/org.codexskins.codedrobe.native-restart`
  once, or rerun `restore_theme.mjs`, which now removes the stale label before
  restoring and submits restart jobs that clean up their own label.
