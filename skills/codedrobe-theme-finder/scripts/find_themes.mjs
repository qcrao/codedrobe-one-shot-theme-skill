#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultCatalog = 'https://www.codexskins.org/api/themes.json';
const usage = 'Usage: find_themes.mjs [terms...] [--lang en|zh] [--limit 1-20] [--verified] [--installable] [--catalog URL|FILE]';

function parseArgs(argv) {
  const options = {
    query: [],
    lang: 'en',
    limit: 5,
    verified: false,
    installable: false,
    catalog: process.env.CODEXSKINS_CATALOG_URL || defaultCatalog,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--lang') options.lang = argv[++index];
    else if (value === '--limit') options.limit = Number(argv[++index]);
    else if (value === '--verified') options.verified = true;
    else if (value === '--installable') options.installable = true;
    else if (value === '--catalog') options.catalog = argv[++index];
    else if (value.startsWith('--')) throw new Error(`Unknown option: ${value}`);
    else options.query.push(value);
  }
  if (!['en', 'zh'].includes(options.lang)) throw new Error('--lang must be en or zh');
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 20) {
    throw new Error('--limit must be an integer from 1 to 20');
  }
  if (!options.catalog) throw new Error('--catalog requires a URL or JSON file');
  return options;
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function localized(entry, field, lang) {
  const value = entry[field];
  if (!value || typeof value !== 'object') return value;
  return value[lang] ?? value.en ?? value.zh;
}

export function rankThemes(themes, options) {
  const query = normalize(options.query.join(' '));
  const terms = query.split(' ').filter(Boolean);
  return themes
    .filter((entry) => !options.verified || entry.verification?.status === 'live-verified')
    .filter((entry) => !options.installable || entry.installable === true)
    .map((entry) => {
      const name = localized(entry, 'name', options.lang);
      const description = localized(entry, 'description', options.lang);
      const tags = localized(entry, 'tags', options.lang) ?? [];
      const haystack = normalize([entry.id, name, description, ...(Array.isArray(tags) ? tags : [])].join(' '));
      let relevance = query ? 0 : 1;
      if (query && normalize(entry.id) === query) relevance += 100;
      if (query && normalize(name) === query) relevance += 80;
      if (query && haystack.includes(query)) relevance += 20;
      for (const term of terms) if (haystack.includes(term)) relevance += 4;
      let score = relevance;
      if (entry.verification?.status === 'live-verified') score += 2;
      if (entry.installable) score += 1;
      return { entry, score, relevance };
    })
    .filter(({ relevance }) => !query || relevance > 0)
    .sort((a, b) => b.score - a.score || String(a.entry.id).localeCompare(String(b.entry.id)))
    .slice(0, options.limit)
    .map(({ entry, score }) => ({
      id: entry.id,
      kind: entry.kind,
      name: localized(entry, 'name', options.lang),
      description: localized(entry, 'description', options.lang),
      tags: localized(entry, 'tags', options.lang),
      mode: entry.mode,
      image: entry.image,
      url: entry.url,
      installable: Boolean(entry.installable),
      downloadUrl: entry.downloadUrl,
      package: entry.package ?? null,
      verification: entry.verification,
      guidance: localized(entry, 'guidance', options.lang),
      score,
    }));
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
  const catalog = JSON.parse(source);
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.themes)) {
    throw new Error('Unsupported CodexSkins catalog schema');
  }
  return catalog;
}

async function main() {
  if (process.argv.slice(2).includes('--help')) {
    console.log(usage);
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  const catalog = await loadCatalog(options.catalog);
  const results = rankThemes(catalog.themes, options);
  console.log(JSON.stringify({
    query: options.query.join(' '),
    filters: { verified: options.verified, installable: options.installable },
    catalog: options.catalog,
    totalCatalogEntries: catalog.total ?? catalog.themes.length,
    resultCount: results.length,
    results,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
