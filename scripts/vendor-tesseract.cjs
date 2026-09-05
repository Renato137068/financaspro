#!/usr/bin/env node
/**
 * vendor-tesseract.cjs — baixa e fixa os arquivos do Tesseract localmente.
 *
 * Por quê: enquanto o worker e o core vêm do jsdelivr, a CSP precisa manter
 * `script-src https://cdn.jsdelivr.net/...`. Isso é um terceiro autorizado a
 * executar JavaScript numa página que guarda token de sessão no localStorage.
 * Com os arquivos servidos pelo próprio app, a CSP fecha em `script-src 'self'`.
 *
 * O que fica no CDN de propósito: os `.traineddata` dos idiomas. São vários MB,
 * são dados (baixados por fetch, não executados) e só precisam de `connect-src`.
 *
 * Uso:
 *   node scripts/vendor-tesseract.cjs           # baixa, verifica e liga a flag
 *   node scripts/vendor-tesseract.cjs --check   # só relata o estado atual
 *   node scripts/vendor-tesseract.cjs --undo    # remove e desliga a flag
 *
 * Depois de rodar, `npm run build` já sai com a CSP fechada — harden-csp.cjs
 * lê a mesma flag.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const VERSAO_JS = '5.1.1';
const VERSAO_CORE = '5.1.1';
const raiz = path.join(__dirname, '..');
const destino = path.join(raiz, 'js', 'vendor', 'tesseract');
const lockfile = path.join(destino, 'versoes.json');
const configPath = path.join(raiz, 'js', 'core', 'config.js');

const ARQUIVOS = [
  { url: `https://cdn.jsdelivr.net/npm/tesseract.js@${VERSAO_JS}/dist/worker.min.js`, nome: 'worker.min.js' },
  { url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${VERSAO_CORE}/tesseract-core.wasm.js`, nome: 'tesseract-core.wasm.js' },
  { url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${VERSAO_CORE}/tesseract-core.wasm`, nome: 'tesseract-core.wasm' },
  { url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${VERSAO_CORE}/tesseract-core-simd.wasm.js`, nome: 'tesseract-core-simd.wasm.js' },
  { url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${VERSAO_CORE}/tesseract-core-simd.wasm`, nome: 'tesseract-core-simd.wasm' },
];

const kb = (b) => (b / 1024).toFixed(0) + ' KB';
const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';

function baixar(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'financaspro-vendor' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(baixar(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} em ${url}`));
        return;
      }
      const partes = [];
      res.on('data', (d) => partes.push(d));
      res.on('end', () => resolve(Buffer.concat(partes)));
    }).on('error', reject);
  });
}

function ligarFlag(valor) {
  let src = fs.readFileSync(configPath, 'utf8');
  if (/TESSERACT_LOCAL\s*:\s*(true|false)/.test(src)) {
    src = src.replace(/TESSERACT_LOCAL\s*:\s*(true|false)/, `TESSERACT_LOCAL: ${valor}`);
  } else {
    src = src.replace(
      /(FEATURE_OPEN_FINANCE\s*:\s*(?:true|false),)/,
      `$1\n  /** Tesseract servido pelo próprio app (ver scripts/vendor-tesseract.cjs). */\n  TESSERACT_LOCAL: ${valor},`,
    );
  }
  fs.writeFileSync(configPath, src, 'utf8');
}

function estado() {
  if (!fs.existsSync(lockfile)) return null;
  try { return JSON.parse(fs.readFileSync(lockfile, 'utf8')); } catch (e) { return null; }
}

async function main() {
  const modo = process.argv[2];

  if (modo === '--check') {
    const st = estado();
    if (!st) {
      console.log('[vendor-tesseract] não vendorizado — o OCR usa o CDN e a CSP mantém o jsdelivr em script-src.');
      console.log('[vendor-tesseract] rode sem argumentos para baixar (~4 MB no app).');
      process.exit(0);
    }
    console.log('[vendor-tesseract] vendorizado em', st.baixadoEm, '· peso total', mb(st.bytesTotal));
    st.arquivos.forEach((a) => console.log('   ' + a.nome.padEnd(30) + kb(a.bytes)));
    process.exit(0);
  }

  if (modo === '--undo') {
    fs.rmSync(destino, { recursive: true, force: true });
    ligarFlag(false);
    console.log('[vendor-tesseract] removido; o OCR volta ao CDN. Rode o build de novo.');
    process.exit(0);
  }

  fs.mkdirSync(destino, { recursive: true });
  const registro = [];
  let total = 0;

  for (const arq of ARQUIVOS) {
    process.stdout.write('  baixando ' + arq.nome.padEnd(30));
    const buf = await baixar(arq.url);
    const sha = crypto.createHash('sha384').update(buf).digest('base64');
    fs.writeFileSync(path.join(destino, arq.nome), buf);
    registro.push({ nome: arq.nome, url: arq.url, bytes: buf.length, integrity: 'sha384-' + sha });
    total += buf.length;
    console.log(kb(buf.length));
  }

  fs.writeFileSync(lockfile, JSON.stringify({
    versaoJs: VERSAO_JS, versaoCore: VERSAO_CORE,
    baixadoEm: new Date().toISOString().slice(0, 10),
    bytesTotal: total, arquivos: registro,
  }, null, 2) + '\n', 'utf8');

  ligarFlag(true);

  console.log();
  console.log('[vendor-tesseract] ✓ ' + registro.length + ' arquivos · ' + mb(total) + ' somados ao app');
  console.log('[vendor-tesseract] CONFIG.TESSERACT_LOCAL = true');
  console.log('[vendor-tesseract] rode `npm run build` — a CSP fecha em script-src \'self\'.');
  console.log('[vendor-tesseract] para desfazer: node scripts/vendor-tesseract.cjs --undo');
}

main().catch((e) => {
  console.error('[vendor-tesseract] falhou:', e.message);
  console.error('[vendor-tesseract] nada foi alterado; o OCR segue usando o CDN.');
  process.exit(1);
});
