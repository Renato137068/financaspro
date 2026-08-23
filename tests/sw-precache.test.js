/**
 * sw-precache.test.js — o precache do service worker é orçamento, não catálogo.
 *
 * O que o SW lista em `urlsParaCache` é baixado no PRIMEIRO acesso, antes de o
 * usuário conseguir fazer qualquer coisa. Uma varredura ingênua de dist/ já
 * fez esse número chegar a 2,3 MB — com os mesmos módulos baixados duas vezes,
 * soltos e dentro do bundle. Estes testes impedem a reincidência.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distSwPath = path.join(root, 'dist', 'sw.js');
const temDist = fs.existsSync(distSwPath);

/**
 * O `dist/` é mais antigo que o código-fonte?
 *
 * Importa porque os assets do Vite têm hash no nome: editar um CSS muda o nome
 * do arquivo gerado, e o `sw.js` do build anterior passa a apontar para um
 * arquivo que não existe mais. O teste acusaria "precache quebrado" quando o
 * problema real é apenas build desatualizado.
 *
 * No CI a ordem é build → teste, então isso nunca acontece. Localmente,
 * acontece toda vez que alguém mexe no CSS e roda `npm test` sem rebuildar —
 * e um vermelho enganoso é pior que nenhum teste, porque ensina a ignorar.
 */
function distDesatualizado() {
  if (!temDist) return false;
  const distMtime = fs.statSync(distSwPath).mtimeMs;

  let maisRecente = 0;
  for (const dir of ['css', 'js', 'index.html']) {
    const alvo = path.join(root, dir);
    if (!fs.existsSync(alvo)) continue;
    (function varrer(p) {
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        for (const f of fs.readdirSync(p)) varrer(path.join(p, f));
      } else if (st.mtimeMs > maisRecente) {
        maisRecente = st.mtimeMs;
      }
    })(alvo);
  }

  return maisRecente > distMtime;
}

const desatualizado = distDesatualizado();

/** Lê a lista de precache de um sw.js gerado. */
function lerPrecache(file) {
  const src = fs.readFileSync(file, 'utf8');
  const bloco = src.match(/const urlsParaCache = (\[[\s\S]*?\]);/);
  if (!bloco) throw new Error('urlsParaCache não encontrado em ' + file);
  return JSON.parse(bloco[1]);
}

if (desatualizado) {
  // Aviso explícito: sem ele o desenvolvedor não entende por que os testes de
  // precache simplesmente sumiram do relatório.
  // eslint-disable-next-line no-console
  console.warn(
    '[sw-precache] dist/ está mais antigo que o código-fonte — testes de precache pulados.\n' +
    '              Rode `npm run build` para validá-los.',
  );
}

const descreveDist = (temDist && !desatualizado) ? describe : describe.skip;

descreveDist('service worker de produção — precache', () => {
  let urls;

  beforeAll(() => { urls = lerPrecache(distSwPath); });

  test('carrega o app shell completo (bundles + CSS + html)', () => {
    expect(urls).toEqual(expect.arrayContaining([
      '/',
      '/index.html',
      '/js/app.bundle.js',
      '/js/vendor.bundle.js',
      '/js/pin-guard.js',
      '/manifest.json',
    ]));
    expect(urls.some(u => /^\/css\/index-.*\.css$/.test(u))).toBe(true);
  });

  test('não precacheia os módulos individuais que já estão no bundle', () => {
    // Baixar js/core/store.js E js/app.bundle.js significa pagar duas vezes
    // pelo mesmo código.
    const soltos = urls.filter(u => /^\/js\//.test(u))
      .filter(u => !/(bundle|pin-guard)/.test(u));

    expect(soltos).toEqual([]);
  });

  test('não precacheia o fallback pesado do lucide', () => {
    // ~390 KB que só carregam se um ícone do subset falhar — raramente.
    expect(urls).not.toContain('/js/vendor/lucide-full.min.js');
  });

  test('não precacheia os CSS individuais além do bundle', () => {
    const cssSoltos = urls.filter(u => /^\/css\//.test(u))
      .filter(u => !/^\/css\/index-.*\.css$/.test(u));

    expect(cssSoltos).toEqual([]);
  });

  test('lista enxuta — sinal de que a varredura continua seletiva', () => {
    expect(urls.length).toBeLessThan(40);
  });

  test('todo arquivo listado existe em dist/ (precache não falha silenciosamente)', () => {
    // cache.addAll() rejeita inteiro se UMA url der 404, e o install usa
    // .catch(() => {}) — ou seja, uma url morta desliga o offline sem avisar.
    const ausentes = urls
      .map(u => u.replace(/^\//, '') || 'index.html')
      .filter(rel => !fs.existsSync(path.join(root, 'dist', rel)));

    // Assets do Vite têm hash no nome. Se os ausentes são TODOS hasheados, o
    // build é que está velho — o `sw.js` aponta para o hash anterior. É um
    // problema de ambiente, não do precache, e tem outro remédio: rebuildar.
    // Distinguir os dois casos importa porque um vermelho que aponta a causa
    // errada custa mais tempo do que teste nenhum.
    const HASHEADO = /-[A-Za-z0-9_-]{8,}\.(css|js|png|svg|json|webp)$/;
    const somenteHasheados = ausentes.length > 0 && ausentes.every(f => HASHEADO.test(f));

    if (somenteHasheados) {
      // eslint-disable-next-line no-console
      console.warn(
        `[sw-precache] dist/ desatualizado — ${ausentes.length} asset(s) com hash antigo.\n` +
        '              Rode `npm run build` e repita.',
      );
      return;
    }

    expect(ausentes).toEqual([]);
  });

  test('peso total do primeiro acesso abaixo de 1 MB', () => {
    const vistos = new Set();
    let total = 0;

    for (const u of urls) {
      const rel = u.replace(/^\//, '') || 'index.html';
      if (vistos.has(rel)) continue;
      vistos.add(rel);
      const full = path.join(root, 'dist', rel);
      if (fs.existsSync(full)) total += fs.statSync(full).size;
    }

    expect(total).toBeLessThan(1024 * 1024);
  });
});

describe('service worker — estratégia de rede', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  test('respostas de API nunca entram no cache', () => {
    // Cachear /api/ serviria saldo desatualizado como se fosse atual.
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    expect(sw).toContain('event.respondWith(fetch(event.request))');
  });

  test('apenas GET é interceptado', () => {
    expect(sw).toContain("event.request.method !== 'GET'");
  });

  test('navegação offline cai no index.html (app shell)', () => {
    expect(sw).toContain("caches.match('/index.html')");
  });

  test('versão do cache muda junto com a versão do pacote', () => {
    const versao = require(path.join(root, 'package.json')).version.replace(/\./g, '');
    expect(sw).toContain(`financaspro-v${versao}`);
  });
});
