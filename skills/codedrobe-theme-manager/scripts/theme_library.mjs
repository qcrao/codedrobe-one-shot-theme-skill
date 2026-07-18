#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const defaultCatalog = 'https://www.codexskins.org/api/themes.json';
const maxBytes = 32 * 1024 * 1024;
const usage = 'Usage: theme_library.mjs <install ID_OR_URL|list|resolve ID_OR_URL> [--force] [--catalog URL|FILE]';

function libraryRoot() {
  if (process.env.CODEXSKINS_HOME) return path.resolve(process.env.CODEXSKINS_HOME);
  if (process.platform === 'win32') {
    return path.win32.join(
      process.env.LOCALAPPDATA || path.win32.join('C:\\Users', os.userInfo().username, 'AppData', 'Local'),
      'CodexSkins',
    );
  }
  return path.join(os.homedir(), '.codexskins');
}

export function parseThemeId(input) {
  let candidate = String(input ?? '').trim();
  if (/^https:\/\//i.test(candidate)) {
    const url = new URL(candidate);
    if (!/(^|\.)codexskins\.org$/.test(url.hostname)) throw new Error('Theme URL must be on codexskins.org');
    const segments = url.pathname.split('/').filter(Boolean);
    const themesIndex = segments.indexOf('themes');
    candidate = themesIndex >= 0 ? segments[themesIndex + 1] ?? '' : '';
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(candidate)) throw new Error('Theme id must be a lowercase safe slug');
  return candidate;
}

function parseArgs(argv) {
  const command = argv.shift();
  if (!['install', 'list', 'resolve'].includes(command)) {
    throw new Error(usage);
  }
  const options = {
    command,
    id: command === 'list' ? null : parseThemeId(argv.shift()),
    force: false,
    catalog: process.env.CODEXSKINS_CATALOG_URL || defaultCatalog,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--force') options.force = true;
    else if (value === '--catalog') options.catalog = argv[++index];
    else throw new Error(`Unknown option: ${value}`);
  }
  return options;
}

async function loadCatalog(location) {
  let source;
  if (/^https:\/\//i.test(location)) {
    const response = await fetch(location, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Catalog request failed with HTTP ${response.status}`);
    source = await response.text();
  } else {
    source = await fs.readFile(path.resolve(location), 'utf8');
  }
  const value = JSON.parse(source);
  if (value.schemaVersion !== 1 || !Array.isArray(value.themes)) throw new Error('Unsupported catalog schema');
  return value;
}

function findCoreRunner() {
  const global = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['codedrobe'], { encoding: 'utf8' });
  const executable = global.status === 0 ? global.stdout.split(/\r?\n/).find(Boolean) : null;
  if (executable) return { executable, prefix: [] };
  return {
    executable: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    prefix: ['--yes', '@codedrobe/core@latest'],
  };
}

function inspectPackage(filename) {
  const runner = findCoreRunner();
  const result = spawnSync(runner.executable, [...runner.prefix, 'theme', 'inspect', filename], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'CodeDrobe package inspection failed');
  const start = result.stdout.indexOf('{');
  if (start < 0) throw new Error('CodeDrobe did not return inspect JSON');
  return JSON.parse(result.stdout.slice(start));
}

export function validatePackageBytes(bytes, entry) {
  if (!entry.installable || !entry.downloadUrl || entry.package?.format !== 'codedrobe-theme') {
    throw new Error(`Theme "${entry.id}" is not an installable .codedrobe-theme package`);
  }
  if (bytes.length > maxBytes) throw new Error('Downloaded package exceeds 32 MB');
  if (entry.package.bytes !== undefined && bytes.length !== entry.package.bytes) {
    throw new Error(`Package size mismatch: expected ${entry.package.bytes}, received ${bytes.length}`);
  }
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(entry.package.sha256 ?? '') || digest !== entry.package.sha256) {
    throw new Error(`Package SHA-256 mismatch: expected ${entry.package.sha256}, received ${digest}`);
  }
  return digest;
}

async function readLimitedBody(response) {
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error('Downloaded package exceeds 32 MB');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Downloaded package exceeds 32 MB');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

async function install(options) {
  const catalog = await loadCatalog(options.catalog);
  const entry = catalog.themes.find((candidate) => candidate.id === options.id);
  if (!entry) throw new Error(`Theme "${options.id}" was not found in the CodexSkins catalog`);
  if (!entry.installable || !entry.downloadUrl) throw new Error(entry.guidance?.en || `Theme "${options.id}" is not installable`);
  const download = new URL(entry.downloadUrl);
  if (download.protocol !== 'https:' || !/(^|\.)codexskins\.org$/.test(download.hostname)) {
    throw new Error('Refusing a package URL outside the HTTPS CodexSkins domain');
  }

  const destinationDir = path.join(libraryRoot(), 'themes', entry.id);
  const destination = path.join(destinationDir, `${entry.id}.codedrobe-theme`);
  let exists = false;
  try {
    await fs.access(destination);
    exists = true;
    if (!options.force) throw new Error(`Theme is already installed at ${destination}; use --force only after confirming replacement`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const response = await fetch(entry.downloadUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Theme download failed with HTTP ${response.status}`);
  const finalUrl = new URL(response.url || entry.downloadUrl);
  if (finalUrl.protocol !== 'https:' || !/(^|\.)codexskins\.org$/.test(finalUrl.hostname)) {
    throw new Error(`Refusing a package redirect outside the HTTPS CodexSkins domain: ${finalUrl.hostname}`);
  }
  const advertisedBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertisedBytes) && advertisedBytes > maxBytes) {
    throw new Error('Downloaded package exceeds 32 MB');
  }
  const bytes = await readLimitedBody(response);
  const sha256 = validatePackageBytes(bytes, entry);

  await fs.mkdir(destinationDir, { recursive: true });
  const temporary = path.join(destinationDir, `.${entry.id}.${process.pid}.codedrobe-theme`);
  await fs.writeFile(temporary, bytes, { flag: 'wx' });
  let inspection;
  try {
    inspection = inspectPackage(temporary);
    if (inspection.theme?.id !== entry.id) throw new Error(`Package id mismatch: expected ${entry.id}, received ${inspection.theme?.id}`);
    if (exists) await fs.rm(destination, { force: true });
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }

  return { status: 'installed', id: entry.id, path: destination, sha256, inspection };
}

async function listInstalled() {
  const root = path.join(libraryRoot(), 'themes');
  let ids = [];
  try { ids = await fs.readdir(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const themes = [];
  for (const id of ids.sort()) {
    const filename = path.join(root, id, `${id}.codedrobe-theme`);
    try { await fs.access(filename); themes.push({ id, path: filename }); } catch {}
  }
  return { themes, themesRoot: root };
}

async function main() {
  if (process.argv.slice(2).includes('--help')) {
    console.log(usage);
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'install') console.log(JSON.stringify(await install(options), null, 2));
  else if (options.command === 'list') console.log(JSON.stringify(await listInstalled(), null, 2));
  else {
    const filename = path.join(libraryRoot(), 'themes', options.id, `${options.id}.codedrobe-theme`);
    await fs.access(filename);
    console.log(JSON.stringify({ id: options.id, path: filename }, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
