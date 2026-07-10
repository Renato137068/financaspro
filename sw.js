// FinancasPro - Service Worker (PWA offline-first, stale-while-revalidate)
// Gerado por scripts/generate-sw-cache.cjs — não edite urlsParaCache manualmente

const CACHE_NAME = 'financaspro-v1100-p2';
const urlsParaCache = [
  "/",
  "/css/base.css",
  "/css/components/buttons.css",
  "/css/components/cards.css",
  "/css/components/forms.css",
  "/css/components/modals.css",
  "/css/components/navigation.css",
  "/css/components/page-premium.css",
  "/css/components/toasts.css",
  "/css/critical-inline.css",
  "/css/design-system.css",
  "/css/features/anexos.css",
  "/css/features/assinaturas.css",
  "/css/features/auth.css",
  "/css/features/billing.css",
  "/css/features/contas-pagar.css",
  "/css/features/form-novo.css",
  "/css/features/ia.css",
  "/css/features/metas.css",
  "/css/features/onboarding.css",
  "/css/features/open-finance.css",
  "/css/features/patrimonio.css",
  "/css/features/premium.css",
  "/css/features/relatorios.css",
  "/css/features/skeleton.css",
  "/css/layouts/config.css",
  "/css/layouts/dashboard.css",
  "/css/layouts/extrato.css",
  "/css/layouts/orcamento.css",
  "/css/style.css",
  "/css/themes/dark-mode.css",
  "/css/utilities/accessibility.css",
  "/css/utilities/breakpoints.css",
  "/css/utilities/mobile-app.css",
  "/css/utilities/performance.css",
  "/css/utilities/responsive.css",
  "/css/utilities/ux-polish.css",
  "/icons/android/icon-192.png",
  "/icons/android/icon-512.png",
  "/icons/logo.svg",
  "/index.html",
  "/js/ai-engine.js",
  "/js/alertas.js",
  "/js/anexos.js",
  "/js/app-bootstrap.js",
  "/js/aprendizado.js",
  "/js/assinaturas.js",
  "/js/authController.js",
  "/js/auto-categorizer.js",
  "/js/automacao.js",
  "/js/billing.js",
  "/js/capacitor-init.js",
  "/js/categories.js",
  "/js/categorizador.js",
  "/js/components/AlertaCard.js",
  "/js/components/BarChart6M.js",
  "/js/components/CardOrcamento.js",
  "/js/components/CardTransacao.js",
  "/js/components/ComparacaoMes.js",
  "/js/components/DonutChart.js",
  "/js/components/EmptyState.js",
  "/js/components/Indicador.js",
  "/js/components/LegendaChart.js",
  "/js/components/ProgressBar.js",
  "/js/components/_base.js",
  "/js/config-user.js",
  "/js/contas-pagar.js",
  "/js/contas.js",
  "/js/core/config.js",
  "/js/core/dados.js",
  "/js/core/dom-safe.js",
  "/js/core/domUtils.js",
  "/js/core/event-bus.js",
  "/js/core/events-catalog.js",
  "/js/core/lifecycle.js",
  "/js/core/store.js",
  "/js/core/utils.js",
  "/js/core/validations.js",
  "/js/init.js",
  "/js/insights.js",
  "/js/lucide-init.js",
  "/js/metas.js",
  "/js/micro-interactions.js",
  "/js/modules/init-2fa.js",
  "/js/modules/init-anexos.js",
  "/js/modules/init-assinaturas.js",
  "/js/modules/init-billing.js",
  "/js/modules/init-config.js",
  "/js/modules/init-contas-pagar.js",
  "/js/modules/init-extrato.js",
  "/js/modules/init-form.js",
  "/js/modules/init-metas.js",
  "/js/modules/init-modals.js",
  "/js/modules/init-navigation.js",
  "/js/modules/init-open-finance.js",
  "/js/modules/init-orcamento.js",
  "/js/modules/init-patrimonio.js",
  "/js/modules/init-relatorios.js",
  "/js/ocr.js",
  "/js/onboarding.js",
  "/js/open-finance.js",
  "/js/orcamento.js",
  "/js/parser.js",
  "/js/patrimonio.js",
  "/js/pin-guard.js",
  "/js/pin.js",
  "/js/pipeline.js",
  "/js/previsao.js",
  "/js/relatorios.js",
  "/js/render-core.js",
  "/js/render-dashboard.js",
  "/js/render.js",
  "/js/score.js",
  "/js/services/actions.js",
  "/js/services/budgetService.js",
  "/js/services/healthService.js",
  "/js/services/transactionService.js",
  "/js/shortcuts.js",
  "/js/skeleton.js",
  "/js/sw-register.js",
  "/js/transacoes.js",
  "/js/utilities/aria-live.js",
  "/js/utilities/daily-reminder.js",
  "/js/utilities/focus-trap.js",
  "/js/utilities/local-crypto.js",
  "/js/vendor/lucide.min.js",
  "/manifest.json",
  "/privacidade.html"
];

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
