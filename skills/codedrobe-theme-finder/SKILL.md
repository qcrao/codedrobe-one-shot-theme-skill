---
name: codedrobe-theme-finder
description: Search and rank the public CodexSkins.org catalog by style, subject, mood, platform verification, and installability. Use when a user asks to find, browse, compare, recommend, or discover Codex desktop themes or skins, or names a visual direction without choosing a package.
---

# Find Codex themes

Search the public catalog, show several relevant choices, and route the selected
item to the correct next action. Do not treat concept art as an installable
theme or static validation as live verification.

## Search

Run from this Skill directory:

```bash
node scripts/find_themes.mjs <style subject mood...> --lang <en|zh> --limit 5
```

Use `--verified` when the user explicitly requests tested themes and
`--installable` when they want something that can be applied immediately.
Run one broader query when the first query has no close results; do not loop on
the same terms.

The default catalog is `https://www.codexskins.org/api/themes.json`. Read
`references/catalog-schema.md` only when diagnosing schema or result-routing
problems. For staging or local validation, pass `--catalog /absolute/catalog.json`
or set `CODEXSKINS_CATALOG_URL`; never substitute an untrusted catalog during a
normal user install flow.

## Present results

Show up to five candidates. For each include:

- id, localized name, description, and tags
- public detail-page URL
- verification status and tested platforms
- whether a `.codedrobe-theme` package is installable
- the catalog guidance

Display the preview image when the client supports images. Download it to a
temporary directory first instead of writing it into the user's workspace.

## Continue the workflow

- `installable: true`: offer to install and apply the id with
  `codedrobe-theme-manager`.
- bundled Dream Skin preset: link the detail page and the matching platform
  guide; do not pretend it is a CodeDrobe package.
- design-only skin: offer to recreate the look with
  `codedrobe-one-shot-theme` using the preview as art direction.
- community theme without a hosted package: link the source/detail page and do
  not scrape or redistribute the author's file.

Never end with a result list when an obvious next action exists. Ask which id
the user wants only when several choices are genuinely close.
