/**
 * generate-sw-cache.cjs — gera lista de precache (CSS completo + JS bundle)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version.replace(/\./g, '');
const CACHE_NAME = 'financaspro-v' + version + '-p2';

function walkDir(dir, prefix) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + '/' + ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkDir(full, rel));
    else if (/\.css$/i.test(ent.name)) out.push('/css' + rel.replace(/\\/g, '/'));
  }
  return out;
}

function extractScripts(htmlPath, distMode) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  if (distMode && html.includes('app.bundle.js')) {
    return ['/js/app.bundle.js'];
  }
  const re = /<script[^>]+src="([^"]+)"[^>]*>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[1].startsWith('http')) continue;
    out.push('/' + m[1].replace(/^\//, ''));
  }
  return out;
}

/** CSS/ícones referenciados no index (ex.: bundle Vite index-*.css) */
function extractLinkedAssets(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const out = [];
  const linkRe = /<link[^>]+href="([^"]+)"[^>]*>/g;
  let m;
  while ((m = linkRe.exec(html))) {
    if (m[1].startsWith('http') || m[1].startsWith('data:')) continue;
    out.push('/' + m[1].replace(/^\//, ''));
  }
  return out;
}

/** Arquivos estáticos em dist/assets, dist/css, dist/js (hashes Vite) */
function walkDistStatic(distDir) {
  const out = [];
  for (const sub of ['assets', 'css', 'js']) {
    const base = path.join(distDir, sub);
    if (!fs.existsSync(base)) continue;
    (function walk(dir, urlPrefix) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const url = urlPrefix + '/' + ent.name;
        if (ent.isDirectory()) walk(full, url);
        else if (/\.(css|js|png|svg|json|webp)$/i.test(ent.name)) {
          out.push(url.replace(/\\/g, '/'));
        }
      }
    })(base, '/' + sub);
  }
  return out;
}

function buildUrls(targetDir) {
  const indexPath = path.join(targetDir, 'index.html');
  const distMode = path.normalize(targetDir).endsWith(path.sep + 'dist')
    || targetDir.replace(/\\/g, '/').endsWith('/dist');
  const base = [
    '/',
    '/index.html',
    '/manifest.json',
    '/privacidade.html',
    '/icons/logo.svg',
    '/icons/android/icon-192.png',
    '/icons/android/icon-512.png',
  ];

  if (distMode) {
    const linked = extractLinkedAssets(indexPath);
    const scripts = extractScripts(indexPath, true);
    const distStatic = walkDistStatic(targetDir);
    const unique = [...new Set([...base, ...linked, ...scripts, ...distStatic])];
    return unique.sort();
  }

  const css = walkDir(path.join(root, 'css'), '');
  const scripts = extractScripts(indexPath, false);
  const unique = [...new Set([...base, ...css, ...scripts])];
  return unique.sort();
}

function renderSw(urls) {
  return `// FinancasPro - Service Worker (PWA offline-first, stale-while-revalidate)
// Gerado por scripts/generate-sw-cache.cjs — não edite urlsParaCache manualmente

const CACHE_NAME = '${CACHE_NAME}';
const urlsParaCache = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsParaCache).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames.map((name) => (name !== CACHE_NAME ? caches.delete(name) : null)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isOrigem = url.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';
  const isApi = isOrigem && url.pathname.startsWith('/api/');

  if (isApi) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (!isOrigem) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || new Response('Offline', { status: 503 }))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => null);

      if (cached) {
        networkFetch.catch(() => {});
        return cached;
      }

      return networkFetch.then((res) => {
        if (res) return res;
        if (isNavigation) return caches.match('/index.html');
        return new Response('Offline', { status: 503 });
      });
    }),
  );
});
`;
}

function writeFor(targetDir) {
  const urls = buildUrls(targetDir);
  const content = renderSw(urls);
  const out = targetDir === root ? path.join(root, 'sw.js') : path.join(targetDir, 'sw.js');
  fs.writeFileSync(out, content);
  console.log('[generate-sw-cache]', out, '—', urls.length, 'URLs,', CACHE_NAME);
}

const dist = path.join(root, 'dist');
writeFor(root);
if (fs.existsSync(path.join(dist, 'index.html'))) {
  writeFor(dist);
}

module.exports = { buildUrls, renderSw, CACHE_NAME };
