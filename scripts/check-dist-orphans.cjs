#!/usr/bin/env node
/**
 * check-dist-orphans.cjs — nenhum arquivo servido sem ninguém pedir.
 *
 * O build copia `js/` e `css/` crus para dist/ porque o bundler PRECISA deles
 * como entrada: `bundle-app.cjs` lê `dist/js/*.js` e concatena. O problema é o
 * que sobra depois. Terminado o empacotamento, aqueles mesmos arquivos passam a
 * ser cópia morta do que já está dentro de `app.bundle.js` — e ninguém os
 * apagava.
 *
 * O custo não é banda: o navegador não os busca. É:
 *
 *   1. O APK. `npm run android:sync` empacota dist/ inteiro dentro do
 *      aplicativo. Cada byte órfão aqui é um byte que o usuário baixa da loja
 *      e guarda no telefone para sempre.
 *   2. Divulgação de código-fonte. Os bundles são minificados; as cópias cruas
 *      não. Elas expõem comentários internos, nomes de variáveis e a estrutura
 *      inteira do app em texto claro — inclusive os comentários desta auditoria
 *      descrevendo onde estavam os bugs.
 *
 * ── Por que uma varredura literal não bastaria ──────────────────────────────
 *
 * Dois grupos de arquivos são alcançados por caminho MONTADO em tempo de
 * execução e não aparecem em busca textual:
 *
 *   js/lazy/<chunk>.bundle.js   ← lazy-load.js faz 'js/lazy/' + chunk + '.bundle.js'
 *   js/vendor/lucide-full.min.js ← carregado só se algum ícone ficar de fora do subset
 *
 * Apagá-los "porque nada referencia" quebraria previsão, relatórios, billing,
 * 2FA, Open Finance e os ícones de fallback — em produção, silenciosamente,
 * porque todos estão atrás de guardas `typeof X !== 'undefined'`.
 *
 * Por isso a alcançabilidade aqui é declarada, não inferida.
 *
 * Uso:
 *   node scripts/check-dist-orphans.cjs           # falha se sobrou órfão
 *   node scripts/check-dist-orphans.cjs --report  # só relata, sai 0
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

/**
 * Arquivos cujo caminho é construído em runtime. NÃO são detectáveis por busca
 * textual — cada entrada aqui precisa apontar para o código que a monta.
 */
const ALCANCAVEL_EM_RUNTIME = [
  // js/core/lazy-load.js:27 → s.src = 'js/lazy/' + chunk + '.bundle.js'
  /^js\/lazy\/[a-z0-9-]+\.bundle\.js$/,
  // js/lucide-init.js → fallback quando um ícone fica fora do subset
  /^js\/vendor\/lucide-full\.min\.js$/,
  // js/ocr.js → lazy-load local antes do CDN
  /^js\/vendor\/tesseract\.min\.js$/,
];

/** Extrai referências literais de um HTML (src/href) e do precache do SW. */
function referenciasDe(conteudo) {
  const refs = new Set();
  const attrs = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = attrs.exec(conteudo))) refs.add(m[1].replace(/^\//, '').split('?')[0]);
  const precache = /"(\/[^"]+\.(?:js|css))"/g;
  while ((m = precache.exec(conteudo))) refs.add(m[1].replace(/^\//, ''));
  return refs;
}

function listar(dir, base, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.posix.join(base, ent.name);
    if (ent.isDirectory()) listar(full, rel, out);
    else if (/\.(js|css)$/.test(ent.name)) out.push(rel);
  }
  return out;
}

/**
 * Separa os arquivos entre usados e órfãos.
 * Pura de propósito: é o que o teste exercita, sem precisar de um dist/ real.
 */
function classificar(arquivos, referencias, runtime) {
  const padroes = runtime || ALCANCAVEL_EM_RUNTIME;
  const usados = [];
  const orfaos = [];
  for (const rel of arquivos) {
    const alcancavel = referencias.has(rel) || padroes.some((re) => re.test(rel));
    (alcancavel ? usados : orfaos).push(rel);
  }
  return { usados: usados.sort(), orfaos: orfaos.sort() };
}

function main() {
  const soRelata = process.argv.includes('--report');

  if (!fs.existsSync(dist)) {
    console.log('\n[dist-orphans] dist/ ausente — rode `npm run build` antes.\n');
    process.exit(0);
  }

  let refs = new Set();
  for (const arq of ['index.html', 'privacidade.html', 'sw.js']) {
    const p = path.join(dist, arq);
    if (fs.existsSync(p)) {
      referenciasDe(fs.readFileSync(p, 'utf8')).forEach((r) => refs.add(r));
    }
  }

  const { usados, orfaos } = classificar(listar(path.join(dist, 'js'), 'js')
    .concat(listar(path.join(dist, 'css'), 'css')), refs);

  const bytes = (rel) => fs.statSync(path.join(dist, rel)).size;
  const somaOrfa = orfaos.reduce((a, r) => a + bytes(r), 0);
  const somaUsada = usados.reduce((a, r) => a + bytes(r), 0);
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';

  console.log('\n[dist-orphans] js/ + css/ dentro de dist/\n');
  console.log(`  servidos : ${usados.length.toString().padStart(3)} arquivos · ${kb(somaUsada)}`);
  console.log(`  órfãos   : ${orfaos.length.toString().padStart(3)} arquivos · ${kb(somaOrfa)}\n`);

  if (!orfaos.length) {
    console.log('[dist-orphans] ✓ nada sobrando no build\n');
    return;
  }

  for (const rel of orfaos.slice(0, 20)) console.log(`    ${kb(bytes(rel)).padStart(9)}  ${rel}`);
  if (orfaos.length > 20) console.log(`    … e mais ${orfaos.length - 20}`);

  if (soRelata) {
    console.log('\n[dist-orphans] modo --report: não falhando.\n');
    return;
  }
  console.error(
    `\n[dist-orphans] ✗ ${orfaos.length} arquivos (${kb(somaOrfa)}) vão para o `
    + 'APK e para o servidor sem nada referenciá-los.\n'
    + '  Se algum for carregado por caminho montado em runtime, declare o padrão\n'
    + '  em ALCANCAVEL_EM_RUNTIME apontando o código que o monta.\n',
  );
  process.exit(1);
}

if (require.main === module) main();

module.exports = { classificar, referenciasDe, ALCANCAVEL_EM_RUNTIME };
