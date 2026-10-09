/**
 * lazy-chunks.test.js — nenhum chunk lazy pode ficar sem quem o carregue.
 *
 * Tirar um módulo do bundle eager é a forma mais silenciosa de apagar uma
 * funcionalidade. O código continua no repositório, o arquivo continua sendo
 * gerado no build, e nada acusa nada — porque todos os consumidores checam
 * `typeof X !== 'undefined'` antes de usar. A guarda que existia para tornar o
 * app resiliente passa a esconder a ausência.
 *
 * Foi exatamente assim que a entrada rápida e o OCR ficaram inacessíveis por
 * meses, só que por HTML faltando em vez de bundle. O mecanismo do dano é o
 * mesmo, então a trava precisa ser a mesma: exigir que exista quem carregue.
 *
 * Este arquivo lê a lista de chunks direto do carregador (CHUNKS_ESM em
 * js/core/lazy-load.js) — não uma cópia — e exige, para cada um, uma chamada
 * de carregamento no código do app.
 */
const fs = require('fs');
const path = require('path');
const { entradasEsm, grafoEsm, chunksEsm: arquivosDosChunks } = require('../scripts/lib/esm-grafo.cjs');

const root = path.join(__dirname, '..');

function arquivosJs(dir, acc) {
  acc = acc || [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f === 'vendor') continue;
      arquivosJs(p, acc);
    } else if (f.endsWith('.js')) {
      acc.push(p);
    }
  }
  return acc;
}

/** Os chunks sob demanda: CHUNKS_ESM em js/core/lazy-load.js. */
function lerChunksEsm() {
  const src = fs.readFileSync(path.join(root, 'js/core/lazy-load.js'), 'utf8');
  const bloco = src.slice(src.indexOf('const CHUNKS_ESM'), src.indexOf('const LAZY ='));
  return [...bloco.matchAll(/^\s{2}(\w+):\s*function\(\)\s*\{\s*return import\('([^']+)'\);/gm)]
    .map((m) => ({ nome: m[1], entrada: path.join(root, 'js/core', m[2]) }));
}

const chunksEsm = lerChunksEsm();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// Todo arquivo que algum chunk traz (e que o boot não carrega).
const arquivos = [...arquivosDosChunks(root, entradasEsm(html)).values()].flat();
const todoJs = arquivosJs(path.join(root, 'js'))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

describe('chunks lazy', () => {
  test('há chunks declarados (o teste não pode virar no-op)', () => {
    expect(chunksEsm.length).toBeGreaterThan(0);
    expect(arquivos.length).toBeGreaterThan(chunksEsm.length);
  });

  test.each(chunksEsm.map((c) => c.nome))("o chunk '%s' tem quem o carregue", (nome) => {
    // Aceita _ensureChunk('nome', ...) ou LAZY.load('nome').
    const padrao = new RegExp("(_ensureChunk|LAZY\\.load)\\(\\s*'" + nome + "'");
    expect(padrao.test(todoJs)).toBe(true);
  });

  test('entrada de cada chunk existe e tem o nome do chunk', () => {
    chunksEsm.forEach(({ nome, entrada }) => {
      expect(fs.existsSync(entrada)).toBe(true);
      expect(path.basename(entrada, '.js')).toBe(nome);
    });
  });

  test('nenhum arquivo de chunk é carregado por <script> no index.html', () => {
    // Se o index.html carrega o arquivo direto, o chunk é peso morto: o módulo
    // já veio no boot e o bundle não encolheu nada.
    expect(arquivos.filter((rel) => html.includes('src="' + rel + '"'))).toEqual([]);
  });

  test('billing.js NÃO é lazy — quotas no boot (RISK-01)', () => {
    // Se BILLING voltar ao chunk conta, Free no AAB ultrapassa limites até
    // abrir Config: guardas `typeof BILLING !== 'undefined' && !guardQuota`.
    expect(arquivos).not.toContain('js/billing.js');
    // billing.js é ES Module (ADR 0005): eager por estar no grafo estático da
    // ponte, que roda no boot antes do app.bundle.js (import() não conta).
    expect(grafoEsm(root, entradasEsm(html), { soEstatico: true })).toContain('js/billing.js');
  });

  test('lifecycle agenda reconcile Play no boot (RISK-04)', () => {
    const life = fs.readFileSync(
      path.join(root, 'js/core/lifecycle.js'), 'utf8',
    );
    expect(life).toMatch(/carregarChunkConta/);
    expect(life).toMatch(/_reconciliarPlay\(\{\s*force:\s*true\s*\}\)/);
    const init = fs.readFileSync(
      path.join(root, 'js/modules/init-billing.js'), 'utf8',
    );
    expect(init).toMatch(/_reconciliouNestaSessao/);
    expect(init).toMatch(/opts\.force/);
  });

  test('os módulos do chunk conta são inicializados ao carregar', () => {
    // Não basta baixar o arquivo: sem init() o módulo existe e não se liga a
    // nada — a aba abre e não faz coisa alguma.
    const nav = fs.readFileSync(
      path.join(root, 'js/modules/init-navigation.js'), 'utf8',
    );
    const carregador = nav.slice(nav.indexOf('carregarChunkConta'));

    // Verifica os módulos citados e a CHAMADA de init, sem exigir uma forma
    // sintática específica: o carregador passou de cinco linhas soltas para um
    // laço, e um teste preso à sintaxe quebraria numa refatoração inofensiva.
    ['INIT_BILLING', 'INIT_2FA'].forEach((mod) => {
      expect(carregador).toContain(mod);
    });
    expect(carregador).toMatch(/\.init\s*\(\)/);
  });

  test('a aba de configurações dispara o carregamento antes de renderizar', () => {
    const nav = fs.readFileSync(
      path.join(root, 'js/modules/init-navigation.js'), 'utf8',
    );

    // Comentários fora antes de medir posição: a primeira versão deste teste
    // falhou porque o próprio comentário explicativo mencionava `refreshPerfil`
    // antes da chamada real. Um teste que lê prosa mede a prosa.
    const codigo = nav
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const blocoConfig = codigo.slice(codigo.indexOf("nomeAba === 'config'"));
    const idxCarrega = blocoConfig.indexOf('carregarChunkConta');
    const idxRefresh = blocoConfig.indexOf('refreshPerfil');

    expect(idxCarrega).toBeGreaterThan(-1);
    expect(idxRefresh).toBeGreaterThan(-1);
    expect(idxCarrega).toBeLessThan(idxRefresh);
  });
});

describe('build de produção', () => {
  test('sourcemap desligado — não publicamos o fonte junto do bundle', () => {
    // Só o release liga (FP_SOURCEMAPS=1), em modo 'hidden', e o build tira os
    // mapas do dist/ antes do APK e do site (tests/erro-pilha.test.js).
    const vite = fs.readFileSync(path.join(root, 'vite.config.cjs'), 'utf8');
    expect(vite).toMatch(/sourcemap:\s*process\.env\.FP_SOURCEMAPS === '1' \? 'hidden' : false/);
  });
});
