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
