#!/usr/bin/env node
/**
 * iOS sürümünü package.json'dan eşitler (Android build.gradle bunu derleme anında kendisi okur).
 *   node scripts/native-version.mjs            → MARKETING_VERSION = package.json version, CURRENT_PROJECT_VERSION = x*10000+y*100+z
 *   node scripts/native-version.mjs --build 57 → CURRENT_PROJECT_VERSION = 57 (CI: run_number; App Store her yüklemede artan ister)
 * Değişiklik yalnız ios/App/App.xcodeproj/project.pbxproj içindeki iki ayarı etkiler.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version);
const [a = 0, b = 0, c = 0] = version.split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);

const i = process.argv.indexOf('--build');
const build = i > -1 ? Number.parseInt(process.argv[i + 1], 10) : a * 10000 + b * 100 + c;
if (!Number.isInteger(build) || build < 1) {
  console.error('Geçersiz --build değeri');
  process.exit(1);
}

const file = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
const before = await readFile(file, 'utf8');
const after = before
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
if (after !== before) await writeFile(file, after);
console.log(`iOS: MARKETING_VERSION=${version} CURRENT_PROJECT_VERSION=${build}${after === before ? ' (değişiklik yok)' : ''}`);
