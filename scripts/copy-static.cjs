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

require('./bundle-app.cjs');
require('./generate-sw-cache.cjs');

console.log('[copy-static] js/, css/, icons/, sw.js, manifest e screenshots copiados');
console.log('[copy-static] CSP connect-src:', buildCspConnectSrc());
