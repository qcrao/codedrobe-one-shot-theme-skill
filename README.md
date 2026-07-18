# CodexSkins CodeDrobe Skills

Create, discover, install, switch, and verify OpenAI Codex desktop themes on
macOS or Windows. The skills use
[`@codedrobe/core`](https://github.com/CodeDrobe/core) as their only theming
runtime and add a reliable authoring, restart, watcher, and visual-verification
workflow.

The public entrypoint and catalog live at:

- <https://www.codexskins.org/SKILL.md>
- <https://www.codexskins.org/api/themes.json>

## Install

```bash
npx skills add qcrao/codedrobe-one-shot-theme-skill \
  --skill codedrobe-one-shot-theme \
  --global \
  --agent codex \
  --yes
```

Replace the skill name with `codedrobe-theme-finder` or
`codedrobe-theme-manager` when that is the capability needed. Install only one
for the current request.

## Skills

- `codedrobe-one-shot-theme`: create, package, apply, and verify a new theme.
- `codedrobe-theme-finder`: search the machine-readable CodexSkins catalog.
- `codedrobe-theme-manager`: download with SHA-256 verification, apply or
  switch through one owned watcher, verify, and restore.

## Use

```text
用 codedrobe 给我创建并直接安装一个功夫女足主题
```

The workflow generates original artwork when useful, creates a reversible
`.codedrobe-theme`, applies it with one Core watcher, and verifies the active
Codex renderer. Theme restore remains available through
`codedrobe restore --app codex` or the manager's `restore_theme.mjs` helper.
When a theme changed Codex host appearance settings, complete restoration also
requires a full Codex restart; the manager reports `restart-required` and can
submit the restart with `restore_theme.mjs --restart-existing` after approval.

macOS installation uses a detached `launchctl` watcher. Windows installation
uses a hidden detached PowerShell worker started by the bundled Node helper; it
does not require administrator rights or a persistent execution-policy change.
Windows support is currently beta because CodeDrobe Core's upstream Windows
launcher is implemented but still awaiting published hardware verification.

## Source

This repository is derived from the Apache-2.0 licensed
[`CodeDrobe/skills`](https://github.com/CodeDrobe/skills) `codedrobe-theme`
skill and keeps its Core-only runtime and safety boundaries.
