/**
 * generate-sw-cache.cjs — gera lista de precache (CSS completo + JS bundle)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version.replace(/\./g, '');
// Sufixo -p3: força um nome de cache novo para que o handler de activate apague
// o cache -p2 anterior, que podia conter respostas REST do Supabase (dado
// financeiro) gravadas antes do fix de H1. Ver o handler de fetch abaixo.
const CACHE_NAME = 'financaspro-v' + version + '-p3';

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

/**
 * Scripts locais referenciados pelo index.html.
 *
 * Em dist são exatamente três: pin-guard (bloqueante, roda antes do primeiro
 * paint), vendor.bundle e app.bundle. A versão anterior devolvia apenas
 * app.bundle.js em dist — pin-guard e vendor ficavam fora do precache e o app
 * não subia offline no primeiro acesso sem rede.
 */
function extractScripts(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
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

/**
 * Ícones e assets com hash do Vite — precisam estar no precache porque o
 * manifest do PWA e a tela inicial os referenciam antes de qualquer navegação.
 *
 * Deliberadamente NÃO varre dist/js e dist/css: em produção o index.html
 * carrega apenas os bundles, e precachear também os ~93 módulos soltos e os
 * ~40 CSS individuais fazia o primeiro acesso baixar o mesmo código duas
 * vezes. O handler de fetch já é stale-while-revalidate, então qualquer chunk
 * sob demanda (previsão, relatórios) entra no cache na primeira vez que o
 * usuário abre a tela — e a partir daí funciona offline.
 */
function walkDistAssets(distDir) {
  const out = [];
  for (const sub of ['assets', 'icons']) {
    const base = path.join(distDir, sub);
    if (!fs.existsSync(base)) continue;
    (function walk(dir, urlPrefix) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const url = urlPrefix + '/' + ent.name;
        if (ent.isDirectory()) walk(full, url);
        else if (/\.(png|svg|json|webp|ico)$/i.test(ent.name)) {
          out.push(url.replace(/\\/g, '/'));
        }
      }
    })(base, '/' + sub);
  }
  return out;
}

/**
 * Fallback pesado do lucide (~390 KB): carregado sob demanda pelo lucide-init
 * apenas se algum ícone do subset não resolver. Precacheá-lo anulava toda a
 * economia do subset de 26 KB.
 */
const PRECACHE_BLOCKLIST = [
  /\/js\/vendor\/lucide-full\.min\.js$/,
  // Ícones grandes de instalação. O sistema operacional busca estes quando o
  // usuário adiciona o app à tela inicial — não são necessários para a
  // primeira pintura, e juntos passavam de 70 KB. O de 192 continua no
  // precache porque é o que aparece na aba e na barra de tarefas.
  /\/icons\/(android\/)?icon-512\.png$/,
  /\/icons\/android\/icon-maskable-512\.png$/,
  /\/icons\/android\/icon-mono-512\.png$/,
  /\/icons\/android\/icon-notificacao-96\.png$/,
  /\/icons\/splash\//,
  /\/icons\/apple-touch-icon\.png$/,
];

/**
 * Fontes que entram no precache: só as da primeira pintura, mais o CSS que as
 * declara. As outras 4 chegam pelo cache de runtime quando aparecerem.
 *
 * Precachear os 8 pesos custaria ~156 KB no primeiro acesso para tipos que
 * talvez nem apareçam na tela inicial — trocaria um problema de rede por um
 * problema de peso.
 *
 * A lista é gerada por scripts/setup-fonts.cjs. Se o arquivo não existir, o
 * precache segue sem fontes em vez de quebrar o build: elas ainda funcionam
 * online, e a alternativa seria travar o deploy por um passo opcional.
 */
function fontesCriticas(targetDir, distMode) {
  const manifesto = path.join(root, 'fonts', 'criticas.json');
  if (!fs.existsSync(manifesto)) return [];

  let nomes;
  try {
    nomes = JSON.parse(fs.readFileSync(manifesto, 'utf8'));
  } catch (e) {
    console.warn('[generate-sw-cache] fonts/criticas.json ilegível — precache sem fontes');
    return [];
  }

  if (!distMode) return ['/css/fonts.css', ...nomes.map(n => '/fonts/' + n)];

  // Em produção o Vite reemite as woff2 em dist/assets com hash no nome, e o
  // CSS bundlado aponta para essas. Precachear o caminho cru baixaria arquivos
  // que nada referencia E deixaria os realmente usados fora do cache — offline
  // continuaria caindo na fonte do sistema, com o custo pago mesmo assim.
  const assetsDir = path.join(targetDir, 'assets');
  if (!fs.existsSync(assetsDir)) return [];

  const emitidos = fs.readdirSync(assetsDir).filter(f => /\.woff2$/i.test(f));
  const out = [];

  for (const nome of nomes) {
    const base = nome.replace(/\.woff2$/i, '');
    const casado = emitidos.find(f => f.startsWith(base + '-') || f === nome);
    if (casado) out.push('/assets/' + casado);
    else console.warn(`[generate-sw-cache] fonte crítica sem correspondente em dist: ${nome}`);
  }
  return out;
}

/**
 * Remove do precache o que não existe no disco.
 *
 * A lista `base` traz caminhos fixos, e caminho fixo apodrece: basta um script
 * de cópia mudar o layout de dist/ para o SW passar a pedir um arquivo que não
 * existe. Antes isso derrubava o precache inteiro em silêncio; agora o item
 * some aqui, na geração, com aviso no build — o erro aparece no CI, e não no
 * celular do usuário.
 */
function apenasExistentes(urls, targetDir) {
  const out = [];
  const ausentes = [];
  for (const url of urls) {
    // '/' é a navegação raiz, servida pelo index.html — não é um arquivo.
    if (url === '/') { out.push(url); continue; }
    const rel = url.replace(/^\//, '');
    if (fs.existsSync(path.join(targetDir, rel))) out.push(url);
    else ausentes.push(url);
  }
  if (ausentes.length) {
    console.warn('[generate-sw-cache] fora do precache (não existem em '
      + path.basename(targetDir) + '):', ausentes.join(', '));
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
    '/icons/logo-simbolo.svg',
    '/icons/android/icon-192.png',
    ...fontesCriticas(targetDir, distMode),
  ];

  if (distMode) {
    const linked = extractLinkedAssets(indexPath);
    const scripts = extractScripts(indexPath);
    const assets = walkDistAssets(targetDir);
    const unique = [...new Set([...base, ...linked, ...scripts, ...assets])]
      .filter(u => !PRECACHE_BLOCKLIST.some(re => re.test(u)));
    return apenasExistentes(unique.sort(), targetDir);
  }

  const css = walkDir(path.join(root, 'css'), '');
  const scripts = extractScripts(indexPath);
  const unique = [...new Set([...base, ...css, ...scripts])];
  return apenasExistentes(unique.sort(), targetDir);
}

function renderSw(urls) {
  return `// FinançasPro - Service Worker (PWA offline-first, stale-while-revalidate)
// Gerado por scripts/generate-sw-cache.cjs — não edite urlsParaCache manualmente

const CACHE_NAME = '${CACHE_NAME}';
const urlsParaCache = ${JSON.stringify(urls, null, 2)};

// cache.addAll é tudo-ou-nada: uma única URL com 404 rejeita a operação
// inteira. Com um catch vazio, o install ainda assim é dado como bem-sucedido
// — o service worker ativa, o app anuncia que funciona offline, e o cache está
// VAZIO. É a pior falha possível num app offline-first, porque ela mente.
// Aqui cada item é buscado por conta própria: o que falhar fica de fora e é
// reportado, o resto entra. O app degrada em vez de enganar.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(
      urlsParaCache.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
    )).then((r) => {
      const falhas = [];
      r.forEach((res, i) => { if (res.status === 'rejected') falhas.push(urlsParaCache[i]); });
      if (falhas.length) {
        console.error('[sw] precache incompleto —', falhas.length, 'de', urlsParaCache.length, 'falharam:', falhas);
      }
      // Se NADA entrou no cache, não há offline nenhum: falhar o install
      // impede que este SW assuma e passe a servir um cache vazio.
      if (falhas.length === urlsParaCache.length) {
        throw new Error('[sw] precache falhou por completo — install abortado');
      }
    }),
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

// Únicas origens cross-origin cujas respostas PODEM entrar no cache: asset
// estático imutável e versionado (CDN). NUNCA a origem do Supabase — as
// consultas de sincronização são GET PostgREST (SB.from('Transaction')
// .select('*')…) e carregam dado financeiro do usuário. Cacheadas por URL,
// ficariam em texto puro no Cache Storage (fora do LOCAL_CRYPTO) e, como a URL
// é idêntica entre usuários, poderiam ser servidas a outra sessão no mesmo
// aparelho quando offline. Tudo fora desta allowlist é network-only.
const CACHEABLE_CROSS_ORIGIN = new Set([
  'cdn.jsdelivr.net',
]);

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isOrigem = url.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';
  const isApi = isOrigem && url.pathname.startsWith('/api/');
  const crossOriginCacheavel = !isOrigem && CACHEABLE_CROSS_ORIGIN.has(url.hostname);

  // Network-only, sem tocar no cache: API local e QUALQUER cross-origin fora da
  // allowlist (Supabase REST/Auth/Realtime, Belvo…). É o que fecha o vazamento
  // de dado financeiro at-rest e o cruzamento de sessões (H1).
  if (isApi || (!isOrigem && !crossOriginCacheavel)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (crossOriginCacheavel) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || new Response('Sem conexão', { status: 503 }))),
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
        return new Response('Sem conexão', { status: 503 });
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
  const tmp = out + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, content);
  try {
    fs.renameSync(tmp, out);
  } catch (err) {
    // Windows: destino aberto por outro processo — sobrescreve in-place.
    fs.writeFileSync(out, content);
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
  }
  console.log('[generate-sw-cache]', out, '—', urls.length, 'URLs,', CACHE_NAME);
}

const dist = path.join(root, 'dist');
writeFor(root);
if (fs.existsSync(path.join(dist, 'index.html'))) {
  writeFor(dist);
}

module.exports = { buildUrls, renderSw, CACHE_NAME };
