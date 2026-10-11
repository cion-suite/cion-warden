#!/usr/bin/env node
// Pre-dist guard: refuses to package the template with unreplaced placeholders.
// Also: shared/config.ts == electron-builder.json
// Bypass: ALLOW_PLACEHOLDERS=1 (use only if you intentionally want a placeholder build).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const bypass = process.env.ALLOW_PLACEHOLDERS === '1';

const PLACEHOLDERS = {
    appId: 'io.cion.template',
    productName: 'Cion Template',
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
const cfgSrc = loadText('shared/config.ts');

const publish = stable.publish ?? [];
const publishRepos = publish.map(p => `${p.owner}/${p.repo}`);

const cfgProductName = cfgSrc.match(/^\s*productName\s*:\s*['"]([^'"]+)['"]/m)?.[1];
const splashSrc = loadText('app/splash.html');
const cfgAppId = cfgSrc.match(/^\s*appId\s*:\s*['"]([^'"]+)['"]/m)?.[1];
const cfgRepos = [...cfgSrc.matchAll(/\{\s*owner\s*:\s*['"]([^'"]+)['"]\s*,\s*repo\s*:\s*['"]([^'"]+)['"]/g)]
    .map(m => `${m[1]}/${m[2]}`);

if (stable.appId === PLACEHOLDERS.appId)
    errors.push(`electron-builder.json[appId] is still the template placeholder "${stable.appId}"`);
if (stable.productName === PLACEHOLDERS.productName)
    errors.push(`electron-builder.json[productName] is still the template placeholder "${stable.productName}"`);
if (publish.length === 0 || publish.some(p => p.provider !== 'github'))
    errors.push('electron-builder.json[publish] must list github providers (one per release repository)');

if (cfgProductName === PLACEHOLDERS.productName)
    errors.push(`shared/config.ts CONFIG.productName is still the template placeholder "${cfgProductName}"`);
if (splashSrc.includes('REPLACE BEFORE SHIP'))
    errors.push('app/splash.html still has "REPLACE BEFORE SHIP" markers');

if (cfgAppId === PLACEHOLDERS.appId)
    errors.push(`shared/config.ts CONFIG.appId is still the template placeholder "${cfgAppId}"`);
if (cfgRepos.length === 0)
    errors.push('shared/config.ts CONFIG.releases is empty or not parsable');

if (pkg.name === '@cion-suite/template')
    errors.push(`package.json[name] is still the template default "${pkg.name}"`);
if (pkg.homepage === PLACEHOLDERS.homepage)
    errors.push(`package.json[homepage] still points at the template repo`);

if (cfgAppId && stable.appId && cfgAppId !== stable.appId)
    errors.push(`drift: shared/config.ts CONFIG.appId (${cfgAppId}) != electron-builder.json[appId] (${stable.appId})`);
if (cfgProductName && stable.productName && cfgProductName !== stable.productName)
    errors.push(
        `drift: shared/config.ts CONFIG.productName (${cfgProductName}) != electron-builder.json[productName] (${stable.productName})`,
    );
if (cfgRepos.length > 0 && cfgRepos.join() !== publishRepos.join())
    errors.push(
        `drift: shared/config.ts CONFIG.releases (${cfgRepos.join(', ')}) != electron-builder.json[publish] (${publishRepos.join(', ')})`,
    );

if (errors.length === 0) {
    console.log('check:placeholders OK - appId, productName, release repositories and package metadata look replaced.');
    process.exit(0);
}

console.error('\ncheck:placeholders failed:\n');
for (const e of errors) console.error('  - ' + e);

if (bypass) {
    console.warn(
        '\nALLOW_PLACEHOLDERS=1 set - continuing despite the failures above.\n' +
            'Do not ship the resulting artifact.\n',
    );
    process.exit(0);
}

console.error(
    '\nReplace the placeholders per CLAUDE.md "Before first ship" or set ALLOW_PLACEHOLDERS=1 to bypass.\n',
);
process.exit(1);
