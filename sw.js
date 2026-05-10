// FinançasPro — Service Worker (PWA Offline-first, stale-while-revalidate)

const CACHE_NAME = 'financaspro-v4.0-swr';
const urlsParaCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/pin-guard.js',
  '/js/config.js',
  '/js/categorizador.js',
  '/js/categorias.js',
  '/js/aprendizado.js',
  '/js/parser.js',
  '/js/score.js',
  '/js/pipeline.js',
  '/js/dados.js',
  '/js/domUtils.js',
  '/js/validations.js',
  '/js/utils.js',
  '/js/transacoes.js',
  '/js/contas.js',
  '/js/orcamento.js',
  '/js/automacao.js',
  '/js/render.js',
  '/js/insights.js',
  '/js/config-user.js',
  '/js/pin.js',
  '/js/init.js',
  '/js/shortcuts.js',
  '/js/sw-register.js',
  '/icons/logo.svg'
];

// INSTALL — pre-cache shell. NÃO chama skipWaiting → cliente decide.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsParaCache).catch(() => {}))
  );
});

// ACTIVATE — limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.map((c) => c !== CACHE_NAME ? caches.delete(c) : null)
    )).then(() => self.clients.claim())
  );
});

// MESSAGE — cliente pode forçar skipWaiting via botão "Atualizar"
self.addEventListener('message', (event) => {
  if (event && event.data === 'SKIP_WAITING') self.skipWaiting();
});

// FETCH — stale-while-revalidate para assets do app, network-first para externos
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isOrigem = url.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';

  // Externos (CDN xlsx/jspdf): network-first com fallback de cache
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
        .catch(() => caches.match(event.request).then((c) => c || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Origem própria: stale-while-revalidate (resposta instantânea do cache, atualiza em bg)
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
        // serve cache e atualiza em background
        networkFetch.catch(() => {});
        return cached;
      }
      return networkFetch.then((res) => {
        if (res) return res;
        if (isNavigation) return caches.match('/index.html');
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
