/**
 * bundle-app.cjs — empacota e minifica os scripts do index.html (dist).
 *
 * Gera DOIS bundles com defer, em ordem:
 *   1. js/vendor.bundle.js — libs de terceiros (js/vendor/*). Mudam raramente;
 *      ficam num arquivo próprio para que um deploy de código do app NÃO
 *      invalide o cache dessa parte pesada (ex.: lucide ~390 KB).
 *   2. js/app.bundle.js — código da aplicação.
 *
 * pin-guard.js é MANTIDO como script bloqueante separado (fora dos bundles),
 * porque precisa rodar antes do primeiro paint para não vazar dados financeiros.
 *
 * Idempotente: se o index.html já contém apenas os bundles gerados (ex.: numa
 * segunda invocação do pipeline), não faz nada — evita re-empacotar o próprio
 * bundle dentro de si mesmo.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');

// Scripts que devem permanecer bloqueantes e FORA dos bundles.
const KEEP_BLOCKING = ['js/pin-guard.js'];
// Saídas geradas por este script — ignoradas ao reprocessar (idempotência).
const GENERATED = ['js/vendor.bundle.js', 'js/app.bundle.js'];
// Prefixo de libs de terceiros que vão para o bundle de vendor (cache longo).
const VENDOR_PREFIX = 'js/vendor/';

if (!fs.existsSync(indexPath)) {
  console.log('[bundle-app] dist/index.html ausente — pulando bundle');
  process.exit(0);
}

function extractScriptPaths(html) {
  const re = /<script[^>]+src="([^"]+)"[^>]*><\/script>/g;
  const paths = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[1].startsWith('http')) continue;
    paths.push(m[1].replace(/^\//, ''));
  }
  return paths;
}

function minifyConcat(relPaths) {
  let combined = '';
  for (const rel of relPaths) {
    const file = path.join(dist, rel);
    if (!fs.existsSync(file)) {
      console.warn('[bundle-app] ausente:', rel);
      continue;
    }
    combined += fs.readFileSync(file, 'utf8') + '\n;\n';
  }
  return esbuild.transformSync(combined, {
    minify: true,
    target: 'es2015',
    legalComments: 'none',
  }).code;
}

const allPaths = extractScriptPaths(fs.readFileSync(indexPath, 'utf8'));
const bundlable = allPaths.filter(
  (p) => KEEP_BLOCKING.indexOf(p) === -1 && GENERATED.indexOf(p) === -1,
);

if (!bundlable.length) {
  console.log('[bundle-app] nada a empacotar (já bundlado ou sem scripts locais)');
  process.exit(0);
}

// Preserva a ordem original de declaração dentro de cada grupo.
const vendorPaths = bundlable.filter((p) => p.startsWith(VENDOR_PREFIX));
const appPaths = bundlable.filter((p) => !p.startsWith(VENDOR_PREFIX));

const injects = [];

if (vendorPaths.length) {
  const code = minifyConcat(vendorPaths);
  fs.writeFileSync(path.join(dist, 'js', 'vendor.bundle.js'), code);
  injects.push('<script defer src="js/vendor.bundle.js"></script>');
  console.log('[bundle-app]', vendorPaths.length, 'vendor →', 'js/vendor.bundle.js (', Math.round(code.length / 1024), 'KB )');
}

if (appPaths.length) {
  const code = minifyConcat(appPaths);
  fs.writeFileSync(path.join(dist, 'js', 'app.bundle.js'), code);
  injects.push('<script defer src="js/app.bundle.js"></script>');
  console.log('[bundle-app]', appPaths.length, 'app →', 'js/app.bundle.js (', Math.round(code.length / 1024), 'KB )');
}

let html = fs.readFileSync(indexPath, 'utf8');
// Remove todos os <script src="js/..."> EXCETO os que devem ficar bloqueantes.
html = html.replace(/<script[^>]+src="js\/([^"]+)"[^>]*><\/script>\s*/g, (full, rel) => {
  return KEEP_BLOCKING.indexOf('js/' + rel) !== -1 ? full : '';
});
// Injeta vendor antes do app (defer preserva a ordem de execução).
html = html.replace('</body>', injects.join('\n') + '\n</body>');
fs.writeFileSync(indexPath, html);

console.log('[bundle-app] bloqueantes mantidos:', KEEP_BLOCKING.join(', '));
