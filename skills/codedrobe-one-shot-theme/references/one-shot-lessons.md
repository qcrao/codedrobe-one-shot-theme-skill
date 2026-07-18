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

Choose the conversation treatment from the design contract. For a requested
full workspace background, cover the entire canvas under a readability wash so
the source image has no visible edge:

```css
html.codedrobe-host-codex main.main-surface::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(250, 242, 225, .88), rgba(250, 242, 225, .70)),
    var(--codedrobe-image-hero);
  background-position: center, center;
  background-size: 100% 100%, cover;
  background-repeat: no-repeat;
  opacity: .32;
}
```

If the design contract calls for only a small watermark, a bounded
`right bottom / auto 72%` image is valid. Do not use that watermark geometry
for a promised full background: its hard left/top bitmap edge becomes visible
on tall task pages.

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

Codex's home shell is often much wider than a generated 2:1 hero. `cover` can
therefore enlarge the image until the focal subject, head, staff, clothing, or
motion trails leave the frame. Generate the artwork with an 8-12% top/right
safe area, then prefer `background-size: auto 100%` and
`background-position: right center`. Let the CSS wash or surface color fill the
quiet left side. Align the bitmap flush to `right`; a decorative pixel inset
creates an obvious blank seam at the rounded edge.

## Screenshot symptoms

- Colors changed but no image: base host settings loaded, but the active route
  renderer lacks the theme style or the image is home-only. Confirm `installed`,
  `stylePresent`, `images`, and keep one watcher.
- Image appears in conversation but home looks wrong: the conversation layer is
  leaking into home, the hero has no explicit height, or the title container is
  still centered by native flex rules.
- Home subject is cut off: the very wide hero shell is using `cover` or an
  oversized height percentage. Regenerate with a safe area and fit by height.
- Home has a white strip on the right: remove the right-side background offset;
  use `right center` and verify the rounded edge at desktop and narrow widths.
- Task page shows a rectangular artwork edge: the theme promised a full
  workspace background but used watermark sizing. Switch the artwork layer to
  `cover` and put contrast in a separate full-size gradient wash.
- Verify reports `noninteractive-chrome`: add the required profile rule.
- Verify reports `installed: false` after navigation: replace one-time apply
  with one watcher; do not add a second watcher.
- A black project bar appears: explicitly style the container that has
  `.horizontal-scroll-fade-mask .group\/project-selector` with readable surface
  and foreground tokens.

## First-frame project dock

Core waits for a compatible Codex root before injecting a data-only theme. On a
fresh home renderer, Codex can therefore paint its native dark project dock for
one frame before theme CSS exists. Theme CSS cannot run earlier without crossing
the runtime boundary and modifying the application.

When that native frame creates a distracting black-to-light flash, keep the
final project dock close to the native dark value and theme its readable state:
use the sidebar/night surface for the dock, a gold or accent label, and light
project pills. The native frame then settles into the themed frame instead of
reversing luminance. Do not add fake loading overlays, app-bundle patches, or a
second injector to hide the transition.

Do not solve hero composition by changing the shared
`--thread-content-max-width`, stretching the project dock with `left` and
`right`, or adding top padding for a synthetic label. Those geometry changes
arrive only after injection and create a visible size jump. Preserve the native
project dock and composer dimensions. If the hero must span the workspace,
expand only the hero shell with container-query width and center it independently.
Style the whole project metadata strip, not only `.group\/project-selector`, so
repository location and branch text retain readable contrast on a dark dock.
Then restyle `.group\/project-selector` itself and its descendants for the
selected light project pill. Do not assume the semantic group contains a direct
`button`; on current Codex builds the semantic class may be the interactive
container, so a `> button` rule can miss its label and folder icon.
Anchor the selected-pill override under the same project-dock selector used for
the general light text rule. Otherwise the dock's higher-specificity
`!important` color can win even when the selected rule appears later. Override
the selected container and all descendants' `color`, but restore full opacity
only on the selected container. The group also contains an absolutely positioned
`[data-clear-project-button]` whose native opacity is zero until hover; forcing
opacity on every descendant makes its X icon permanently overlap the folder.
Do not force `stroke` or `fill` on the SVG itself: Codex icons already inherit
`currentColor`, and changing their paint properties can turn the native folder
outline into a doubled or solid-looking glyph.

## Remove the conversation footer scrim over full-frame artwork

Codex places a pointer-events-none `bg-gradient-to-t` layer behind the sticky
conversation composer. Its `from-token-main-surface-primary` color is invisible
on a flat native surface, but becomes a pale rectangular tray around the
composer when the conversation uses full-frame artwork. On non-home routes,
target only the direct gradient child of the sticky footer's absolute backdrop
and remove that layer's `background-image`. Do not match every descendant
gradient: the composer also owns a small internal scroll fade that should stay.
Keep the composer surface, its normal shadow, and its `:focus-within` ring
unchanged.

## Flatten the queued-message tray without flattening the composer

Queued follow-ups do not live inside `.composer-surface-chrome`. Codex mounts
them in a separate top tray whose native `border-x`, `border-t`, and rounded top
corners can appear as a second halo over full-frame artwork. Anchor the repair
to the queue's own direct scroll wrapper: `.vertical-scroll-fade-mask`,
`.hide-scrollbar`, and the `max-h-[30dvh]` class signature. Remove only its
parent tray's border and shadow. Keep rounded top corners while leaving the
bottom corners square so the tray joins the composer naturally. Preserve the
tray background so queued text stays readable, preserve the row actions such
as Steer and delete, and do not weaken the composer's normal focus ring.

The queue action normally returns focus to the composer. A large blurred
composer shadow can then look like a second rounded tray even after the queued
row has disappeared. Inspect the live computed `box-shadow` before widening the
queue selector. Use a downward-weighted shadow with a negative spread so its
blur does not bleed over the top edge, while retaining the separate
`0 0 0 3px` `:focus-within` halo for keyboard visibility.

The files-changed status chip is mounted inside the sticky composer region and
returns focus to the editor. In a full-frame theme, the normal outer focus halo
can then resemble the removed tray chrome. Do not remove focus styling globally.
Scope a repair to `.sticky.bottom-0:has(.diff-stat-rolling-number)` and replace
the outer halo with a small inset ring while the chip is present.

## Treat light cards inside a dark sidebar as separate contrast systems

A dark-sidebar theme often starts with a broad descendant rule so navigation,
projects, and chats inherit a light foreground. Codex also mounts temporary
light surfaces inside that same sidebar, including the usage-limit status card.
The broad rule can therefore produce light text, a light close icon, or an
invisible secondary button on a light card.

Do not weaken the entire sidebar rule to repair one transient surface. Anchor a
local contrast reset to the card's semantic structure, such as
`[role="status"].bg-token-main-surface-primary`, then restore its title,
description, close control, secondary button, and primary action independently.
Verify the card while it is actually open; a closed-state DOM snapshot cannot
prove its text and actions are readable.

## Important Tailwind utilities need token-aware repairs

Sidebar disclosure controls such as `Show more` and `Show less` can carry
Tailwind classes whose literal names begin with `!`, including important text
and opacity utilities. An unlayered theme declaration with `!important` may
still lose because important declarations reverse cascade-layer priority.

Use the semantic class signature only for the affected disclosure controls,
place the repair in an appropriate cascade layer, and locally set the color
tokens consumed by the important utilities. Preserve a visible idle state and
test `:hover`/`:focus-visible` separately. Sidebar-wide button hover effects
must not make these small disclosure controls translate, acquire a heavy pill,
or switch back to a dark foreground.

## Restore needs a fresh process when base colors changed

Core restore removes renderer CSS immediately and restores the transactional
Codex appearance backup on disk. Codex does not always reload those host colors
inside the already-running Electron process. When restore reports
`host.changed: true`, return `restart-required`, obtain permission, and restart
Codex through the detached manager helper. A renderer with no theme classes can
still be visually stale before that restart, so verify computed colors only on
the fresh process.

## Evidence standard

For each active context, require Core to report the expected theme id and
version, `stylePresent: true`, `hero` in images, profile pass, no missing adapter
requirements, and `horizontalOverflow: false`. Inspect the PNG as well; machine
checks cannot detect awkward composition or overlapping text.

Run the detached apply helper as its own action after packing. A chained shell
can be interrupted when Codex replaces a renderer, so always confirm the live
version reported by `verify` matches the just-packed manifest before claiming
the repair is installed.

The macOS helper can occasionally return no structured output on its first
submission while the previous watcher remains active. Do not interpret the
empty response as applied. Verify the live version; when it is stale, submit the
same owned helper again and require both structured helper output and a matching
Core verification result.

When repairing a broad selector, verify its siblings as well as its target. For
example, removing every descendant `bg-gradient-to-t` fixes the outer composer
tray but also erases the native internal scroll fade. Prefer direct-child and
state-aware selectors, then compare computed styles for both layers after the
new package is live.

Computed color evidence matters when a class contains `!text-*` or
`!opacity-*`. Confirm the live element's resolved color, opacity, background,
box shadow, and transform in both idle and hover states; source-order inspection
alone is insufficient when cascade layers are involved.
