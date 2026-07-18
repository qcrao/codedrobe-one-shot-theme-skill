# Codex theme visual acceptance checklist

Use this checklist after the first complete apply and after screenshot-driven
repairs. Mark only states that were actually observed on the current platform
and Codex build.

## Package and ownership

- Packed theme id and version match the intended source manifest.
- Exactly one owned Core watcher controls the renderer.
- Core `verify` reports the expected version, `stylePresent: true`, named
  artwork, renderer-profile pass, required nodes, and no horizontal overflow.
- A privacy-safe screenshot and DOM snapshot come from the live installed
  version rather than a static preview.

## Home: cold and settled frames

- Observe one transition into New task. Separate the native first frame from
  the settled themed frame; theme CSS cannot precede the compatible root.
- The final project dock is luminance-compatible with the native first frame,
  so it does not flash black-to-light.
- Hero expansion does not change the native project dock or composer width,
  height, vertical position, or label layout after injection.
- The home artwork is at least 250px tall, reaches the intended rounded edge,
  and keeps the focal subject, limbs, props, clothing, and motion trails inside
  the visible crop at desktop and narrow widths.
- The home hero and conversation artwork never appear at the same time.

## Project dock states

- Selected project text and folder icon have readable contrast.
- Repository location and branch metadata remain readable on the dock surface.
- The selected pill keeps its native hit area and opens the project menu.
- At rest, only the native folder icon is visible. The clear-project X remains
  hidden and appears only in its native hover/focus state.
- Theme rules change inherited `color`, not SVG `stroke` or `fill`; the folder
  stays an outline instead of a doubled or solid blob.
- Opening and closing the project menu does not shift the dock or composer.

## Conversation surface

- Full-background artwork covers the complete workspace with no hard bitmap
  edge, right seam, blank strip, or uncovered corner.
- Prose, code, tool output, selection, and scrolling remain readable and usable.
- The sticky composer sits directly over the full-frame background without a
  pale rectangular footer tray.
- Only the direct outer footer scrim is removed. The composer's small internal
  scroll fade remains intact.
- Composer idle, typing, expanded, and `:focus-within` states preserve native
  controls, caret, microphone, send button, focus ring, and keyboard behavior.

## Recovery

- Stop only the watcher owned by this workflow, then run Core restore.
- If restore reports host settings changed or restart required, fully restart
  Codex before judging restored colors.
- On the fresh process, verify there is no active theme id, injected style,
  renderer-profile class, or stale themed base color.

## Repair evidence

- Identify the owning semantic node and inspect its computed parent chain before
  editing CSS.
- Change one visual cause per version bump.
- After apply, compare the target plus adjacent native layers/states so a broad
  selector cannot silently remove hidden controls or nested fades.
- Empty helper output is not success; the live installed version must match the
  package before reporting completion.
