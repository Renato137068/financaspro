#!/usr/bin/env node
/**
 * Imprime SHA-256 do certificado de release para assetlinks.json / Play Console.
 * Uso: node scripts/print-android-sha256.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const propsPath = path.join(root, 'android', 'keystore.properties');

if (!fs.existsSync(propsPath)) {
  console.error('[sha256] android/keystore.properties não encontrado.');
  console.error('Copie keystore.properties.example e configure storeFile/storePassword/keyAlias/keyPassword.');
  process.exit(1);
}

const props = Object.fromEntries(
  fs.readFileSync(propsPath, 'utf8')
    .split(/\r?\n/)
    .filter(function(line) { return line && !line.trim().startsWith('#'); })
    .map(function(line) {
      var i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const storeFile = path.resolve(path.join(root, 'android'), props.storeFile || '');
if (!fs.existsSync(storeFile)) {
  console.error('[sha256] Keystore não encontrado:', storeFile);
  process.exit(1);
}

const cmd = [
  'keytool',
  '-list',
  '-v',
  '-keystore', JSON.stringify(storeFile),
  '-alias', JSON.stringify(props.keyAlias || 'financaspro'),
  '-storepass', JSON.stringify(props.storePassword || ''),
].join(' ');

const out = execSync(cmd, { encoding: 'utf8', shell: true });
const match = out.match(/SHA256:\s*([0-9A-F:]+)/i);
if (!match) {
  console.error('[sha256] Fingerprint SHA256 não encontrado na saída do keytool.');
  process.exit(1);
}

const fp = match[1].toUpperCase();
console.log('[sha256] Cole em .well-known/assetlinks.json → sha256_cert_fingerprints:');
console.log(fp);
console.log('');
console.log('Play Console → Configuração do app → Integridade do app → Certificado de assinatura do app');
