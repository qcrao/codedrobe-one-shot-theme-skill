#!/usr/bin/env node

import assert from 'node:assert/strict';
import { rankThemes } from './find_themes.mjs';

const themes = [
  {
    id: 'dark-anime', kind: 'theme', mode: 'dark', installable: true,
    name: { en: 'Dark Anime', zh: '暗色动漫' },
    description: { en: 'A dark anime theme', zh: '暗色动漫主题' },
    tags: { en: ['anime', 'dark'], zh: ['动漫', '暗色'] },
    verification: { status: 'live-verified', platforms: ['macos'] },
    guidance: { en: 'Install it.', zh: '安装它。' },
  },
  {
    id: 'pastel', kind: 'skin', mode: 'light', installable: false,
    name: { en: 'Pastel', zh: '粉彩' },
    description: { en: 'A soft concept', zh: '柔和概念图' },
    tags: { en: ['soft'], zh: ['柔和'] },
    verification: { status: 'concept', platforms: [] },
    guidance: { en: 'Recreate it.', zh: '重新生成。' },
  },
];

const base = { query: ['dark', 'anime'], lang: 'en', limit: 5, verified: false, installable: false };
assert.equal(rankThemes(themes, base)[0].id, 'dark-anime');
assert.deepEqual(rankThemes(themes, { ...base, query: [], verified: true }).map((x) => x.id), ['dark-anime']);
assert.deepEqual(rankThemes(themes, { ...base, query: [], installable: true }).map((x) => x.id), ['dark-anime']);
assert.equal(rankThemes(themes, { ...base, query: ['粉彩'], lang: 'zh' })[0].id, 'pastel');

console.log('codedrobe-theme-finder tests passed');

