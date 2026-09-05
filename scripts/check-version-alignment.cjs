#!/usr/bin/env node
/**
 * check-version-alignment.cjs — package.json.version === android versionName
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const configJs = fs.readFileSync(path.join(root, 'js/core/config.js'), 'utf8');

const versionNameMatch = gradle.match(/versionName\s+"([^"]+)"/);
if (!versionNameMatch) {
  console.error('[check-version] versionName não encontrado em android/app/build.gradle');
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

console.log('[check-version] OK — ' + pkg.version);
