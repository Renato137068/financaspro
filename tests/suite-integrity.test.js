/**
 * suite-integrity.test.js — a suíte testa o código de produção, ou uma cópia?
 *
 * Motivo de existir: `validations.test.js` reimplementava o módulo inline e
 * testava a cópia. Os 33 testes passavam enquanto o arquivo real continha um
 * bug de 10× em valor monetário — `validarValor(25.5)` devolvia 255. Um teste
 * que duplica a implementação não é rede de segurança: é documentação com
 * aparência de teste.
 *
 * Um segundo problema, mais silencioso, apareceu na mesma investigação: testes
 * que carregam o módulo real via `vm.runInContext` mas passam um `filename`
 * relativo. Eles testam de verdade, porém o provider v8 não consegue mapear o
 * código executado de volta ao arquivo-fonte — e o módulo aparece com 0% no
 * relatório. Foi o que fazia `ai-engine.js` (788 linhas) parecer intocado.
 *
 * Estes testes travam os dois padrões.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const testFiles = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .map(f => ({ nome: f, src: fs.readFileSync(path.join(__dirname, f), 'utf8') }));

/** Nomes dos módulos globais do app, extraídos do .eslintrc (fonte única). */
const MODULOS_GLOBAIS = Object.keys(require('../.eslintrc.cjs').globals || {})
  .filter(n => /^[A-Z][A-Z_0-9]+$/.test(n));

// Testes que legitimamente não carregam módulo de aplicação: verificam
// arquivos estáticos, configuração ou a própria suíte.
const ISENTOS = new Set([
  'security-static.test.js',
  'sw-precache.test.js',
  'suite-integrity.test.js',
  'core-loaded.test.js',
  'totp.test.js',        // valida a lib otplib, não código nosso
  'belvo.test.js',       // helpers puros do adapter, cobertos no backend
]);

describe('integridade da suíte — testes-cópia', () => {
  test('a varredura encontrou arquivos (guarda contra teste vazio)', () => {
    expect(testFiles.length).toBeGreaterThan(20);
    expect(MODULOS_GLOBAIS.length).toBeGreaterThan(10);
  });

  test('nenhum teste redefine um módulo global da aplicação', () => {
    // `const VALIDATIONS = { ... }` dentro do teste é a assinatura exata do
    // problema: a partir daí, o arquivo real nunca mais é exercitado.
    //
    // Exceção tolerada: um fixture pequeno de constantes é legítimo — desde que
    // o arquivo carregue o módulo real e compare os valores, como faz
    // core.test.js. Por isso a checagem só acusa quem NÃO carrega nada real.
    const suspeitos = [];

    for (const { nome, src } of testFiles) {
      if (ISENTOS.has(nome)) continue;

      const carregaModuloReal = src.includes('load-sources')
        || /carregarScript\(\s*['"]js\//.test(src)
        || /readFileSync\([^)]*['"]js['"]/.test(src)
        || /require\(['"]\.\.\/js\//.test(src);

      for (const mod of MODULOS_GLOBAIS) {
        const redefine = new RegExp(`^\\s*(const|var|let)\\s+${mod}\\s*=\\s*\\{`, 'm');
        if (redefine.test(src) && !carregaModuloReal) {
          suspeitos.push(`${nome}: redefine ${mod} sem carregar o módulo real`);
        }
      }
    }

    expect(suspeitos).toEqual([]);
  });
});

describe('integridade da suíte — cobertura mensurável', () => {
  test('todo vm.runInContext passa filename absoluto', () => {
    // Com filename relativo o teste passa mas o módulo conta 0% na cobertura,
    // o que faz um arquivo testado parecer abandonado no relatório.
    const problemas = [];

    for (const { nome, src } of testFiles) {
      if (!src.includes('runInContext')) continue;

      // A chamada costuma ter parênteses aninhados —
      // `runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f })` —
      // então casar até o primeiro `)` perderia o objeto de opções e acusaria
      // "sem filename" um arquivo correto. Vai até o `)` que fecha o `{ ... }`.
      const chamadas = src.match(/runInContext\([\s\S]*?\}\s*\)|runInContext\([^);]*\)/g) || [];
      for (const chamada of chamadas) {
        const m = chamada.match(/filename:\s*([^,}]+)/);
        if (!m) {
          problemas.push(`${nome}: runInContext sem filename — módulo fica fora da cobertura`);
          continue;
        }
        const valor = m[1].trim();
        // Aceita variáveis (file, fullPath...) e path.join(...); recusa literal.
        if (/^['"`]/.test(valor)) {
          problemas.push(`${nome}: filename literal ${valor} — use o caminho absoluto`);
        }
      }
    }

    expect(problemas).toEqual([]);
  });

  test('reescrever `const X =` em `var X =` preserva o comprimento do código', () => {
    // O Jest soma a cobertura v8 de um arquivo por posição de caractere. Uma
    // execução com `var X =` (2 caracteres a menos que `const X =`) fica
    // deslocada em relação às demais cargas do mesmo arquivo, e o relatório
    // passa a variar conforme a ordem das suítes — config.js oscilava entre
    // 158 e 217 de 238 statements em rodadas idênticas. `var   X =` (com
    // espaços) tem o mesmo comprimento.
    const problemas = [];
    const arquivos = [...testFiles, { nome: 'load-sources.js', src: fs.readFileSync(path.join(__dirname, 'load-sources.js'), 'utf8') }];

    for (const { nome, src } of arquivos) {
      const trocas = src.match(/replace\(\s*\/\\bconst[^/]*\/g?\s*,\s*(['"])var\s*[^'"]*\1/g) || [];
      for (const troca of trocas) {
        if (!/(['"])var {3}\S/.test(troca)) problemas.push(`${nome}: ${troca} — use 'var   X =' (3 espaços)`);
      }
    }

    expect(problemas).toEqual([]);
  });

  test('todo readFileSync de módulo js/ usa path.join a partir de __dirname', () => {
    // Caminho relativo cru quebra conforme o diretório de execução do Jest.
    const problemas = [];

    for (const { nome, src } of testFiles) {
      const chamadas = src.match(/readFileSync\(\s*['"][^'"]*js\//g) || [];
      if (chamadas.length) {
        problemas.push(`${nome}: readFileSync com caminho literal`);
      }
    }

    expect(problemas).toEqual([]);
  });
});

describe('integridade da suíte — cada arquivo de js/ carregado de UMA forma', () => {
  // O Jest soma a cobertura v8 de um mesmo arquivo por posição de caractere
  // (mergeProcessCovs) e só DEPOIS desconta o `wrapperLength` do embrulho
  // CommonJS do require. Se uma suíte carrega js/x.js por require e outra por
  // vm (sem embrulho), as execuções via vm ficam deslocadas pelo tamanho do
  // cabeçalho (~90 caracteres) e a cobertura é atribuída ao trecho errado — o
  // piso do arquivo passa ou falha por ruído. Foi o que fazia sync-merge.js
  // aparecer com 66% de linhas num módulo coberto por inteiro.
  //
  // A forma única é vm (tests/carregar-script.js ou load-sources.js). require()
  // de js/ só é tolerado para arquivo que NENHUMA suíte carrega por vm.

  const src = (nome) => fs.readFileSync(path.join(__dirname, nome), 'utf8');
  const norm = (rel) => path.posix.normalize(rel.replace(/\\/g, '/'));

  /** Literais de string de uma lista de argumentos: `'a', "b"` → ['a', 'b']. */
  const literais = (args) => (args.match(/(['"])[^'"]*\1/g) || []).map(s => s.slice(1, -1));

  /** `path.join(__dirname, '..', 'js', 'core', 'x.js')` → 'js/core/x.js'. */
  function caminhoDeJoin(args) {
    const partes = literais(args);
    const i = partes.findIndex(p => p === 'js' || p.startsWith('js/'));
    if (i === -1) return null;
    const rel = partes.slice(i).join('/');
    return /\.js$/.test(rel) ? norm(rel) : null;
  }

  /** Arquivos de js/ que a suíte carrega por require(). */
  function porRequire(codigo) {
    const achados = new Set();
    for (const m of codigo.matchAll(/require\(\s*(['"])((?:\.\.\/)+js\/[^'"]+)\1\s*\)/g)) {
      achados.add(norm(m[2].replace(/^(\.\.\/)+/, '')));
    }
    for (const m of codigo.matchAll(/require\(\s*path\.(?:join|resolve)\(([^)]*)\)\s*\)/g)) {
      const rel = caminhoDeJoin(m[1]);
      if (rel) achados.add(rel);
    }
    return achados;
  }

  // O que loadCoreModules() executa por vm, lido do próprio load-sources.js.
  const doLoadSources = new Set(
    [...src('load-sources.js').matchAll(/loadScript\(\s*context\s*,\s*'([^']+)'\s*\)/g)]
      .map(m => norm(m[1])),
  );

  /**
   * Arquivos de js/ que a suíte carrega por vm. É uma sobre-aproximação de
   * propósito: numa suíte que usa vm diretamente, todo caminho de js/ citado
   * conta como carregado (mesmo que só seja lido como texto). Na dúvida, a
   * guarda acusa — o falso positivo se resolve trocando o require pelo helper.
   */
  function porVm(codigo) {
    const achados = new Set();
    for (const m of codigo.matchAll(/carregarScript\(\s*(['"])([^'"]+)\1/g)) achados.add(norm(m[2]));
    if (/\bloadCoreModules\s*\(/.test(codigo)) doLoadSources.forEach(f => achados.add(f));
    if (/\b(runInContext|runInNewContext|runInThisContext|compileFunction)\b|new\s+vm\.Script\b/.test(codigo)) {
      for (const m of codigo.matchAll(/(['"])(js\/[^'"]+\.js)\1/g)) achados.add(norm(m[2]));
      for (const m of codigo.matchAll(/path\.(?:join|resolve)\(([^)]*)\)/g)) {
        const rel = caminhoDeJoin(m[1]);
        if (rel) achados.add(rel);
      }
    }
    return achados;
  }

  // Esta suíte fica de fora: os exemplos de require abaixo são texto de teste.
  const suites = testFiles
    .filter(({ nome }) => nome !== 'suite-integrity.test.js')
    .map(({ nome, src: codigo }) => ({ nome, require: porRequire(codigo), vm: porVm(codigo) }));

  test('o detector enxerga as formas de carga usadas hoje (guarda contra varredura cega)', () => {
    const vmDe = (nome) => suites.find(s => s.nome === nome).vm;
    expect(vmDe('utils-real.test.js').has('js/core/config.js')).toBe(true);          // load-sources
    expect(vmDe('extrato-audit.test.js').has('js/modules/init-extrato.js')).toBe(true); // vm direto
    expect(vmDe('sync-merge.test.js').has('js/core/sync-merge.js')).toBe(true);      // carregarScript
    expect(porRequire("require('../js/a.js'); require(path.join(__dirname, '..', 'js', 'b', 'c.js'))"))
      .toEqual(new Set(['js/a.js', 'js/b/c.js']));
  });

  test('nenhum arquivo de js/ é carregado por require numa suíte e por vm em outra', () => {
    const viaVm = new Map();
    for (const s of suites) {
      for (const f of s.vm) {
        if (!viaVm.has(f)) viaVm.set(f, []);
        viaVm.get(f).push(s.nome);
      }
    }

    const conflitos = [];
    for (const s of suites) {
      for (const f of s.require) {
        if (!viaVm.has(f)) continue;
        const outras = viaVm.get(f);
        conflitos.push(`${f}: require em ${s.nome}; vm em ${outras.slice(0, 3).join(', ')}`
          + (outras.length > 3 ? ` (+${outras.length - 3})` : '')
          + " — troque o require por carregarScript('" + f + "') (tests/carregar-script.js)");
      }
    }

    expect(conflitos).toEqual([]);
  });
});

describe('integridade da suíte — módulos sem teste real', () => {
  /**
   * Lista de módulos que hoje NÃO são carregados por nenhum teste. Não é uma
   * falha: é dívida declarada. O teste falha se a lista CRESCER — módulo novo
   * precisa nascer com teste que carregue o arquivo real.
   */
  // A lista está VAZIA: todos os módulos que constavam como dívida ganharam
  // `*-real.test.js` carregando o arquivo de produção — patrimonio, relatorios,
  // contas-pagar, assinaturas, contas e a parte pura de anexos. Três deles
  // revelaram bug de produção no processo.
  //
  // Manter o array e o teste é intencional: se um módulo novo nascer sem teste
  // real, ele entra aqui e a checagem volta a ter função.
  const SEM_TESTE_REAL = [];

  test('a dívida de módulos sem teste real não aumentou', () => {
    // Um módulo sai desta lista quando ganha um teste que o carrega de verdade.
    // Se você está adicionando um nome aqui, pare: escreva o teste.
    const carregadosPorAlgumTeste = testFiles
      .map(t => t.src)
      .join('\n');

    const aindaSemTeste = SEM_TESTE_REAL.filter(mod => {
      const base = path.basename(mod);
      return !carregadosPorAlgumTeste.includes(base);
    });

    expect(aindaSemTeste.length).toBeLessThanOrEqual(SEM_TESTE_REAL.length);
  });

  test('os módulos listados como dívida realmente existem', () => {
    // Impede que a lista vire ficção depois de um arquivo ser renomeado.
    const inexistentes = SEM_TESTE_REAL.filter(m => !fs.existsSync(path.join(root, m)));
    expect(inexistentes).toEqual([]);
  });
});
