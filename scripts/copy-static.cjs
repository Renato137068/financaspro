/**
 * copy-static.cjs — Copia assets estáticos para dist/ após vite build
 */
const fs = require('fs');
const path = require('path');
const { patchCspMeta, buildCspConnectSrc } = require('./csp-connect-src.cjs');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function copyScreenshots() {
  var playDir = path.join(root, 'docs', 'play-store');
  var destDir = path.join(dist, 'screenshots');
  var rootDir = path.join(root, 'screenshots');
  fs.mkdirSync(destDir, { recursive: true });
  fs.mkdirSync(rootDir, { recursive: true });

  var patterns = [
    'screenshot-resumo-1080x1920.png',
    'screenshot-extrato-1080x1920.png',
    'screenshot-orcamento-1080x1920.png',
    'screenshot-placeholder-1080x1920.png',
  ];

  patterns.forEach(function(name) {
    var src = path.join(playDir, name);
    if (!fs.existsSync(src)) return;
    var shortName = name.replace('screenshot-', '');
    fs.copyFileSync(src, path.join(destDir, shortName));
    fs.copyFileSync(src, path.join(rootDir, shortName));
    if (name.indexOf('resumo') !== -1 || name.indexOf('placeholder') !== -1) {
      fs.copyFileSync(src, path.join(destDir, 'phone-1080x1920.png'));
      fs.copyFileSync(src, path.join(rootDir, 'phone-1080x1920.png'));
    }
  });
}

copyRecursive(path.join(root, 'js'), path.join(dist, 'js'));
copyRecursive(path.join(root, 'css'), path.join(dist, 'css'));
copyRecursive(path.join(root, 'icons'), path.join(dist, 'icons'));
// fonts/ NÃO é copiado: o Vite já emite as woff2 em dist/assets com hash no
// nome, referenciadas pelo CSS bundlado. Copiar a pasta crua acrescentaria
// 154 KB de arquivos que nada referencia.
fs.copyFileSync(path.join(root, 'sw.js'), path.join(dist, 'sw.js'));
fs.copyFileSync(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
if (fs.existsSync(path.join(root, 'privacidade.html'))) {
  fs.copyFileSync(path.join(root, 'privacidade.html'), path.join(dist, 'privacidade.html'));
}

copyScreenshots();

function patchIndexHtml(filePath) {
  if (!fs.existsSync(filePath)) return;
  var html = fs.readFileSync(filePath, 'utf8');
  html = html.replace(/<link rel="manifest" href="[^"]*">/, '<link rel="manifest" href="manifest.json">');
  html = html.replace(
    /<link rel="apple-touch-icon" href="[^"]*">/,
    '<link rel="apple-touch-icon" href="icons/android/icon-192.png">'
  );
  html = html.replace(
    /<link rel="icon" href="[^"]*"[^>]*>/,
    '<link rel="icon" href="icons/logo.svg" type="image/svg+xml">'
  );
  html = patchCspMeta(html);
  fs.writeFileSync(filePath, html);
}

patchIndexHtml(path.join(dist, 'index.html'));

require('./build-lucide-subset.cjs'); // enxuga lucide antes de empacotar
require('./bundle-app.cjs');

// ── css/ cru sai do build ────────────────────────────────────────────────────
//
// A cópia acima existe porque o Vite resolve os @import a partir de css/, mas o
// que ele emite é UM arquivo: dist/css/index-<hash>.css. Depois disso, os 38
// arquivos crus não são referenciados por nada — nem pelo HTML, nem pelo SW.
//
// Nenhum JS injeta <link rel=stylesheet> em runtime (verificado), então não há
// caminho montado dinamicamente aqui, ao contrário do que acontece em js/.
//
// Precisa rodar ANTES de generate-sw-cache: é ele quem varre dist/ para montar
// o precache, e listar arquivo apagado faria o install do SW falhar inteiro —
// `cache.addAll` rejeita tudo se UMA URL der 404.
function purgarCssCru(dir) {
  if (!fs.existsSync(dir)) return 0;
  var bytes = 0;
  for (var ent of fs.readdirSync(dir, { withFileTypes: true })) {
    var full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      bytes += purgarCssCru(full);
      if (!fs.readdirSync(full).length) fs.rmdirSync(full);
    } else if (ent.name.endsWith('.css') && !/^index-.*\.css$/.test(ent.name)) {
      bytes += fs.statSync(full).size;
      fs.unlinkSync(full);
    }
  }
  return bytes;
}
var cssPurgado = purgarCssCru(path.join(dist, 'css'));
console.log('[copy-static]', Math.round(cssPurgado / 1024), 'KB de CSS cru removidos (bundlado pelo Vite)');

require('./generate-sw-cache.cjs');

console.log('[copy-static] js/, css/, icons/, sw.js, manifest e screenshots copiados');
console.log('[copy-static] CSP connect-src:', buildCspConnectSrc());
