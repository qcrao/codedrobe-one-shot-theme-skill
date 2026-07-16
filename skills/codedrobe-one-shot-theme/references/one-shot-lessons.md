# One-shot CodeDrobe lessons

Use these constraints to avoid the failures found during an end-to-end Codex
theme build.

## Restart survival

Running `codedrobe launch --restart-existing` directly from a Codex task can
abort the task's own command when Codex exits. A plain background child may also
be reaped with the app process group.

- On macOS, submit the apply-and-watch command through `launchctl` by using
  `scripts/macos_apply_theme.py`.
- On Windows, create a hidden detached PowerShell worker by using
  `node scripts/windows_apply_theme.mjs`. Node is already required by Core, so
  the Windows helper does not add a Python dependency.

The macOS helper owns a deterministic job label derived from the theme id. The
Windows helper records its worker PID and verifies that the process command line
contains its own worker script before replacing it. Reapplying the same theme
replaces only that owned watcher. Never kill unrelated processes or watchers.

## Two renderer routes

Codex may replace its renderer when the user moves between a conversation and
New task. One-time apply can theme only the renderer that existed at that
moment. Keep exactly one Core `apply --watch` process so later renderers receive
the same package and image URLs.

## Profile safety requirement

With `rendererProfile: codex-theme-v1`, verification requires decorative chrome
to be noninteractive:

```css
#codedrobe-codex-skin-chrome {
  pointer-events: none !important;
}
```

Missing this rule can leave the theme visually present but make Core verification
fail.

## Separate home and conversation artwork

Use a restrained, low-opacity conversation layer:

```css
html.codedrobe-host-codex main.main-surface::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--codedrobe-image-hero) right bottom / auto 72% no-repeat;
  opacity: .22;
}
```

Disable it on the home route so the hero is not duplicated:

```css
html.codedrobe-host-codex main.main-surface:has(.dream-home)::before,
html.codedrobe-host-codex main.main-surface:has([data-testid="home-icon"])::before {
  opacity: 0;
}
```

Use the profile-owned `.dream-home` structure for a dedicated hero. Give the
home's first content region a fixed flex basis and the hero a 250-320px height.
Hide the native home icon only after the hero layout is established. Preserve
the project selector and composer instead of positioning them off-screen.

## Screenshot symptoms

- Colors changed but no image: base host settings loaded, but the active route
  renderer lacks the theme style or the image is home-only. Confirm `installed`,
  `stylePresent`, `images`, and keep one watcher.
- Image appears in conversation but home looks wrong: the conversation layer is
  leaking into home, the hero has no explicit height, or the title container is
  still centered by native flex rules.
- Verify reports `noninteractive-chrome`: add the required profile rule.
- Verify reports `installed: false` after navigation: replace one-time apply
  with one watcher; do not add a second watcher.
- A black project bar appears: explicitly style the container that has
  `.horizontal-scroll-fade-mask .group\/project-selector` with readable surface
  and foreground tokens.

## Evidence standard

For each active context, require Core to report the expected theme id and
version, `stylePresent: true`, `hero` in images, profile pass, no missing adapter
requirements, and `horizontalOverflow: false`. Inspect the PNG as well; machine
checks cannot detect awkward composition or overlapping text.
