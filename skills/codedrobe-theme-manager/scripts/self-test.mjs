#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseThemeId, validatePackageBytes } from './theme_library.mjs';
import { classifyRestore } from './restore_theme.mjs';

const bytes = Buffer.from('data-only-theme');
const entry = {
  id: 'test-theme',
  installable: true,
  downloadUrl: 'https://www.codexskins.org/themes/test.codedrobe-theme',
  package: {
    format: 'codedrobe-theme',
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  },
};

assert.equal(validatePackageBytes(bytes, entry), entry.package.sha256);
assert.throws(() => validatePackageBytes(Buffer.from('changed'), entry), /size mismatch|SHA-256 mismatch/);
assert.throws(() => validatePackageBytes(bytes, { ...entry, installable: false }), /not an installable/);
assert.equal(parseThemeId('https://www.codexskins.org/zh/themes/test-theme/'), 'test-theme');
assert.throws(() => parseThemeId('https://example.com/themes/test-theme'), /codexskins\.org/);
assert.deepEqual(classifyRestore({
  renderer: { restored: true },
  host: { restored: true, changed: true },
}), {
  rendererRestored: true,
  hostRestored: true,
  hostChanged: true,
  restartRequired: true,
});
assert.equal(classifyRestore({ host: { restored: true, changed: false } }).restartRequired, false);
assert.equal(classifyRestore({ host: { restored: true, changed: true } }, 'workbuddy').restartRequired, false);

console.log('codedrobe-theme-manager package tests passed');
