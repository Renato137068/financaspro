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
const { entradasEsm, grafoEsm } = require('./lib/esm-grafo.cjs');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');

// Scripts que devem permanecer bloqueantes e FORA dos bundles.
const KEEP_BLOCKING = ['js/pin-guard.js'];
// Saídas geradas por este script — ignoradas ao reprocessar (idempotência).
const GENERATED = ['js/vendor.bundle.js', 'js/app.bundle.js'];
// Prefixo de libs de terceiros que vão para o bundle de vendor (cache longo).
const VENDOR_PREFIX = 'js/vendor/';

// Features opcionais movidas para fora do bundle eager e carregadas sob demanda
// via LAZY.load(). Só entram aqui módulos autocontidos, disparados por ação do
// usuário e referenciados SEMPRE atrás de `typeof X !== 'undefined'`.
// Chunk que virou ES Module (previsão, relatórios, tour) sai desta lista: é
// import() dinâmico em js/core/lazy-load.js (CHUNKS_ESM), e o Vite o divide.
const LAZY_CHUNKS = {
  // Anexos de comprovante só ao abrir Novo (~anexos fora do 1º acesso).
  // OCR foi removido do produto; o chunk mantém só anexos manuais.
  anexos: ['js/anexos.js', 'js/modules/init-anexos.js'],

  // Sub-abas de Orçamento — carregadas ao abrir Metas, Gastos fixos ou Patrimônio.
  metas: ['js/metas.js', 'js/modules/init-metas.js'],
  assinaturas: ['js/assinaturas.js', 'js/modules/init-assinaturas.js'],
  patrimonio: ['js/patrimonio.js', 'js/modules/init-patrimonio.js'],

  // Extrato — ao abrir a aba ou por um wrapper global (exportar, editar pelo
  // alerta, "ver no extrato"). Ícones/cores de categoria ficam no eager
  // (js/core/categoria-visual.js).
  // O markup da tela vem no chunk (js/telas/extrato.js, gerado de telas/).
  extrato: ['js/telas/extrato.js', 'js/modules/init-extrato.js'],

  // Perfil e suas sub-telas — ao abrir qualquer aba config-* ou por um wrapper
  // global (editar perfil, bancos, categorias, exportar backup). As ações de
  // insight do dashboard ficam no eager (js/modules/insight-acoes.js).
  // init-config.js vem dividido: backup e bancos/cartões/categorias são
  // mixins de INIT_CONFIG e precisam vir depois dele.
  // js/telas/config.js (gerado de telas/config/) traz o markup das sub-telas
  // e vem antes: quando o init roda, as telas já estão no DOM.
  config: ['js/telas/config.js', 'js/modules/init-config.js', 'js/modules/config-backup.js', 'js/modules/config-bancos.js'],

  // Orçamento (tela) — ao abrir a aba ou uma sub-aba. O cálculo do orçamento
  // (ORCAMENTO, js/orcamento.js) fica no eager: o dashboard usa.
  // O markup da tela vem no chunk (js/telas/orcamento.js, gerado de telas/).
  orcamento: ['js/telas/orcamento.js', 'js/modules/init-orcamento.js'],

  // Simulador financeiro — só ao abrir Perfil → Simulador.
  // A casca do simulador (#simulador-panel) vem aqui, não no chunk 'config':
  // INIT_SIMULADOR.init pode rodar antes de o 'config' chegar.
  simulador: ['js/telas/simulador.js', 'js/simulador.js', 'js/modules/init-simulador.js'],

  // Paywall UI, Play Billing bridge, 2FA e Open Finance — aba Config (e
  // Resumo/Extrato em nuvem para banner). Vão juntos: mesmo gatilho.
  //
  // IMPORTANTE (RISK-01 / 2026-09): `js/billing.js` NÃO entra neste chunk.
  // Quotas e canUse rodam em Metas/Contas/OCR/etc. sem abrir Config; se BILLING
  // só existisse após lazy `conta`, os `typeof BILLING !== 'undefined' &&
  // !guardQuota` falhavam abertos (Free ultrapassava limites no AAB).
  // O núcleo BILLING fica no app.bundle.js (eager). Este chunk só traz UI e
  // compra. tests/lazy-chunks.test.js trava: billing.js fora do lazy + gatilho.
  conta: [
    'js/play-billing.js',
    'js/fp-native-billing-bridge.js',
    'js/modules/init-billing.js',
    'js/modules/init-2fa.js',
    'js/open-finance.js',
    'js/modules/init-open-finance.js',
  ],
};
const lazySet = new Set(Object.values(LAZY_CHUNKS).reduce((a, b) => a.concat(b), []));

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
    // ES Modules são do Vite (ADR 0005): ele já juntou a entrada e os imports
    // num arquivo próprio. Empacotá-lo aqui de novo o faria rodar duas vezes.
    if (/\btype="module"/.test(m[0])) continue;
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
    // Remove os logs de diagnóstico do build de produção. `pure` (em vez de
    // `drop: ['console']`) preserva console.error/warn: são o último recurso
    // para diagnosticar um bug relatado pelo usuário, e o custo é desprezível.
    // debugger nunca deve chegar ao usuário final.
    pure: ['console.log', 'console.debug', 'console.info', 'console.trace'],
    drop: ['debugger'],
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
const appPaths = bundlable.filter((p) => !p.startsWith(VENDOR_PREFIX) && !lazySet.has(p));

// Chunks lazy: cada um vira js/lazy/<nome>.bundle.js e NÃO é injetado como tag
// eager — só carrega quando LAZY.load(<nome>) é chamado.
const lazyDir = path.join(dist, 'js', 'lazy');
for (const [name, chunkPaths] of Object.entries(LAZY_CHUNKS)) {
  const present = chunkPaths.filter((p) => bundlable.indexOf(p) !== -1);
  if (!present.length) continue;
  fs.mkdirSync(lazyDir, { recursive: true });
  const code = minifyConcat(present);
  fs.writeFileSync(path.join(lazyDir, name + '.bundle.js'), code);
  console.log('[bundle-app]', present.length, 'lazy →', 'js/lazy/' + name + '.bundle.js (', Math.round(code.length / 1024), 'KB )');
}

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

// ── Purga o que já está dentro dos bundles ───────────────────────────────────
//
// Os arquivos crus precisam existir em dist/ porque são a ENTRADA deste script:
// `minifyConcat` lê `dist/js/*.js`. Terminado o empacotamento, cada um deles
// virou cópia morta do que está em app.bundle.js / vendor.bundle.js / lazy.
//
// Ninguém os baixa — o HTML não os referencia mais. Mas `npm run android:sync`
// empacota dist/ inteiro no APK, então o usuário baixa da loja e guarda no
// telefone. E, ao contrário dos bundles, eles não são minificados: expõem
// comentários internos e a estrutura do app em texto claro.
//
// A lista apagada é EXATAMENTE `bundlable` — o que este script leu e inlineou.
// Não é heurística de "parece não usado": é conhecimento de quem consumiu.
// Arquivos que existem em js/ mas NENHUM <script> carrega — logo, não entram em
// `bundlable` e sobreviveriam ao purge acima. Cada entrada exige justificativa:
// embarcar código sem ponto de entrada é pagar APK e expor fonte por nada.
const SEM_PONTO_DE_ENTRADA = [
  // sync-merge.js e sync-engine.js agora têm <script src> no index.html.
];

const purgados = [];
for (const rel of SEM_PONTO_DE_ENTRADA) {
  const file = path.join(dist, rel);
  if (!fs.existsSync(file)) continue;
  purgados.push(fs.statSync(file).size);
  fs.unlinkSync(file);
}
for (const rel of bundlable) {
  const file = path.join(dist, rel);
  if (!fs.existsSync(file)) continue;
  purgados.push(fs.statSync(file).size);
  fs.unlinkSync(file);
}
// Fontes dos ES Modules: o Vite já as juntou em js/index-<hash>.js. As cópias
// cruas que o copy-static trouxe de js/ são tão mortas quanto as de cima.
const esm = grafoEsm(root, entradasEsm(fs.readFileSync(path.join(root, 'index.html'), 'utf8')));
for (const rel of esm) {
  const file = path.join(dist, rel);
  if (!fs.existsSync(file)) continue;
  purgados.push(fs.statSync(file).size);
  fs.unlinkSync(file);
}

// Diretórios que ficaram vazios após o purge. `js/lazy` e `js/vendor` seguem
// povoados — são pedidos por caminho montado em runtime, nunca entram em
// `bundlable`, e apagá-los quebraria os chunks e o fallback de ícones.
function limparVazios(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) limparVazios(path.join(dir, ent.name));
  }
  if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
}
limparVazios(path.join(dist, 'js'));

const kbPurgado = Math.round(purgados.reduce((a, b) => a + b, 0) / 1024);
console.log('[bundle-app]', purgados.length, 'fontes cruas removidas de dist (', kbPurgado, 'KB )');
