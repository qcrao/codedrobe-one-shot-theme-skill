#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

const PREVIEW_MAX = 10 * 1024 * 1024;
const PACKAGE_MAX = 30 * 1024 * 1024;

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function usage() {
  process.stdout.write(`Usage:
  node scripts/submit_theme.mjs --name <name> --preview <image> [options] --dry-run
  node scripts/submit_theme.mjs --name <name> --preview <image> [options] --confirm-rights --publish

Options:
  --package <file>       Optional .codedrobe-theme or .zip package
  --creator <name>       Optional creator display name
  --description <text>   Optional description
  --source-url <url>     Optional HTTP(S) source URL
  --dry-run              Validate without a network request
  --confirm-rights       Confirm permission to distribute all submitted assets
  --publish              Upload to the moderation queue
`);
}

function parseArgs(argv) {
  const values = {};
  const booleans = new Set(['--dry-run', '--confirm-rights', '--publish', '--help']);
  const names = new Set(['--name', '--preview', '--package', '--creator', '--description', '--source-url']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (booleans.has(arg)) {
      values[arg.slice(2)] = true;
      continue;
    }
    if (!names.has(arg)) fail(`Unknown option: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${arg}`);
    values[arg.slice(2)] = value;
    index += 1;
  }
  return values;
}

function previewMime(path, bytes) {
  const extension = extname(path).toLowerCase();
  if (extension === '.png' && bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === 'PNG') return 'image/png';
  if ((extension === '.jpg' || extension === '.jpeg') && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (extension === '.webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  fail('Preview must be a real JPG, PNG, or WebP image whose extension matches its bytes.');
}

function validateSourceUrl(value) {
  if (!value) return '';
  let parsed;
  try { parsed = new URL(value); } catch { fail('Source URL is invalid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    fail('Source URL must use HTTP or HTTPS and contain no credentials.');
  }
  return parsed.toString();
}

function validateCodeDrobePackage(bytes) {
  let payload;
  try { payload = JSON.parse(bytes.toString('utf8')); } catch { fail('The .codedrobe-theme package is not valid JSON.'); }
  if (payload.format !== 'codedrobe-theme' || payload.schemaVersion !== 1) {
    fail('The package must use format codedrobe-theme and schemaVersion 1.');
  }
  if (!payload.theme?.id || !payload.theme?.displayName || !payload.theme?.version) {
    fail('The package is missing theme id, displayName, or version.');
  }
  const targets = Array.isArray(payload.targets) ? payload.targets : Object.values(payload.targets || {});
  if (!targets.some((target) => typeof target?.css === 'string' && target.css.trim())) {
    fail('The package contains no non-empty target CSS.');
  }
  return { id: payload.theme.id, displayName: payload.theme.displayName, version: payload.theme.version };
}

async function loadFile(path, max, label) {
  const absolute = resolve(path);
  let info;
  try { info = await stat(absolute); } catch { fail(`${label} does not exist: ${absolute}`); }
  if (!info.isFile()) fail(`${label} is not a file: ${absolute}`);
  if (info.size <= 0 || info.size > max) fail(`${label} must be between 1 byte and ${Math.floor(max / 1024 / 1024)} MB.`);
  return { absolute, size: info.size, bytes: await readFile(absolute) };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { usage(); process.exit(0); }
if (Boolean(args['dry-run']) === Boolean(args.publish)) fail('Choose exactly one of --dry-run or --publish.');
if (!args.preview) fail('--preview is required.');

const preview = await loadFile(args.preview, PREVIEW_MAX, 'Preview');
const mime = previewMime(preview.absolute, preview.bytes);
let packageFile = null;
let packageMetadata = null;
if (args.package) {
  packageFile = await loadFile(args.package, PACKAGE_MAX, 'Package');
  const extension = extname(packageFile.absolute).toLowerCase();
  if (!['.codedrobe-theme', '.zip'].includes(extension)) fail('Package must end in .codedrobe-theme or .zip.');
  if (extension === '.codedrobe-theme') packageMetadata = validateCodeDrobePackage(packageFile.bytes);
  if (extension === '.zip' && packageFile.bytes.subarray(0, 2).toString() !== 'PK') fail('The .zip package has an invalid file signature.');
}

const name = String(args.name || packageMetadata?.displayName || '').trim();
if (name.length < 2 || name.length > 80) fail('Theme name must contain 2–80 characters.');
const creator = String(args.creator || '').trim();
const description = String(args.description || '').trim();
if (creator.length > 80) fail('Creator name must not exceed 80 characters.');
if (description.length > 1000) fail('Description must not exceed 1000 characters.');
const sourceUrl = validateSourceUrl(args['source-url']);

const summary = {
  status: args['dry-run'] ? 'dry-run' : 'ready-to-submit',
  kind: packageFile ? 'theme' : 'skin',
  name,
  creator: creator || 'Anonymous',
  description,
  sourceUrl: sourceUrl || null,
  preview: { path: preview.absolute, filename: basename(preview.absolute), mime, bytes: preview.size },
  package: packageFile ? {
    path: packageFile.absolute,
    filename: basename(packageFile.absolute),
    bytes: packageFile.size,
    metadata: packageMetadata,
  } : null,
  endpoint: `${(process.env.CODEXSKINS_API_BASE || 'https://www.codexskins.org').replace(/\/$/, '')}/api/submissions`,
};

if (args['dry-run']) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}
if (!args['confirm-rights']) fail('--confirm-rights is required for a live submission.');

const form = new FormData();
form.set('name', name);
form.set('creatorName', creator);
form.set('description', description);
form.set('sourceUrl', sourceUrl);
form.set('rightsConfirmed', 'true');
form.set('preview', new Blob([preview.bytes], { type: mime }), basename(preview.absolute));
if (packageFile) {
  form.set('package', new Blob([packageFile.bytes], { type: 'application/octet-stream' }), basename(packageFile.absolute));
}

let response;
try {
  response = await fetch(summary.endpoint, { method: 'POST', body: form, headers: { accept: 'application/json' } });
} catch (error) {
  fail(`Submission request failed: ${error instanceof Error ? error.message : String(error)}`);
}
const responseText = await response.text();
let payload;
try { payload = JSON.parse(responseText); } catch { payload = { message: responseText.slice(0, 500) }; }
if (!response.ok) fail(`Submission failed (${response.status}): ${JSON.stringify(payload)}`);
if (!payload?.submission?.id || payload.submission.status !== 'pending') {
  fail(`Unexpected success response: ${JSON.stringify(payload)}`);
}
process.stdout.write(`${JSON.stringify({ status: 'submitted', ...payload.submission }, null, 2)}\n`);
