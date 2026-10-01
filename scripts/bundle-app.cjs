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

// Os chunks sob demanda são ES Modules (ADR 0005): import() dinâmico em
// js/core/lazy-load.js (CHUNKS_ESM), que o Vite divide em js/<chunk>-<hash>.js.
// Aqui só sobram os scripts clássicos do boot.

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
const appPaths = bundlable.filter((p) => !p.startsWith(VENDOR_PREFIX));

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
// virou cópia morta do que está em app.bundle.js / vendor.bundle.js.
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

// Diretórios que ficaram vazios após o purge. `js/vendor` segue povoado — o
// lucide completo é pedido por caminho montado em runtime, nunca entra em
// `bundlable`, e apagá-lo quebraria o fallback de ícones.
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
