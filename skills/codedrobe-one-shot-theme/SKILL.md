---
name: codedrobe-one-shot-theme
description: Create, package, install, watch, and verify a complete original CodeDrobe theme for the OpenAI Codex macOS desktop app from a single natural-language request. Use when a user asks for a Codex skin/theme, describes a visual concept such as “make me a kung-fu football theme,” wants an image-backed home and conversation design, or asks to create and directly install/apply a `.codedrobe-theme` without a multi-turn setup process.
---

# CodeDrobe One-Shot Theme

Turn one sentence into a finished Codex theme. Use published `@codedrobe/core`
as the only runtime; never recreate injectors, patch app bundles, or evaluate
theme JavaScript.

## Interpret the request

Infer a tasteful design system from the user's sentence: theme slug, name,
palette, typography direction, home hero composition, conversation watermark,
and short tagline. Do not ask about details that can be designed reasonably.
Ask only when the target app is not Codex, a required reference image is
missing, or the requested operation would materially exceed theme creation.

Treat `install`, `apply`, `直接安装`, `直接装上`, or equivalent wording as
authorization to close and restart Codex if Core requires it. A request to
create/export only does not authorize restarting or applying.

## Load only what is needed

- Read [references/cli.md](references/cli.md) for runner selection.
- Read [references/codex.md](references/codex.md) for host settings and restore.
- Read [references/one-shot-lessons.md](references/one-shot-lessons.md) before
  authoring or repairing a theme.
- Read [references/theme-authoring.md](references/theme-authoring.md) when
  changing manifests, images, verification nodes, or packages.
- Read [references/dom-snapshot.md](references/dom-snapshot.md) and
  [references/verification.md](references/verification.md) for live checks.
- Read [references/doll-sister-example.md](references/doll-sister-example.md)
  only when a second complete design example is useful.

## One-shot workflow

1. Run `codedrobe apps --json` and `codedrobe detect --app codex --json` using
   the runner selected in `references/cli.md`.
2. Create writable source at `<workspace>/themes/<theme-slug>/`. Never edit this
   installed Skill in place.
3. Copy `assets/one-shot-starter/` into that source directory.
4. If the concept benefits from artwork, invoke the available image-generation
   skill/tool. Generate an original wide hero with the subject on the right and
   quiet UI space on the left. Copy the final image to `assets/hero.png` inside
   the theme source. Do not leave a project asset only in a generated-images
   cache.
5. Replace every placeholder in `theme.json` and customize the top-level CSS
   tokens, tagline, vertical seal label, hero crop, and responsive behavior.
   Keep `rendererProfile: codex-theme-v1`.
6. Keep shared shell styling route-neutral. Keep the conversation artwork in
   `main.main-surface::before`, then disable it on home. Keep the large home
   artwork inside `.dream-home`; never show both layers at once.
7. Pack and inspect the `.codedrobe-theme`. Positional warnings for the guarded
   `.dream-home` structure are acceptable only when the named home verification
   nodes remain present and the selectors match the current Core profile.
8. When CDP is already reachable, capture the active context with the
   privacy-safe Core snapshot, run `probe`, apply with one watcher, and verify.
9. When applying from inside Codex on macOS, run
   `scripts/macos_apply_theme.py --theme <absolute-package> --restart-existing`.
   This submits one detached Core watcher so installation survives Codex
   restarting. Do not start another watcher for the same theme.
10. After Codex returns, read the helper log, run Core `verify` with an absolute
    screenshot path, and inspect the screenshot. Confirm theme id/version,
    `hero`, profile, required landmarks, no overflow, and readable content.

## Required CSS invariants

- Scope application rules under `html.codedrobe-host-codex` or
  `html.codedrobe-codex-skin`.
- Include `#codedrobe-codex-skin-chrome { pointer-events: none !important; }`.
- Include one and only one conversation artwork layer with
  `pointer-events: none`.
- Disable that layer on `.dream-home`; use a dedicated home hero at least
  `250px` tall instead of a narrow image strip.
- Keep native navigation, project selection, composer, scrolling, focus rings,
  menus, and reduced-motion behavior functional.
- Never use external `@import`, remote CSS URLs, scripts, localized-copy
  selectors, or fake full-window screenshot overlays.

## Route and watcher behavior

Codex can replace its renderer when switching between a task and New task. A
successful one-time injection can therefore color one route while leaving the
other unthemed. Always use one Core `--watch` owner for an installed theme.
Stop or replace only the watcher owned by this workflow; never stack watchers.

Computer Use cannot control Codex itself. Do not bypass that restriction. Use
Core snapshots for the active route and the trusted renderer profile for route
styling. State exactly which contexts were live-verified.

## Repair loop

When the user provides a screenshot, inspect it before editing. Make one focused
version bump, repack, stop the old owned watcher, start the new one, verify, and
inspect a new screenshot. Typical repairs are documented in
`references/one-shot-lessons.md`.

## Finish

Return the installed version, package path, screenshot path, contexts verified,
and restore command. Do not claim success from packing alone.
