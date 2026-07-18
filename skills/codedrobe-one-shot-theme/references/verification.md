# Verification and troubleshooting

## Understand the two checks

`probe` performs DOM preflight without installing the theme. It validates adapter landmarks plus active theme contexts and reports invalid selectors separately.

```bash
codedrobe probe --app <app-id> --theme /absolute/theme.codedrobe-theme --timeout-ms 5000
```

`verify` confirms the installed theme id/version, style, named images, profile state, required nodes, and overflow. It can capture a PNG.

```bash
codedrobe verify --app <app-id> --theme /absolute/theme.codedrobe-theme --screenshot /absolute/result.png
```

## Interpret failures

- `adapter:<name>` missing: the application renderer changed or the wrong CDP target was selected. Repair Core's adapter after inspecting the real app.
- `theme:<name>` missing: the theme relies on an app-specific node that changed. Repair the target CSS and its verification entry.
- invalid selector: fix the selector syntax; do not silently drop the requirement.
- `installed: false`: apply did not run against this target or another watcher removed/replaced it.
- theme id/version mismatch: stale injection or a competing watcher is active.
- named image missing: repack the source manifest and confirm the image key/path.
- horizontal overflow: inspect the screenshot and repair fixed widths, transforms, or overlays.

## Connection failures

1. Pass a short explicit timeout while diagnosing.
2. Confirm the application was launched with the same loopback CDP port used by probe.
3. Check whether another process owns the port; choose a new port consistently instead of killing an unrelated process.
4. Use `codedrobe detect --app <app-id> --app-path <path> --json` for custom installations.
5. Do not assume a running Electron process exposes CDP.

## Safe iteration

Applying theme B replaces theme A in the same Core renderer session and revokes A's owned image URLs. A separate legacy or Desktop watcher may still inject again later; ensure one controller owns the renderer.

After testing, restore the app and inspect Core's host result. If
`host.changed: true`, fully restart Codex after the user authorizes it; a
successful restore call can otherwise leave cached base colors visible in the
running process. On the fresh renderer, confirm `activeTheme.installed: false`,
the style element/root host class/theme dataset are absent, no owned watcher
remains, and computed background colors are no longer the theme palette.
