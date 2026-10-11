#!/usr/bin/env node
// Pre-dist guard: refuses to package the template with unreplaced placeholders.
// Also: shared/config.ts == electron-builder.<channel>.json
// Bypass: ALLOW_PLACEHOLDERS=1 (use only if you intentionally want a placeholder build).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const bypass = process.env.ALLOW_PLACEHOLDERS === '1';

const PLACEHOLDERS = {
    appId: 'io.cion.template',
    productName: 'Cion Template',
    latestUrl: 'https://example.com/updates/latest/',
    betaUrl: 'https://example.com/updates/beta/',
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
const beta = loadJson('electron-builder.beta.json');
const pkg = loadJson('package.json');
const cfgSrc = loadText('shared/config.ts');

const stableUrl = stable.publish?.[0]?.url;
const betaUrl = beta.publish?.[0]?.url;

const cfgProductName = cfgSrc.match(/^\s*productName\s*:\s*['"]([^'"]+)['"]/m)?.[1];
const splashSrc = loadText('app/splash.html');
const cfgAppId = cfgSrc.match(/^\s*appId\s*:\s*['"]([^'"]+)['"]/m)?.[1];
const cfgLatest = cfgSrc.match(/^\s*latestUrl\s*:\s*['"]([^'"]+)['"]/m)?.[1];
const cfgBeta = cfgSrc.match(/^\s*betaUrl\s*:\s*['"]([^'"]+)['"]/m)?.[1];

if (stable.appId === PLACEHOLDERS.appId)
    errors.push(`electron-builder.json[appId] is still the template placeholder "${stable.appId}"`);
if (stable.productName === PLACEHOLDERS.productName)
    errors.push(`electron-builder.json[productName] is still the template placeholder "${stable.productName}"`);
if (stableUrl === PLACEHOLDERS.latestUrl)
    errors.push(`electron-builder.json[publish[0].url] is still the example.com placeholder`);
if (betaUrl === PLACEHOLDERS.betaUrl)
    errors.push(`electron-builder.beta.json[publish[0].url] is still the example.com placeholder`);

if (cfgProductName === PLACEHOLDERS.productName)
    errors.push(`shared/config.ts CONFIG.productName is still the template placeholder "${cfgProductName}"`);
if (splashSrc.includes('REPLACE BEFORE SHIP'))
    errors.push('app/splash.html still has "REPLACE BEFORE SHIP" markers');

if (cfgAppId === PLACEHOLDERS.appId)
    errors.push(`shared/config.ts CONFIG.appId is still the template placeholder "${cfgAppId}"`);
if (cfgLatest === PLACEHOLDERS.latestUrl)
    errors.push(`shared/config.ts CONFIG.feeds.latestUrl is still the example.com placeholder`);
if (cfgBeta === PLACEHOLDERS.betaUrl)
    errors.push(`shared/config.ts CONFIG.feeds.betaUrl is still the example.com placeholder`);

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
if (cfgLatest && stableUrl && cfgLatest !== stableUrl)
    errors.push(
        `drift: shared/config.ts CONFIG.feeds.latestUrl (${cfgLatest}) != electron-builder.json[publish[0].url] (${stableUrl})`,
    );
if (cfgBeta && betaUrl && cfgBeta !== betaUrl)
    errors.push(
        `drift: shared/config.ts CONFIG.feeds.betaUrl (${cfgBeta}) != electron-builder.beta.json[publish[0].url] (${betaUrl})`,
    );

if (errors.length === 0) {
    console.log('check:placeholders OK - appId, productName, feed URLs and package metadata look replaced.');
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
