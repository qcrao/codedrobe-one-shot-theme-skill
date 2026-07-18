---
name: codedrobe-theme-submitter
description: Validate and submit an existing CodeDrobe `.codedrobe-theme` or `.zip` package, or a preview-only visual skin, to the CodexSkins.org moderation queue. Use when a user asks to submit, upload, publish, share, or list a Codex desktop theme on CodexSkins, or asks whether an exported theme is ready for community submission.
---

# Submit a theme to CodexSkins

Submit an already-created theme package or a preview-only visual skin. This
skill does not create, apply, or repair themes; use `codedrobe-one-shot-theme`
first when the theme or verified preview does not exist.

Read [references/submission-api.md](references/submission-api.md) before
diagnosing an API response or changing endpoint behavior. Run commands from
this installed skill directory. Node.js 20+ is the only runtime requirement.

## Choose the submission path

- With a `.codedrobe-theme` or `.zip`: submit an installable theme.
- With a themed-workspace preview but no package: submit a visual skin.
- With several possible exports: list them and ask which one; never guess.
- With no package or preview: stop and offer `codedrobe-one-shot-theme` to
  create/export and live-verify one first.

The usual export location is `~/.codexskins/exports/`. A submission requires a
separate JPG, PNG, or WebP preview showing the themed Codex workspace with the
sidebar and representative content visible.

## Prepare the public record

Collect:

- theme name, 2–80 characters
- optional creator display name
- optional description, up to 1000 characters
- optional HTTP(S) source or homepage URL
- exact workspace preview, up to 10 MB
- optional `.codedrobe-theme` or `.zip`, up to 30 MB

Visually inspect the exact preview that will be public. Look for account names,
emails, repository/project/task names, chats, paths, attachments, credentials,
or API keys. If anything may be private, stop and create or request a sanitized
workspace capture. Never substitute bare wallpaper art for the workspace
preview without telling the user.

Do not perform legal review. Ask the user to confirm that they created the
assets or have permission to distribute them.

## Dry run

Run a network-free validation before asking to upload:

```bash
node scripts/submit_theme.mjs \
  --name "<theme name>" \
  --preview /absolute/path/workspace-preview.png \
  [--package /absolute/path/theme.codedrobe-theme] \
  [--creator "<display name>"] \
  [--description "<description>"] \
  [--source-url "https://example.com/source"] \
  --dry-run
```

For a visual skin, omit `--package`. The dry run validates sizes, extensions,
image signatures, URL syntax, and CodeDrobe package structure when applicable.
It makes no network request.

## Confirm before uploading

Show the user:

- inferred type: installable theme or visual skin
- final name, creator, description, and source URL
- package path and size, or the fact that there is no package
- exact preview path and rendered image
- that the submission enters human moderation and is not immediately public

Obtain explicit approval for both the public preview and the upload. A prior
request to create, export, or apply the theme is not upload approval.

## Submit

Only after confirmation, repeat the validated command with both irreversible
intent flags:

```bash
node scripts/submit_theme.mjs \
  --name "<theme name>" \
  --preview /absolute/path/workspace-preview.png \
  [--package /absolute/path/theme.codedrobe-theme] \
  [--creator "<display name>"] \
  [--description "<description>"] \
  [--source-url "https://example.com/source"] \
  --confirm-rights --publish
```

Submission is anonymous and requires no account or API key. The API is the
only agent upload path. Do not automate the website file picker. Do not loop or
silently retry a failed upload.

On success, report the submission id and `pending` status from the response.
Never claim the theme is public until a later API/gallery check shows it was
approved.
