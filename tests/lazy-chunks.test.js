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
 * Este arquivo lê a lista de chunks direto do bundler — não uma cópia — e
 * exige, para cada um, uma chamada de carregamento no código do app.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function lerChunks() {
  const src = fs.readFileSync(path.join(root, 'scripts/bundle-app.cjs'), 'utf8');
  const bloco = src.slice(
    src.indexOf('const LAZY_CHUNKS'),
    src.indexOf('const lazySet'),
  );
  const nomes = [...bloco.matchAll(/^\s{2}(\w+):\s*\[/gm)].map((m) => m[1]);
  const arquivos = [...bloco.matchAll(/'(js\/[^']+)'/g)].map((m) => m[1]);
  return { nomes, arquivos, bloco };
}

function arquivosJs(dir, acc) {
  acc = acc || [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f === 'vendor' || f === 'lazy') continue;
      arquivosJs(p, acc);
    } else if (f.endsWith('.js')) {
      acc.push(p);
    }
  }
  return acc;
}

const { nomes, arquivos } = lerChunks();
const todoJs = arquivosJs(path.join(root, 'js'))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

describe('chunks lazy', () => {
  test('há chunks declarados (o teste não pode virar no-op)', () => {
    expect(nomes.length).toBeGreaterThan(0);
    expect(arquivos.length).toBeGreaterThan(0);
  });

  test.each(nomes)("o chunk '%s' tem quem o carregue", (nome) => {
    // Aceita _ensureChunk('nome', ...) ou LAZY.load('nome').
    const padrao = new RegExp(
      "(_ensureChunk|LAZY\\.load)\\(\\s*'" + nome + "'",
    );
    expect(padrao.test(todoJs)).toBe(true);
  });

  test('todo arquivo listado como lazy existe', () => {
    const faltando = arquivos.filter((rel) => !fs.existsSync(path.join(root, rel)));
    expect(faltando).toEqual([]);
  });

  test('nenhum arquivo lazy é carregado por <script> no index.html', () => {
    // Se o index.html carrega o arquivo direto, o chunk é peso morto: o módulo
    // já veio eager e o bundle não encolheu nada.
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const eager = arquivos.filter((rel) => html.includes('src="' + rel + '"'));

    // Em DEV o index.html carrega tudo de propósito — é o build que separa.
    // O que não pode é o arquivo sumir da lista de scripts, senão o dev roda
    // com uma feature a menos que a produção.
    expect(eager.sort()).toEqual(arquivos.slice().sort());
  });

  test('billing.js NÃO é lazy — quotas no boot (RISK-01)', () => {
    // Se BILLING voltar ao chunk conta, Free no AAB ultrapassa limites até
    // abrir Config: guardas `typeof BILLING !== 'undefined' && !guardQuota`.
    expect(arquivos).not.toContain('js/billing.js');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toMatch(/src="js\/billing\.js"/);
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
    ['INIT_BILLING', 'INIT_2FA', 'INIT_OPEN_FINANCE'].forEach((mod) => {
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
    const vite = fs.readFileSync(path.join(root, 'vite.config.cjs'), 'utf8');
    expect(vite).toMatch(/sourcemap:\s*false/);
  });
});
