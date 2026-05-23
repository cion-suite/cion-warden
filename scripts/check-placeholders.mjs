#!/usr/bin/env node
// Pre-dist guard: refuses to package the template with unreplaced placeholders.
// Also asserts the APP_ID / feed-URL invariant between app/config.ts and electron-builder.json.
// Bypass: ALLOW_PLACEHOLDERS=1 (use only if you intentionally want a placeholder build).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const bypass = process.env.ALLOW_PLACEHOLDERS === '1';

const PLACEHOLDERS = {
    appId: 'io.cion.template',
    productName: 'Cion Template',
    latestUrl: 'https://example.com/updates/latest/',
    homepage: 'https://github.com/cion-suite/cion-template',
};

const errors = [];

function loadJson(rel) {
    return JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
}

function loadText(rel) {
    return readFileSync(resolve(root, rel), 'utf8');
}

const stable = loadJson('electron-builder.json');
const pkg = loadJson('package.json');
const cfgSrc = loadText('app/config.ts');

const stableUrl = stable.publish?.[0]?.url;

const cfgAppId = cfgSrc.match(/APP_ID\s*=\s*['"]([^'"]+)['"]/)?.[1];

if (stable.appId === PLACEHOLDERS.appId)
    errors.push(`electron-builder.json[appId] is still the template placeholder "${stable.appId}"`);
if (stable.productName === PLACEHOLDERS.productName)
    errors.push(`electron-builder.json[productName] is still the template placeholder "${stable.productName}"`);
if (stableUrl === PLACEHOLDERS.latestUrl)
    errors.push(`electron-builder.json[publish[0].url] is still the example.com placeholder`);

if (cfgAppId === PLACEHOLDERS.appId)
    errors.push(`app/config.ts APP_ID is still the template placeholder "${cfgAppId}"`);

if (pkg.name === '@cion-suite/template')
    errors.push(`package.json[name] is still the template default "${pkg.name}"`);
if (pkg.homepage === PLACEHOLDERS.homepage)
    errors.push(`package.json[homepage] still points at the template repo`);

if (cfgAppId && stable.appId && cfgAppId !== stable.appId)
    errors.push(`drift: app/config.ts APP_ID (${cfgAppId}) ≠ electron-builder.json[appId] (${stable.appId})`);

if (errors.length === 0) {
    console.log('check:placeholders OK — appId, productName, feed URL and package metadata look replaced.');
    process.exit(0);
}

console.error('\ncheck:placeholders failed:\n');
for (const e of errors) console.error('  - ' + e);

if (bypass) {
    console.warn(
        '\nALLOW_PLACEHOLDERS=1 set — continuing despite the failures above.\n' +
            'Do not ship the resulting artifact.\n',
    );
    process.exit(0);
}

console.error(
    '\nReplace the placeholders in electron-builder.json / app/config.ts / package.json, ' +
        'or set ALLOW_PLACEHOLDERS=1 to bypass.\n',
);
process.exit(1);
