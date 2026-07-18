#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseThemeId, validatePackageBytes } from './theme_library.mjs';
import { classifyRestore, macRestartShellCommand } from './restore_theme.mjs';
import { macWatcherShellCommand } from './apply_theme.mjs';

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

const restartCommand = macRestartShellCommand("'codedrobe' 'launch'", 'org.codexskins.codedrobe.native-restart');
assert.ok(
  restartCommand.endsWith("/bin/launchctl remove 'org.codexskins.codedrobe.native-restart'"),
  'macOS restart job must remove its own launchd label so launchd cannot re-run it in a loop',
);
assert.ok(!restartCommand.includes('exec '), 'restart command must not exec away the self-cleanup step');

const watcherCommand = macWatcherShellCommand({
  watchCommand: "'codedrobe' 'apply' '--watch' '--no-launch'",
  restartCommand: "'codedrobe' 'apply' '--watch' '--restart-existing'",
  markerFile: '/tmp/active-watch.restarted',
});
assert.equal(
  watcherCommand,
  "if [ -e '/tmp/active-watch.restarted' ]; then 'codedrobe' 'apply' '--watch' '--no-launch'; "
    + "else /usr/bin/touch '/tmp/active-watch.restarted'; 'codedrobe' 'apply' '--watch' '--restart-existing'; fi",
  'launchd re-runs of a crashed watcher must re-attach instead of restarting Codex again',
);
assert.equal(
  macWatcherShellCommand({ watchCommand: "'codedrobe' 'apply' '--watch' '--no-launch'", restartCommand: null, markerFile: '/tmp/m' }),
  "'codedrobe' 'apply' '--watch' '--no-launch'",
);

console.log('codedrobe-theme-manager package tests passed');
