# CodeDrobe One-Shot Theme Skill

Create and install a complete original OpenAI Codex desktop theme on macOS or
Windows from one sentence. The skill uses
[`@codedrobe/core`](https://github.com/CodeDrobe/core) as its only theming
runtime and adds a reliable authoring, restart, watcher, and visual-verification
workflow.

## Install

```bash
npx skills add qcrao/codedrobe-one-shot-theme-skill \
  --skill codedrobe-one-shot-theme \
  --global \
  --agent codex \
  --yes
```

## Use

```text
用 codedrobe 给我创建并直接安装一个功夫女足主题
```

The workflow generates original artwork when useful, creates a reversible
`.codedrobe-theme`, applies it with one Core watcher, and verifies the active
Codex renderer. Theme restore remains available through
`codedrobe restore --app codex`.

macOS installation uses a detached `launchctl` watcher. Windows installation
uses a hidden detached PowerShell worker started by the bundled Node helper; it
does not require administrator rights or a persistent execution-policy change.
Windows support is currently beta because CodeDrobe Core's upstream Windows
launcher is implemented but still awaiting published hardware verification.

## Source

This repository is derived from the Apache-2.0 licensed
[`CodeDrobe/skills`](https://github.com/CodeDrobe/skills) `codedrobe-theme`
skill and keeps its Core-only runtime and safety boundaries.
