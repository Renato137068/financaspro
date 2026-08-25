/**
 * e2e-serve-source.cjs — servidor estático do código-fonte (dev) para Playwright
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.E2E_DEV_PORT || 4322);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const servidor = http.createServer(function(req, res) {
  var urlPath = (req.url || '/').split('?')[0].split('#')[0];
  var relativo = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  if (!relativo || relativo === '.') relativo = 'index.html';
  var destino = path.join(root, relativo);

  if (!destino.startsWith(root)) {
    res.writeHead(403);
    return res.end('403');
  }

  if (fs.existsSync(destino) && fs.statSync(destino).isDirectory()) {
    destino = path.join(destino, 'index.html');
  }

  if (!fs.existsSync(destino)) {
    res.writeHead(404);
    return res.end('404');
  }

  var ext = path.extname(destino).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TIPOS[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(destino).pipe(res);
});

servidor.listen(PORT, '127.0.0.1', function() {
  console.log('[e2e-serve-source] http://127.0.0.1:' + PORT);
});

process.on('SIGINT', function() { process.exit(0); });
process.on('SIGTERM', function() { process.exit(0); });
