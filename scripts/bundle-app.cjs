/**
 * bundle-app.cjs — concatena e minifica scripts do index.html em app.bundle.js (dist).
 *
 * pin-guard.js é MANTIDO como script bloqueante separado (não entra no bundle),
 * porque precisa rodar antes do primeiro paint para não vazar dados financeiros.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');

// Scripts que devem permanecer bloqueantes e FORA do bundle.
const KEEP_BLOCKING = ['js/pin-guard.js'];

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

const allPaths = extractScriptPaths(fs.readFileSync(indexPath, 'utf8'));
const scriptPaths = allPaths.filter((p) => KEEP_BLOCKING.indexOf(p) === -1);

if (!scriptPaths.length) {
  console.log('[bundle-app] nenhum script local para empacotar');
  process.exit(0);
}

let combined = '';
for (const rel of scriptPaths) {
  const file = path.join(dist, rel);
  if (!fs.existsSync(file)) {
    console.warn('[bundle-app] ausente:', rel);
    continue;
  }
  combined += fs.readFileSync(file, 'utf8') + '\n;\n';
}

const outFile = path.join(dist, 'js', 'app.bundle.js');
const min = esbuild.transformSync(combined, {
  minify: true,
  target: 'es2015',
  legalComments: 'none',
});
fs.writeFileSync(outFile, min.code);

let html = fs.readFileSync(indexPath, 'utf8');
// Remove todos os <script src="js/..."> EXCETO os que devem ficar bloqueantes.
html = html.replace(/<script[^>]+src="js\/([^"]+)"[^>]*><\/script>\s*/g, (full, rel) => {
  return KEEP_BLOCKING.indexOf('js/' + rel) !== -1 ? full : '';
});
const inject = '<script defer src="js/app.bundle.js"></script>\n';
html = html.replace('</body>', inject + '</body>');
fs.writeFileSync(indexPath, html);

console.log('[bundle-app]', scriptPaths.length, 'scripts → js/app.bundle.js (', Math.round(min.code.length / 1024), 'KB ) · mantidos bloqueantes:', KEEP_BLOCKING.join(', '));
