#!/usr/bin/env node
/**
 * check-version-alignment.cjs — package.json.version === android versionName
 * === CONFIG.VERSION; versionCode presente; CACHE_NAME do SW bate com a versão.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const configJs = fs.readFileSync(path.join(root, 'js/core/config.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const versionNameMatch = gradle.match(/versionName\s+"([^"]+)"/);
if (!versionNameMatch) {
  console.error('[check-version] versionName não encontrado em android/app/build.gradle');
  process.exit(1);
}

const versionCodeMatch = gradle.match(/versionCode\s+(\d+)/);
if (!versionCodeMatch) {
  console.error('[check-version] versionCode não encontrado em android/app/build.gradle');
  process.exit(1);
}
const versionCode = Number(versionCodeMatch[1]);
if (!Number.isFinite(versionCode) || versionCode < 1) {
  console.error('[check-version] versionCode inválido: ' + versionCodeMatch[1]);
  process.exit(1);
}

const versionName = versionNameMatch[1];
if (pkg.version !== versionName) {
  console.error(
    '[check-version] divergência: package.json=' + pkg.version
    + ' android versionName=' + versionName,
  );
  process.exit(1);
}

const configMatch = configJs.match(/VERSION:\s*'([^']+)'/);
if (!configMatch) {
  console.error('[check-version] CONFIG.VERSION não encontrado em js/core/config.js');
  process.exit(1);
}
if (configMatch[1] !== pkg.version) {
  console.error(
    '[check-version] divergência: package.json=' + pkg.version
    + ' CONFIG.VERSION=' + configMatch[1],
  );
  process.exit(1);
}

// generate-sw-cache embute a versão sem pontos: 11.3.15 → 11315
const verDigits = String(pkg.version).replace(/\D/g, '');
const cacheMatch = swSrc.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
if (!cacheMatch) {
  console.error('[check-version] CACHE_NAME não encontrado em sw.js');
  process.exit(1);
}
if (verDigits && cacheMatch[1].indexOf(verDigits) === -1) {
  console.error(
    '[check-version] CACHE_NAME (' + cacheMatch[1] + ') não contém a versão '
    + pkg.version + ' (dígitos ' + verDigits + '). Rode npm run build.',
  );
  process.exit(1);
}

console.log(
  '[check-version] OK — ' + pkg.version
  + ' (versionCode ' + versionCode + ', cache ' + cacheMatch[1] + ')',
);
